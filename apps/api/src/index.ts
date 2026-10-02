import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Server } from 'socket.io';
import { loadConfig } from './config';
import { DockerAdapter } from './docker';
import { Storage } from './storage';
import { Manager } from './manager';
import { createApp } from './app';
import { ProfileRepository } from './profiles';

const config = loadConfig();
const storage = new Storage(config);
await storage.init();
// An exclusive process lock prevents two panels from editing the same saves.
const lockPath = path.join(config.historyDir, 'manager.lock');
try {
  const old = JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid: number };
  let alive = false;
  try {
    process.kill(old.pid, 0);
    alive = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') alive = true;
  }
  if (alive) throw new Error('Outro painel ja esta usando estes saves. Feche-o antes de iniciar.');
  await fs.unlink(lockPath);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const lock = await fs.open(lockPath, 'wx');
await lock.writeFile(JSON.stringify({ pid: process.pid }));
await lock.close();
const docker = new DockerAdapter(config);
const profiles = new ProfileRepository(config);
await profiles.init(docker, storage);
const manager = new Manager(docker, storage, profiles);
await manager.init();
const local = createApp(manager);
const http = createServer(local.app);
const io = new Server(http, {
  serveClient: false,
  allowRequest: (req, callback) =>
    callback(
      null,
      local.hosts.has(req.headers.host || '') &&
        (!req.headers.origin || local.origins.has(req.headers.origin)),
    ),
});
io.use((socket, next) =>
  local.validToken(socket.handshake.auth.token)
    ? next()
    : next(new Error('Sessao local invalida.')),
);
io.on('connection', (socket) => {
  void manager.current().then((snapshot) => socket.emit('snapshot', snapshot));
});
manager.on('snapshot', (snapshot) => io.emit('snapshot', snapshot));
manager.on('operation', (operation) => io.emit('operation', operation));
manager.on('diagnostic', (message) => console.error(message));
const poll = setInterval(() => {
  void manager.refresh().catch((error) => console.error(error.message));
}, 5000);
const daily = setInterval(() => {
  void manager.dailyTick().catch((error) => console.error(error.message));
}, 60_000);
await new Promise<void>((resolve, reject) => {
  http.once('error', reject);
  http.listen(config.port, '127.0.0.1', resolve);
});
console.log(`Painel pessoal: http://127.0.0.1:${config.port}`);
console.log('Fechar o painel nao encerra o servidor. Backups diarios exigem o painel aberto.');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(poll);
  clearInterval(daily);
  await manager.shutdown();
  io.close();
  http.close();
  await fs.unlink(lockPath).catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => {
  void close();
});
process.on('SIGTERM', () => {
  void close();
});
