import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './config';
import { Storage } from './storage';
export async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'socius-test-'));
  const config = loadConfig({
    SERVER_PASS: 'test-secret',
    SERVER_NAME: 'Test',
    WORLD_NAME: 'TestWorld',
    VALHEIM_IMAGE: 'ghcr.io/community-valheim-tools/valheim-server@sha256:' + 'a'.repeat(64),
    DATA_DIR: path.join(directory, 'data'),
    IMPORT_ROOT: path.join(directory, 'source'),
  });
  config.root = directory;
  config.envPath = path.join(directory, '.env');
  await fs.writeFile(config.envPath, 'WORLD_NAME=TestWorld\n');
  await fs.mkdir(config.importRoot, { recursive: true });
  const storage = new Storage(config);
  await storage.init();
  return { directory, storage };
}
export async function writeWorld(
  directory: string,
  name = 'TestWorld',
  content = 'original world content',
) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, `${name}.db`), content);
  await fs.writeFile(path.join(directory, `${name}.fwl`), 'metadata content');
}
