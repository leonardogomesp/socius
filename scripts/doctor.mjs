import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
const candidates = [
  ...(process.env.LOCALAPPDATA
    ? [path.join(process.env.LOCALAPPDATA, 'Programs/DockerDesktop/resources/bin/docker.exe')]
    : []),
  ...(process.env.ProgramFiles
    ? [path.join(process.env.ProgramFiles, 'Docker/Docker/resources/bin/docker.exe')]
    : []),
];
const docker = process.platform === 'win32' ? candidates.find(existsSync) || 'docker' : 'docker';
let failed = false;
for (const [label, command, args] of [
  ['Node', process.execPath, ['--version']],
  ...(process.platform === 'win32' ? [['WSL', 'wsl', ['--version']]] : []),
  ['Docker', docker, ['version']],
  ['Compose', docker, ['compose', 'version']],
  ['Containers Linux', docker, ['info', '--format', '{{.OSType}}']],
]) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const text = `${result.stdout || ''}${result.stderr || ''}`.replace(/\0/g, '');
  console.log(
    `\n${label}: ${result.status === 0 ? 'OK' : 'PENDENTE'}\n${text.trim() || result.error?.message || 'Sem resposta'}`,
  );
  if (result.status !== 0 || (label === 'Containers Linux' && result.stdout.trim() !== 'linux'))
    failed = true;
}
console.log(
  '\nSe o WSL nao iniciar: habilite virtualizacao Intel na BIOS/UEFI, instale WSL 2 e reinicie o Windows. Abra Docker Desktop depois.',
);
process.exitCode = failed ? 1 : 0;
