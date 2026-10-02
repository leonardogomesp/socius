import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Storage, inventory, validateWorld } from './storage';
import { fixture, writeWorld } from './test-helper';
let temp: string;
let storage: Storage;
beforeEach(async () => {
  const value = await fixture();
  temp = value.directory;
  storage = value.storage;
});
afterEach(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});
describe('World storage', () => {
  it('rejects incomplete legacy saves', async () => {
    await fs.writeFile(path.join(storage.config.importRoot, 'Broken.fwl'), 'metadata');
    await expect(validateWorld(storage.config.importRoot, 'Broken')).rejects.toThrow('db');
    expect((await storage.candidates()).filter((world) => world.available)).toEqual([]);
  });
  it('imports a copy without changing originals or overwriting a world', async () => {
    await writeWorld(storage.config.importRoot, 'Existing');
    const original = await inventory(storage.config.importRoot);
    const candidates = await storage.candidates();
    await storage.importWorld(candidates[0].id);
    expect(storage.config.worldName).toBe('Existing');
    expect(await inventory(storage.config.importRoot)).toEqual(original);
    expect(await fs.readFile(path.join(storage.config.worldDir, 'Existing.db'), 'utf8')).toBe(
      'original world content',
    );
    await expect(storage.importWorld(candidates[0].id)).rejects.toThrow('nao sobrescreve');
  });
  it('accepts modern saves only with a committed marker', async () => {
    const folder = path.join(storage.config.importRoot, 'Modern');
    await fs.mkdir(folder);
    await fs.writeFile(path.join(folder, 'chunk.dat'), 'chunk');
    expect((await storage.candidates()).filter((world) => world.available)).toEqual([]);
    await fs.writeFile(path.join(folder, '_main.1.ok'), 'save');
    expect((await storage.candidates()).filter((world) => world.available)).toEqual([]);
    for (const extension of ['db2', 'fwl2', 'chunks'])
      await fs.writeFile(path.join(folder, `_main.1.${extension}`), 'data');
    const candidate = (await storage.candidates())[0];
    expect(candidate.layout).toBe('directory');
    await storage.importWorld(candidate.id);
    expect(await fs.readFile(path.join(storage.config.worldDir, 'Modern/chunk.dat'), 'utf8')).toBe(
      'chunk',
    );
  });
  it('detects corruption before changing current saves', async () => {
    await writeWorld(storage.config.worldDir);
    const backup = await storage.create('manual');
    await fs.writeFile(
      path.join(storage.config.backupDir, backup.id, 'worlds/TestWorld.db'),
      'corrupted',
    );
    await expect(storage.restore(backup.id)).rejects.toThrow('integridade');
    expect(await fs.readFile(path.join(storage.config.worldDir, 'TestWorld.db'), 'utf8')).toBe(
      'original world content',
    );
  });
  it('restores bytes and retains seven regular backups plus recovery copies', async () => {
    await writeWorld(storage.config.worldDir);
    const recovery = await storage.create('recovery');
    for (let index = 0; index < 9; index++) await storage.create('manual');
    const backups = await storage.list();
    expect(backups).toHaveLength(8);
    expect(backups.some((b) => b.id === recovery.id)).toBe(true);
    await fs.writeFile(path.join(storage.config.worldDir, 'TestWorld.db'), 'changed world');
    await storage.restore(recovery.id);
    expect(await fs.readFile(path.join(storage.config.worldDir, 'TestWorld.db'), 'utf8')).toBe(
      'original world content',
    );
  });
  it('rejects traversal in IDs and manifests', async () => {
    await writeWorld(storage.config.worldDir);
    await expect(storage.restore('../escape')).rejects.toThrow('invalido');
    const backup = await storage.create('manual');
    const file = path.join(storage.config.backupDir, backup.id, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
    manifest.entries[0].path = '../../outside';
    await fs.writeFile(file, JSON.stringify(manifest));
    await expect(storage.verify(backup.id)).rejects.toThrow('permitida');
  });
});
