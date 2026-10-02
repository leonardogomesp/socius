import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Storage } from './storage';
import { Manager } from './manager';
import type { DockerPort, Inspection } from './docker';
import type { ServerStatus } from '@valheim/contracts';
import { fixture, writeWorld } from './test-helper';
let directory: string;
let storage: Storage;
let manager: Manager;
let running: boolean;
let docker: DockerPort;
const info = (): Inspection => ({
  Id: 'a'.repeat(64),
  Config: { Labels: {} },
  State: {
    Running: running,
    Status: running ? 'running' : 'exited',
    StartedAt: new Date().toISOString(),
    ExitCode: 0,
    OOMKilled: false,
  },
});
beforeEach(async () => {
  const value = await fixture();
  directory = value.directory;
  storage = value.storage;
  await writeWorld(storage.config.worldDir);
  running = true;
  docker = {
    inspect: vi.fn(async () => info()),
    start: vi.fn(async () => {
      running = true;
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
    logs: vi.fn(async () => []),
    status: vi.fn(async (): Promise<ServerStatus> => ({
      profileId: null,
      state: running ? 'ready' : 'stopped',
      serverName: 'Test',
      worldName: 'TestWorld',
      crossplay: true,
      cpuPercent: null,
      memoryBytes: null,
      memoryLimitBytes: null,
      startedAt: null,
      joinCode: null,
      message: 'test',
      checkedAt: new Date().toISOString(),
    })),
  };
  manager = new Manager(docker, storage);
  await manager.init();
});
afterEach(async () => {
  await manager.waitForIdle();
  vi.useRealTimers();
  await fs.rm(directory, { recursive: true, force: true });
});
describe('Manager operations', () => {
  it('serializes operations, stops before copying and resumes only if previously running', async () => {
    const create = vi.spyOn(storage, 'create').mockImplementation(async () => {
      expect(running).toBe(false);
      return {
        id: 'b-test',
        profileId: null,
        createdAt: new Date().toISOString(),
        kind: 'manual',
        worldName: 'TestWorld',
        sizeBytes: 1,
        fileCount: 2,
      };
    });
    manager.submit({ action: 'backup' });
    expect(() => manager.submit({ action: 'stop' })).toThrow('andamento');
    await manager.waitForIdle();
    expect(create).toHaveBeenCalledOnce();
    expect(docker.start).toHaveBeenCalledOnce();
    expect(manager.operations[0].status).toBe('succeeded');
    running = false;
    vi.mocked(docker.start).mockClear();
    manager.submit({ action: 'backup' });
    await manager.waitForIdle();
    expect(docker.start).not.toHaveBeenCalled();
  });
  it('keeps the server stopped after copy failure and redacts secrets', async () => {
    vi.spyOn(storage, 'create').mockRejectedValue(new Error('disk full test-secret'));
    manager.submit({ action: 'backup' });
    await manager.waitForIdle();
    expect(running).toBe(false);
    expect(docker.start).not.toHaveBeenCalled();
    expect(manager.operations[0].message).not.toContain('test-secret');
    expect(manager.operations[0].status).toBe('failed');
  });
  it('does not stop a working server for a corrupt restore source', async () => {
    const backup = await storage.create('manual');
    await fs.writeFile(
      path.join(storage.config.backupDir, backup.id, 'worlds/TestWorld.db'),
      'corrupt',
    );
    manager.submit({ action: 'restore', backupId: backup.id, confirm: true });
    await manager.waitForIdle();
    expect(docker.stop).not.toHaveBeenCalled();
    expect(running).toBe(true);
  });
  it('requires confirmation and retains recovery copy after restore failure', async () => {
    expect(() => manager.submit({ action: 'restore', backupId: 'b-test' })).toThrow('Confirme');
    const backup = await storage.create('manual');
    vi.spyOn(storage, 'restore').mockRejectedValue(new Error('copy failed'));
    manager.submit({ action: 'restore', backupId: backup.id, confirm: true });
    await manager.waitForIdle();
    expect(manager.operations[0].recoveryId).toBeTruthy();
    expect((await storage.list()).filter((b) => b.kind === 'recovery')).toHaveLength(1);
    expect(running).toBe(false);
  });
  it('does not copy when Docker is unavailable or shutdown times out', async () => {
    const create = vi.spyOn(storage, 'create');
    vi.mocked(docker.inspect).mockRejectedValueOnce(new Error('Docker unavailable'));
    manager.submit({ action: 'backup' });
    await manager.waitForIdle();
    expect(create).not.toHaveBeenCalled();
    vi.mocked(docker.stop).mockRejectedValueOnce(new Error('shutdown timeout'));
    manager.submit({ action: 'backup' });
    await manager.waitForIdle();
    expect(create).not.toHaveBeenCalled();
  });
  it('runs once daily after 04h Brasilia and skips duplicate backups', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-02T08:00:00Z'));
    await manager.dailyTick(new Date('2026-10-02T06:00:00Z'));
    expect(manager.operations).toHaveLength(0);
    await manager.dailyTick();
    await manager.waitForIdle();
    expect(manager.operations).toHaveLength(1);
    await manager.dailyTick(new Date('2026-10-02T12:00:00Z'));
    await manager.waitForIdle();
    expect(manager.operations).toHaveLength(1);
  });
});
