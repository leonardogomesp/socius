import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(root, '.env');
const data =
  process.platform === 'win32' ? path.join(os.homedir(), 'Socius') : path.join(root, 'data');
try {
  const example = await fs.readFile(path.join(root, '.env.example'), 'utf8');
  await fs.writeFile(
    target,
    example.replace('DATA_DIR=', `DATA_DIR='${data.replaceAll('\\', '/')}'`),
    { flag: 'wx' },
  );
  console.log('Instalacao configurada. Escolha seu mundo e defina a senha no aplicativo.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.env existente preservado. A migracao ocorre ao iniciar o painel.');
}
