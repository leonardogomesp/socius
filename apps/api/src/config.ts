import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import dotenv from 'dotenv';
import { z } from 'zod';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
const envPath = path.join(root, '.env');
dotenv.config({ path: envPath });

const installationSchema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  BACKUP_HOUR: z.coerce.number().int().min(0).max(23).default(4),
  VALHEIM_IMAGE: z
    .string()
    .regex(/^ghcr\.io\/community-valheim-tools\/valheim-server@sha256:[a-f0-9]{64}$/),
  IMPORT_ROOT: z.string().optional(),
  DATA_DIR: z.string().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const installation = installationSchema.parse(env);
  const data = path.resolve(
    installation.DATA_DIR ||
      (process.platform === 'win32' ? path.join(os.homedir(), 'Socius') : path.join(root, 'data')),
  );
  const password = env.SERVER_PASS || '';
  const serverName = env.SERVER_NAME || 'Socius';
  const worldName = env.WORLD_NAME || 'Dedicated';
  const dockerEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
    VALHEIM_IMAGE: installation.VALHEIM_IMAGE,
    DATA_DIR: data.replaceAll('\\', '/'),
    CONFIG_DIR: path.join(data, 'config').replaceAll('\\', '/'),
    SERVER_NAME: serverName,
    WORLD_NAME: worldName,
    SERVER_PASS: password || 'unconfigured',
    SERVER_PORT: env.SERVER_PORT || '2456',
    QUERY_PORT: String(Number(env.SERVER_PORT || 2456) + 1),
    CROSSPLAY: env.CROSSPLAY || 'true',
    SERVER_PUBLIC: env.SERVER_PUBLIC || 'false',
  };
  return {
    root,
    envPath,
    data,
    worldDir: path.join(data, 'config/worlds_local'),
    backupDir: path.join(data, 'backups'),
    historyDir: path.join(data, 'history'),
    importRoot: path.resolve(
      installation.IMPORT_ROOT ||
        path.join(os.homedir(), 'AppData/LocalLow/IronGate/Valheim/worlds_local'),
    ),
    serverName,
    worldName,
    password,
    profileId: null as string | null,
    crossplay: env.CROSSPLAY !== 'false',
    port: installation.PORT,
    backupHour: installation.BACKUP_HOUR,
    dockerEnv,
  };
}
export type Config = ReturnType<typeof loadConfig>;

export function redact(text: string, password: string) {
  const masked = password ? text.split(password).join('[senha removida]') : text;
  return masked.replace(
    /(-password\s+|SERVER_PASS\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi,
    '$1[senha removida]',
  );
}
