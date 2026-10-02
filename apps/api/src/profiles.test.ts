import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import type { ProfileInput, ServerStatus } from '@valheim/contracts';
import type { DockerPort, Inspection } from './docker';
import { ProfileRepository } from './profiles';
import { Storage, inventory } from './storage';
import { Manager } from './manager';
import { createApp } from './app';
import { fixture, writeWorld } from './test-helper';

let directory: string;
let storage: Storage;
let repository: ProfileRepository;
let docker: DockerPort;
let manager: Manager;
let running: boolean;
const settings: ProfileInput = {
  worldName: 'First',
  serverName: 'Socius',
  port: 2456,
  crossplay: true,
  public: false,
  password: 'remember-me',
};

beforeEach(async () => {
  const value = await fixture();
  directory = value.directory;
  storage = value.storage;
  running = false;
  docker = {
    inspect: vi.fn(async (): Promise<Inspection> => ({
      Id: 'a'.repeat(64),
      Config: { Labels: {} },
      State: {
        Running: running,
        Status: running ? 'running' : 'exited',
        StartedAt: new Date().toISOString(),
        ExitCode: 0,
        OOMKilled: false,
      },
    })),
    start: vi.fn(async () => {
      running = true;
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
    logs: vi.fn(async () => []),
    status: vi.fn(async (): Promise<ServerStatus> => ({
      profileId: storage.config.profileId,
      state: running ? 'ready' : 'stopped',
      serverName: storage.config.serverName,
      worldName: storage.config.worldName,
      crossplay: storage.config.crossplay,
      cpuPercent: null,
      memoryBytes: null,
      memoryLimitBytes: null,
      startedAt: null,
      joinCode: null,
      message: 'test',
      checkedAt: new Date().toISOString(),
    })),
  };
  repository = new ProfileRepository(storage.config);
});

afterEach(async () => {
  if (manager) await manager.waitForIdle();
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

async function initialize() {
  await repository.init(docker, storage);
  manager = new Manager(docker, storage, repository);
  await manager.init();
}
async function addWorld(name = 'First') {
  const profile = await repository.create({ ...settings, worldName: name }, 'new', name);
  await writeWorld(repository.paths(profile.id).worlds, name);
  return profile;
}

describe('World profiles', () => {
  it('uses the same operation lock while recording generated-world metadata', async () => {
    await initialize();
    const profile = await addWorld();
    await repository.activate(profile.id);
    running = true;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mark = vi.spyOn(repository, 'markStarted').mockImplementation(async () => {
      await gate;
    });
    const refresh = manager.refresh();
    await vi.waitFor(() => expect(mark).toHaveBeenCalledOnce());
    expect(() => manager.submit({ action: 'stop' })).toThrow('andamento');
    release();
    await refresh;
    expect(manager.busy).toBe(false);
  });
  it('retains the previous password if committing the new catalog fails', async () => {
    await initialize();
    const profile = await addWorld();
    const rename = fs.rename.bind(fs);
    const failingCommit = vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (String(destination) === path.join(storage.config.data, 'profiles.json'))
        throw new Error('catalog commit failed');
      await rename(source, destination);
    });
    await expect(
      repository.update(profile.id, { ...settings, password: 'replacement' }),
    ).rejects.toThrow('catalog commit failed');
    failingCommit.mockRestore();
    const reopened = new ProfileRepository(storage.config);
    await reopened.init(docker, storage);
    expect(reopened.password(profile.id)).toBe('remember-me');
    expect(repository.password(profile.id)).toBe('remember-me');
  });
  it('migrates saves, passwords and backups once, retaining the previous data', async () => {
    await writeWorld(storage.config.worldDir);
    const originalPath = storage.config.worldDir;
    const oldBackupPath = storage.config.backupDir;
    const before = await inventory(originalPath);
    await storage.create('manual');
    running = true;
    await initialize();
    const migrated = repository.list()[0];
    expect(migrated.source).toBe('migrated');
    expect(repository.password(migrated.id)).toBe('test-secret');
    expect(await inventory(originalPath)).toEqual(before);
    expect(await inventory(storage.config.worldDir)).toEqual(before);
    expect((await storage.list()).every((backup) => backup.profileId === migrated.id)).toBe(true);
    expect((await fs.readdir(oldBackupPath)).length).toBeGreaterThan(0);
    expect(await fs.readFile(storage.config.envPath, 'utf8')).not.toContain('WORLD_NAME=');
    expect(docker.stop).toHaveBeenCalledOnce();
    expect(docker.start).toHaveBeenCalledOnce();
    const reopened = new ProfileRepository(storage.config);
    await reopened.init(docker, storage);
    expect(reopened.list()).toHaveLength(1);
    expect(reopened.password(migrated.id)).toBe('test-secret');
    expect(docker.stop).toHaveBeenCalledOnce();
  });

  it('preserves legacy data and stays stopped if migration cannot verify a copy', async () => {
    await writeWorld(storage.config.worldDir);
    const before = await inventory(storage.config.worldDir);
    running = true;
    const copy = vi.spyOn(fs, 'cp').mockRejectedValueOnce(new Error('disk full'));
    await expect(repository.init(docker, storage)).rejects.toThrow('disk full');
    copy.mockRestore();
    expect(running).toBe(false);
    expect(docker.start).not.toHaveBeenCalled();
    expect(await inventory(storage.config.worldDir)).toEqual(before);
    expect(await fs.readFile(storage.config.envPath, 'utf8')).toContain('WORLD_NAME');
  });

  it('remembers configuration and preserves a password when it is not replaced', async () => {
    await initialize();
    const profile = await addWorld();
    await repository.activate(profile.id);
    await repository.update(profile.id, {
      serverName: 'New name',
      port: 3456,
      crossplay: false,
      public: true,
    });
    const reopened = new ProfileRepository(storage.config);
    await reopened.init(docker, storage);
    expect(reopened.get(profile.id)).toMatchObject({
      serverName: 'New name',
      port: 3456,
      crossplay: false,
      public: true,
    });
    expect(reopened.password(profile.id)).toBe('remember-me');
    expect(storage.config.dockerEnv.QUERY_PORT).toBe('3457');
    expect(JSON.stringify(reopened.list())).not.toContain('remember-me');
    await reopened.update(profile.id, {
      serverName: 'New name',
      port: 3456,
      crossplay: false,
      public: true,
      password: 'replacement',
    });
    expect(reopened.password(profile.id)).toBe('replacement');
  });

  it('imports once and retains the managed progress when switching back', async () => {
    await initialize();
    await writeWorld(storage.config.importRoot, 'Imported');
    const original = await inventory(storage.config.importRoot);
    const candidate = (await storage.candidates())[0];
    const imported = await repository.create(
      { ...settings, worldId: candidate.id },
      'local',
      candidate.name,
    );
    const other = await addWorld('Other');
    await repository.activate(imported.id);
    await fs.writeFile(path.join(storage.config.worldDir, 'Imported.db'), 'server progress');
    running = true;
    manager.submit({ action: 'activate', profileId: other.id, confirm: true });
    expect(() => manager.submit({ action: 'stop' })).toThrow('andamento');
    await manager.waitForIdle();
    expect(manager.operations[0].status).toBe('succeeded');
    expect(running).toBe(true);
    manager.submit({ action: 'activate', profileId: imported.id, confirm: true });
    await manager.waitForIdle();
    expect(await fs.readFile(path.join(storage.config.worldDir, 'Imported.db'), 'utf8')).toBe(
      'server progress',
    );
    expect(await inventory(storage.config.importRoot)).toEqual(original);
    expect(repository.password(imported.id)).toBe('remember-me');
    expect((await storage.list()).length).toBeGreaterThan(0);
  });

  it('keeps a stopped server stopped when activating another world', async () => {
    await initialize();
    const first = await addWorld();
    const other = await addWorld('Other');
    await repository.activate(first.id);
    manager.submit({ action: 'activate', profileId: other.id, confirm: true });
    await manager.waitForIdle();
    expect(repository.activeId).toBe(other.id);
    expect(docker.start).not.toHaveBeenCalled();
  });

  it('creates a new world profile and allows generation only for an empty new world', async () => {
    await initialize();
    manager.submit({ action: 'create-profile', settings });
    await manager.waitForIdle();
    const profile = repository.list()[0];
    expect(profile.generated).toBe(false);
    expect(repository.activeId).toBe(profile.id);
    manager.submit({ action: 'start' });
    await manager.waitForIdle();
    expect(docker.start).toHaveBeenCalledOnce();
    await fs.writeFile(path.join(storage.config.worldDir, 'incomplete.db'), 'broken');
    await expect(repository.ensureStartable(profile.id)).rejects.toThrow();
  });

  it('validates ports, incomplete imports and confirmation before stopping a running world', async () => {
    await initialize();
    const profile = await addWorld();
    await repository.activate(profile.id);
    running = true;
    expect(() =>
      manager.submit({
        action: 'update-profile',
        profileId: profile.id,
        settings: { ...settings, port: 65535 },
      }),
    ).toThrow();
    expect(() =>
      manager.submit({
        action: 'update-profile',
        profileId: profile.id,
        settings: { ...settings, port: 3000 },
      }),
    ).toThrow('painel');
    manager.submit({
      action: 'update-profile',
      profileId: profile.id,
      settings: { ...settings, port: 3456 },
    });
    await manager.waitForIdle();
    expect(manager.operations[0].status).toBe('failed');
    expect(docker.stop).not.toHaveBeenCalled();
    await fs.writeFile(path.join(storage.config.importRoot, 'Broken.fwl'), 'metadata');
    const broken = (await storage.candidates())[0];
    expect(broken.available).toBe(false);
    manager.submit({
      action: 'import',
      settings: { ...settings, worldId: broken.id },
      confirm: true,
    });
    await manager.waitForIdle();
    expect(manager.operations[0].status).toBe('failed');
    expect(docker.stop).not.toHaveBeenCalled();
  });

  it('backs up before applying active settings and stays stopped after a backup failure', async () => {
    await initialize();
    const profile = await addWorld();
    await repository.activate(profile.id);
    running = true;
    vi.spyOn(storage, 'create').mockRejectedValueOnce(new Error('copy failed remember-me'));
    manager.submit({
      action: 'update-profile',
      profileId: profile.id,
      settings: { ...settings, port: 3456 },
      confirm: true,
    });
    await manager.waitForIdle();
    expect(running).toBe(false);
    expect(repository.get(profile.id).port).toBe(2456);
    expect(manager.operations[0].message).not.toContain('remember-me');
    expect(docker.start).not.toHaveBeenCalled();
  });

  it('leaves the target selected and both saves intact if startup after switching fails', async () => {
    await initialize();
    const first = await addWorld();
    const other = await addWorld('Other');
    await repository.activate(first.id);
    running = true;
    vi.mocked(docker.start).mockRejectedValueOnce(new Error('Docker failed'));
    manager.submit({ action: 'activate', profileId: other.id, confirm: true });
    await manager.waitForIdle();
    expect(repository.activeId).toBe(other.id);
    expect(running).toBe(false);
    expect(manager.operations[0].status).toBe('failed');
    expect(
      await fs.readFile(path.join(repository.paths(first.id).worlds, 'First.db'), 'utf8'),
    ).toBe('original world content');
  });

  it('isolates retention and rejects a backup copied from another profile', async () => {
    await initialize();
    const first = await addWorld();
    const other = await addWorld('Other');
    const firstStorage = new Storage(repository.scopedConfig(first));
    const otherStorage = new Storage(repository.scopedConfig(other));
    const preserved = await firstStorage.create('manual');
    for (let index = 0; index < 9; index++) await otherStorage.create('manual');
    expect(await firstStorage.list()).toHaveLength(1);
    expect(await otherStorage.list()).toHaveLength(7);
    await fs.cp(
      path.join(firstStorage.config.backupDir, preserved.id),
      path.join(otherStorage.config.backupDir, preserved.id),
      { recursive: true },
    );
    await expect(otherStorage.verify(preserved.id)).rejects.toThrow('outro perfil');
  });

  it('requires a token for password retrieval and never publishes secrets in general responses', async () => {
    await initialize();
    const profile = await addWorld();
    await repository.activate(profile.id);
    await manager.refresh();
    const local = createApp(manager, 'a'.repeat(64));
    const get = (url: string) =>
      request(local.app).get(url).set('Host', 'localhost:3000').set('x-manager-token', local.token);
    const response = await get('/api/worlds');
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('remember-me');
    expect(JSON.stringify((await get('/api/snapshot')).body)).not.toContain('remember-me');
    expect(
      (
        await request(local.app)
          .get(`/api/profiles/${profile.id}/password`)
          .set('Host', 'localhost:3000')
      ).status,
    ).toBe(401);
    expect((await get(`/api/profiles/${profile.id}/password`)).body.password).toBe('remember-me');
  });
});
