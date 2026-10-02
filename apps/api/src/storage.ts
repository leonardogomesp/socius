import { promises as fs } from 'node:fs';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { Backup, WorldCandidate } from '@valheim/contracts';
import type { Config } from './config';
import { AppError } from './errors';

interface Entry {
  path: string;
  size: number;
  sha256: string;
}
interface Manifest extends Backup {
  entries: Entry[];
}
const backupId = /^[br]-[a-f0-9-]{36}$/;
const validWorld = /^[\p{L}\p{N}_ -]{1,64}$/u;
export async function exists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
export function inside(parent: string, child: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new AppError('Caminho fora da pasta permitida.');
  return child;
}
export async function inventory(directory: string): Promise<Entry[]> {
  const entries: Entry[] = [];
  async function walk(current: string) {
    const info = await fs.lstat(current);
    if (info.isSymbolicLink())
      throw new AppError('Links simbolicos nao sao permitidos em mundos ou backups.');
    if (info.isDirectory()) {
      for (const name of (await fs.readdir(current)).sort())
        await walk(inside(directory, path.join(current, name)));
    } else if (info.isFile()) {
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of createReadStream(current)) {
        hash.update(chunk);
        size += chunk.length;
      }
      entries.push({
        path: path.relative(directory, current).split(path.sep).join('/'),
        size,
        sha256: hash.digest('hex'),
      });
    } else throw new AppError('Tipo de arquivo nao suportado.');
  }
  await walk(directory);
  return entries;
}
export async function validateWorld(directory: string, name: string) {
  if (!validWorld.test(name) || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name))
    throw new AppError('Nome de mundo invalido.');
  const folder = inside(directory, path.join(directory, name));
  if (await exists(folder)) {
    const info = await fs.lstat(folder);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new AppError('Diretorio de mundo invalido.');
    let committed = false;
    for (const filename of await fs.readdir(folder)) {
      const match = filename.match(/^(_main\.\d+)\.ok$/);
      if (!match) continue;
      const files = await Promise.all(
        ['ok', 'db2', 'fwl2', 'chunks'].map((extension) =>
          fs.lstat(path.join(folder, `${match[1]}.${extension}`)).catch(() => null),
        ),
      );
      if (files.every((file) => file?.isFile() && !file.isSymbolicLink() && file.size > 0)) {
        committed = true;
        break;
      }
    }
    if (!committed) {
      throw new AppError(
        'Mundo em diretorio incompleto: nenhum marcador de save confirmado (_main.N.ok).',
      );
    }
    return 'directory' as const;
  }
  for (const extension of ['db', 'fwl']) {
    const file = inside(directory, path.join(directory, `${name}.${extension}`));
    const info = await fs.lstat(file).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isFile() || info.size < 4)
      throw new AppError(`Mundo incompleto: falta um arquivo ${extension} valido.`);
  }
  return 'legacy' as const;
}
export async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, file);
}
export class Storage {
  constructor(public config: Config) {}
  async init() {
    for (const folder of [
      this.config.worldDir,
      this.config.backupDir,
      this.config.historyDir,
      path.join(this.config.data, 'server'),
    ])
      await fs.mkdir(folder, { recursive: true });
  }
  async hasWorld() {
    try {
      await validateWorld(this.config.worldDir, this.config.worldName);
      return true;
    } catch {
      return false;
    }
  }
  async candidates(): Promise<WorldCandidate[]> {
    if (!(await exists(this.config.importRoot))) return [];
    const names = new Set<string>();
    for (const entry of await fs.readdir(this.config.importRoot, { withFileTypes: true })) {
      if (/_backup_/i.test(entry.name)) continue;
      if (entry.isDirectory() && !entry.isSymbolicLink()) names.add(entry.name);
      else if (entry.isFile() && entry.name.endsWith('.fwl')) names.add(entry.name.slice(0, -4));
      else if (entry.isFile() && entry.name.endsWith('.db')) names.add(entry.name.slice(0, -3));
    }
    const worlds: WorldCandidate[] = [];
    for (const name of names) {
      try {
        const layout = await validateWorld(this.config.importRoot, name);
        const sizeBytes =
          layout === 'directory'
            ? (await inventory(path.join(this.config.importRoot, name))).reduce(
                (s, e) => s + e.size,
                0,
              )
            : (await fs.stat(path.join(this.config.importRoot, `${name}.db`))).size +
              (await fs.stat(path.join(this.config.importRoot, `${name}.fwl`))).size;
        worlds.push({
          id: createHash('sha256').update(name).digest('hex'),
          name,
          layout,
          sizeBytes,
          available: true,
        });
      } catch (error) {
        worlds.push({
          id: createHash('sha256').update(name).digest('hex'),
          name,
          layout: null,
          sizeBytes: 0,
          available: false,
          reason: error instanceof Error ? error.message : 'Mundo incompleto.',
        });
      }
    }
    return worlds.sort((a, b) => a.name.localeCompare(b.name));
  }
  async importWorld(id: string) {
    const world = (await this.candidates()).find((w) => w.id === id);
    if (!world?.available) throw new AppError('Mundo nao encontrado ou incompleto.');
    if ((await fs.readdir(this.config.worldDir)).length)
      throw new AppError(
        'A pasta do servidor ja contem arquivos. A importacao nao sobrescreve mundos.',
        409,
      );
    const stage = inside(this.config.data, path.join(this.config.data, `import-${randomUUID()}`));
    await fs.mkdir(stage);
    if (world.layout === 'directory') {
      const source = path.join(this.config.importRoot, world.name);
      const before = await inventory(source);
      await fs.cp(source, path.join(stage, world.name), { recursive: true, dereference: false });
      if (
        JSON.stringify(before) !== JSON.stringify(await inventory(path.join(stage, world.name))) ||
        JSON.stringify(before) !== JSON.stringify(await inventory(source))
      ) {
        throw new AppError('O mundo mudou durante a copia. Feche o jogo e tente novamente.');
      }
      const metadata = path.join(this.config.importRoot, `${world.name}.fwl`);
      if (await exists(metadata)) {
        if ((await fs.lstat(metadata)).isSymbolicLink())
          throw new AppError('Links simbolicos nao sao permitidos.');
        await fs.copyFile(metadata, path.join(stage, `${world.name}.fwl`));
      }
    } else {
      for (const extension of ['db', 'fwl']) {
        const source = path.join(this.config.importRoot, `${world.name}.${extension}`);
        const before = await fs.readFile(source);
        await fs.writeFile(path.join(stage, `${world.name}.${extension}`), before);
        if (!before.equals(await fs.readFile(source)))
          throw new AppError('O mundo mudou durante a copia. Feche o jogo e tente novamente.');
      }
    }
    await validateWorld(stage, world.name);
    await this.replaceWorld(stage);
    // ProfileRepository owns configuration persistence.
    this.config.worldName = world.name;
    this.config.dockerEnv.WORLD_NAME = world.name;
    return world.name;
  }
  async list(): Promise<Backup[]> {
    const result: Backup[] = [];
    for (const name of await fs.readdir(this.config.backupDir)) {
      if (!backupId.test(name)) continue;
      try {
        const manifest = await this.readManifest(name);
        const { entries: _entries, ...summary } = manifest;
        result.push(summary);
      } catch {
        /* Incomplete backups are never offered for restore. */
      }
    }
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  private async readManifest(id: string): Promise<Manifest> {
    if (!backupId.test(id)) throw new AppError('Identificador de backup invalido.');
    const directory = inside(this.config.backupDir, path.join(this.config.backupDir, id));
    if ((await fs.lstat(directory)).isSymbolicLink())
      throw new AppError('Backup com link simbolico recusado.');
    const m = JSON.parse(
      await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'),
    ) as Manifest;
    if (
      m.id !== id ||
      !validWorld.test(m.worldName) ||
      !Array.isArray(m.entries) ||
      !m.entries.length ||
      !['manual', 'daily', 'recovery'].includes(m.kind)
    )
      throw new AppError('Manifesto de backup invalido.');
    for (const entry of m.entries) {
      if (
        !entry.path ||
        entry.path.includes('\\') ||
        !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !Number.isSafeInteger(entry.size) ||
        entry.size < 0
      )
        throw new AppError('Manifesto de backup invalido.');
      inside(path.join(directory, 'worlds'), path.resolve(directory, 'worlds', entry.path));
    }
    return m;
  }
  async verify(id: string) {
    const manifest = await this.readManifest(id);
    if (this.config.profileId && manifest.profileId !== this.config.profileId)
      throw new AppError('Este backup pertence a outro perfil.');
    const actual = await inventory(path.join(this.config.backupDir, id, 'worlds'));
    if (JSON.stringify(actual) !== JSON.stringify(manifest.entries))
      throw new AppError('A integridade do backup falhou. Nenhum save foi alterado.');
    await validateWorld(path.join(this.config.backupDir, id, 'worlds'), manifest.worldName);
    return manifest;
  }
  async create(kind: Backup['kind']): Promise<Backup> {
    await validateWorld(this.config.worldDir, this.config.worldName);
    const id = `${kind === 'recovery' ? 'r' : 'b'}-${randomUUID()}`;
    const stage = inside(this.config.backupDir, path.join(this.config.backupDir, `.pending-${id}`));
    const entries = await inventory(this.config.worldDir);
    await fs.mkdir(stage);
    await fs.cp(this.config.worldDir, path.join(stage, 'worlds'), { recursive: true });
    if (JSON.stringify(entries) !== JSON.stringify(await inventory(path.join(stage, 'worlds'))))
      throw new AppError('Falha na verificacao da copia de backup.');
    const manifest: Manifest = {
      id,
      profileId: this.config.profileId,
      createdAt: new Date().toISOString(),
      kind,
      worldName: this.config.worldName,
      entries,
      sizeBytes: entries.reduce((n, e) => n + e.size, 0),
      fileCount: entries.length,
    };
    await atomicJson(path.join(stage, 'manifest.json'), manifest);
    await fs.rename(stage, inside(this.config.backupDir, path.join(this.config.backupDir, id)));
    // Recovery snapshots are deliberately excluded from automatic retention.
    const normal = (await this.list()).filter((b) => b.kind !== 'recovery');
    for (const old of normal.slice(7))
      await fs.rm(inside(this.config.backupDir, path.join(this.config.backupDir, old.id)), {
        recursive: true,
      });
    const { entries: _entries, ...summary } = manifest;
    return summary;
  }
  async restore(id: string) {
    const manifest = await this.verify(id);
    if (manifest.worldName !== this.config.worldName)
      throw new AppError(
        'Este backup pertence a outro mundo. Restaure manualmente conforme o README.',
      );
    const stage = inside(this.config.data, path.join(this.config.data, `restore-${randomUUID()}`));
    await fs.cp(path.join(this.config.backupDir, id, 'worlds'), stage, { recursive: true });
    if (JSON.stringify(await inventory(stage)) !== JSON.stringify(manifest.entries))
      throw new AppError('Falha na verificacao da restauracao.');
    await this.replaceWorld(stage);
  }
  private async replaceWorld(stage: string) {
    inside(this.config.data, stage);
    inside(this.config.data, this.config.worldDir);
    const retired = inside(
      this.config.backupDir,
      path.join(this.config.backupDir, `.previous-${randomUUID()}`),
    );
    await fs.rename(this.config.worldDir, retired);
    try {
      await fs.rename(stage, this.config.worldDir);
    } catch (error) {
      await fs.rename(retired, this.config.worldDir);
      throw error;
    }
    // Keep the former directory as another recovery copy; never auto-delete it.
  }
}
