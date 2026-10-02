import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Profile, ProfileInput, ProfileSettings } from '@valheim/contracts';
import type { Config } from './config';
import type { DockerPort } from './docker';
import { AppError } from './errors';
import { Storage, atomicJson, exists, inventory, validateWorld } from './storage';

export const worldNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[\p{L}\p{N}_ -]+$/u)
  .refine((name) => !/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name), 'Nome reservado pelo Windows.');
export const settingsSchema = z
  .object({
    serverName: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .refine((name) => !/[\r\n\0]/.test(name)),
    port: z.number().int().min(1024).max(65534),
    crossplay: z.boolean(),
    public: z.boolean(),
    password: z
      .string()
      .min(5)
      .max(64)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
    worldName: worldNameSchema.optional(),
    worldId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

interface Catalog {
  version: 1;
  activeProfileId: string | null;
  profiles: Profile[];
  passwordKeys?: Record<string, string>;
}
const profileIdSchema = z.string().uuid();

export class ProfileRepository {
  private catalog: Catalog = { version: 1, activeProfileId: null, profiles: [] };
  private secrets: Record<string, string> = {};
  private readonly catalogFile: string;
  private readonly secretsFile: string;

  constructor(private readonly config: Config) {
    this.catalogFile = path.join(config.data, 'profiles.json');
    this.secretsFile = path.join(config.data, 'secrets/passwords.json');
  }

  get activeId() {
    return this.catalog.activeProfileId;
  }
  list() {
    return this.catalog.profiles.map((profile) => ({ ...profile }));
  }
  get(id: string) {
    profileIdSchema.parse(id);
    const profile = this.catalog.profiles.find((item) => item.id === id);
    if (!profile) throw new AppError('Perfil de mundo nao encontrado.', 404);
    return { ...profile };
  }
  password(id: string) {
    this.get(id);
    const password = this.secrets[this.catalog.passwordKeys?.[id] || id];
    if (!password)
      throw new AppError('Senha do perfil indisponivel. Confira a recuperacao no README.');
    return password;
  }
  validate(input: ProfileInput, id?: string) {
    const settings = settingsSchema.parse(input);
    const password = settings.password || (id ? this.password(id) : '');
    if (!password) throw new AppError('Defina uma senha para este mundo.');
    if (settings.serverName.includes(password))
      throw new AppError('O nome do servidor nao pode conter a senha.');
    if (settings.port === this.config.port || settings.port + 1 === this.config.port) {
      throw new AppError('Escolha portas diferentes da porta do painel.');
    }
    return settings;
  }
  paths(id: string) {
    profileIdSchema.parse(id);
    const directory = path.join(this.config.data, 'profiles', id);
    return {
      directory,
      config: path.join(directory, 'config'),
      worlds: path.join(directory, 'config/worlds_local'),
      backups: path.join(directory, 'backups'),
    };
  }
  scopedConfig(profile: Profile): Config {
    const paths = this.paths(profile.id);
    return {
      ...this.config,
      profileId: profile.id,
      worldName: profile.worldName,
      worldDir: paths.worlds,
      backupDir: paths.backups,
      dockerEnv: { ...this.config.dockerEnv },
    };
  }

  async init(docker: DockerPort, legacyStorage: Storage) {
    if (await exists(this.catalogFile)) {
      const catalog = JSON.parse(await fs.readFile(this.catalogFile, 'utf8')) as Catalog;
      if (catalog.version !== 1 || !Array.isArray(catalog.profiles))
        throw new AppError('Catalogo de perfis invalido.');
      for (const profile of catalog.profiles) {
        profileIdSchema.parse(profile.id);
        worldNameSchema.parse(profile.worldName);
        settingsSchema.parse({
          serverName: profile.serverName,
          port: profile.port,
          crossplay: profile.crossplay,
          public: profile.public,
        });
      }
      const secrets = JSON.parse(await fs.readFile(this.secretsFile, 'utf8')) as Record<
        string,
        string
      >;
      for (const profile of catalog.profiles) {
        const key = catalog.passwordKeys?.[profile.id] || profile.id;
        if (typeof secrets[key] !== 'string' || secrets[key].length < 5)
          throw new AppError('Arquivo de senhas incompleto.');
      }
      this.catalog = catalog;
      this.secrets = secrets;
      if (this.activeId) this.apply(this.activeId);
      await this.cleanLegacyEnvironment();
      return;
    }

    if (await legacyStorage.hasWorld()) {
      const wasRunning = (await docker.inspect())?.State.Running === true;
      if (wasRunning) await docker.stop();
      await legacyStorage.create('recovery');
      const id = randomUUID();
      const profile: Profile = {
        id,
        worldName: this.config.worldName,
        serverName: this.config.serverName,
        port: Number(this.config.dockerEnv.SERVER_PORT),
        crossplay: this.config.crossplay,
        public: this.config.dockerEnv.SERVER_PUBLIC === 'true',
        source: 'migrated',
        generated: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastStartedAt: null,
      };
      this.validate({ ...this.publicSettings(profile), password: this.config.password });
      const paths = this.paths(id);
      await fs.mkdir(paths.directory, { recursive: true });
      await this.copyVerified(path.join(this.config.data, 'config'), paths.config);
      await this.copyVerified(this.config.backupDir, paths.backups);
      for (const backup of await new Storage(this.scopedConfig(profile)).list()) {
        const file = path.join(paths.backups, backup.id, 'manifest.json');
        const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
        await atomicJson(file, { ...manifest, profileId: id });
      }
      this.catalog = { version: 1, profiles: [profile], activeProfileId: id };
      this.secrets = { [id]: this.config.password };
      await this.persist();
      this.apply(id);
      await this.cleanLegacyEnvironment();
      if (wasRunning) await docker.start();
      return;
    }
    await this.persist();
    await this.cleanLegacyEnvironment();
  }

  private publicSettings(profile: ProfileSettings) {
    return {
      serverName: profile.serverName,
      port: profile.port,
      crossplay: profile.crossplay,
      public: profile.public,
    };
  }
  private async copyVerified(source: string, destination: string) {
    const before = await inventory(source);
    await fs.cp(source, destination, { recursive: true });
    if (JSON.stringify(before) !== JSON.stringify(await inventory(destination))) {
      throw new AppError('Falha na verificacao da migracao. Dados antigos preservados.');
    }
  }
  private async persist() {
    // Credentials are appended before the catalog commits its reference.
    // A failed catalog write therefore cannot replace the previous password.
    await atomicJson(this.secretsFile, this.secrets);
    await atomicJson(this.catalogFile, this.catalog);
  }
  private async cleanLegacyEnvironment() {
    if (!(await exists(this.config.envPath))) return;
    const original = await fs.readFile(this.config.envPath, 'utf8');
    const cleaned = original
      .split(/\r?\n/)
      .filter(
        (line) =>
          !/^(SERVER_NAME|WORLD_NAME|SERVER_PASS|SERVER_PORT|CROSSPLAY|SERVER_PUBLIC)=/.test(line),
      );
    const temporary = this.config.envPath + '.migration.tmp';
    await fs.writeFile(temporary, cleaned.join('\n'), 'utf8');
    await fs.rename(temporary, this.config.envPath);
  }

  async create(input: ProfileInput, source: Profile['source'], worldName: string) {
    const settings = this.validate(input);
    worldNameSchema.parse(worldName);
    if (
      this.list().some(
        (profile) => profile.worldName.toLocaleLowerCase() === worldName.toLocaleLowerCase(),
      )
    ) {
      throw new AppError('Este mundo ja possui um perfil no Socius.', 409);
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    const profile: Profile = {
      ...this.publicSettings(settings),
      id,
      worldName,
      source,
      generated: source !== 'new',
      createdAt: now,
      updatedAt: now,
      lastStartedAt: null,
    };
    const storage = new Storage(this.scopedConfig(profile));
    await storage.init();
    if (source === 'local') await storage.importWorld(input.worldId!);
    this.secrets[id] = settings.password!;
    this.catalog.passwordKeys ??= {};
    this.catalog.passwordKeys[id] = id;
    this.catalog.profiles.push(profile);
    try {
      await this.persist();
    } catch (error) {
      this.catalog.profiles = this.catalog.profiles.filter((item) => item.id !== id);
      delete this.secrets[id];
      delete this.catalog.passwordKeys[id];
      throw error;
    }
    return profile;
  }
  async update(id: string, input: ProfileInput) {
    const current = this.get(id);
    const settings = this.validate(input, id);
    const updated = {
      ...current,
      ...this.publicSettings(settings),
      updatedAt: new Date().toISOString(),
    };
    const index = this.catalog.profiles.findIndex((profile) => profile.id === id);
    const previousKey = this.catalog.passwordKeys?.[id] || id;
    this.catalog.profiles[index] = updated;
    if (settings.password) {
      const key = randomUUID();
      this.secrets[key] = settings.password;
      this.catalog.passwordKeys ??= {};
      this.catalog.passwordKeys[id] = key;
    }
    try {
      await this.persist();
    } catch (error) {
      this.catalog.profiles[index] = current;
      this.catalog.passwordKeys ??= {};
      this.catalog.passwordKeys[id] = previousKey;
      throw error;
    }
    if (this.activeId === id) this.apply(id);
  }
  async activate(id: string) {
    this.get(id);
    const previous = this.activeId;
    this.catalog.activeProfileId = id;
    try {
      await this.persist();
    } catch (error) {
      this.catalog.activeProfileId = previous;
      throw error;
    }
    this.apply(id);
  }
  apply(id: string) {
    const profile = this.get(id);
    const paths = this.paths(id);
    Object.assign(this.config, {
      profileId: id,
      worldName: profile.worldName,
      serverName: profile.serverName,
      password: this.password(id),
      crossplay: profile.crossplay,
      worldDir: paths.worlds,
      backupDir: paths.backups,
    });
    Object.assign(this.config.dockerEnv, {
      CONFIG_DIR: paths.config.replaceAll('\\', '/'),
      SERVER_NAME: profile.serverName,
      WORLD_NAME: profile.worldName,
      SERVER_PASS: this.password(id),
      SERVER_PORT: String(profile.port),
      QUERY_PORT: String(profile.port + 1),
      CROSSPLAY: String(profile.crossplay),
      SERVER_PUBLIC: String(profile.public),
    });
  }
  async markStarted(id: string) {
    const index = this.catalog.profiles.findIndex((profile) => profile.id === id);
    this.catalog.profiles[index].lastStartedAt = new Date().toISOString();
    this.catalog.profiles[index].generated = await new Storage(
      this.scopedConfig(this.get(id)),
    ).hasWorld();
    await this.persist();
  }
  redact(text: string) {
    for (const password of Object.values(this.secrets))
      text = text.split(password).join('[senha removida]');
    return text;
  }
  async ensureStartable(id: string) {
    const profile = this.get(id);
    const worlds = this.paths(id).worlds;
    if (profile.source === 'new' && !profile.generated && (await fs.readdir(worlds)).length === 0)
      return;
    await validateWorld(worlds, profile.worldName);
  }
}
