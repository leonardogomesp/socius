import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config';
import { redact } from './config';
import { AppError } from './errors';
import type { LogLine, ServerStatus } from '@valheim/contracts';

export interface Inspection {
  Id: string;
  Config: { Labels: Record<string, string>; Env?: string[] };
  State: {
    Running: boolean;
    Status: string;
    StartedAt: string;
    ExitCode: number;
    OOMKilled: boolean;
    Health?: { Status: string };
  };
}
export interface DockerPort {
  inspect(): Promise<Inspection | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
  logs(): Promise<LogLine[]>;
  status(): Promise<ServerStatus>;
}
export function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeout?: number; includeStderr?: boolean },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      windowsHide: true,
      shell: false,
    });
    let output = '',
      error = '',
      expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill();
    }, options.timeout ?? 15000);
    child.stdout.on('data', (chunk) => {
      output = (output + chunk).slice(-2_000_000);
    });
    child.stderr.on('data', (chunk) => {
      error = (error + chunk).slice(-100_000);
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(
        new AppError(
          e.message.includes('ENOENT')
            ? 'Docker nao encontrado. Instale e abra o Docker Desktop.'
            : e.message,
          503,
        ),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (expired)
        reject(
          new AppError(
            'Docker excedeu o tempo de espera. Confira o estado antes de tentar novamente.',
            504,
          ),
        );
      else if (code !== 0)
        reject(new AppError(error.trim() || output.trim() || 'Falha ao executar Docker.', 503));
      else resolve((output + (options.includeStderr ? '\n' + error : '')).trim());
    });
  });
}
export class DockerAdapter implements DockerPort {
  private joinCodes = new JoinCodeCache();
  constructor(private config: Config) {}
  private async run(args: string[], timeout?: number) {
    const candidates =
      process.platform === 'win32'
        ? [
            ...(process.env.LOCALAPPDATA
              ? [
                  path.join(
                    process.env.LOCALAPPDATA,
                    'Programs/DockerDesktop/resources/bin/docker.exe',
                  ),
                ]
              : []),
            ...(process.env.ProgramFiles
              ? [path.join(process.env.ProgramFiles, 'Docker/Docker/resources/bin/docker.exe')]
              : []),
          ]
        : [];
    const binary = candidates.find((file) => existsSync(file)) || 'docker';
    try {
      return await runCommand(binary, args, {
        cwd: this.config.root,
        env: this.config.dockerEnv,
        timeout,
        includeStderr: args[0] === 'logs',
      });
    } catch (e) {
      throw new AppError(
        redact(e instanceof Error ? e.message : String(e), this.config.password),
        e instanceof AppError ? e.status : 503,
      );
    }
  }
  private compose(args: string[], timeout?: number) {
    return this.run(
      [
        'compose',
        '--project-name',
        'valheim-personal',
        '--env-file',
        this.config.envPath,
        '-f',
        'compose.yaml',
        ...args,
      ],
      timeout,
    );
  }
  async inspect() {
    // Ask the daemon first: a missing container is different from an unreachable daemon.
    const os = await this.run(['info', '--format', '{{.OSType}}']);
    if (os !== 'linux') throw new AppError('Selecione containers Linux no Docker Desktop.', 503);
    const id = await this.run([
      'ps',
      '--all',
      '--filter',
      'name=^valheim-personal-server$',
      '--format',
      '{{.ID}}',
    ]);
    if (!id) return null;
    if (!/^[a-f0-9]{12,64}$/.test(id))
      throw new AppError('Identificador inesperado do container.', 503);
    const result = JSON.parse(await this.run(['inspect', id]))[0] as Inspection;
    const labels = result.Config.Labels;
    if (
      labels['dev.leonardogomes.valheim-manager'] !== 'true' ||
      labels['com.docker.compose.project'] !== 'valheim-personal' ||
      labels['com.docker.compose.service'] !== 'valheim'
    ) {
      throw new AppError('O container nao pertence a este projeto. Operacao recusada.', 409);
    }
    return result;
  }
  async start() {
    await this.inspect();
    await this.compose(['up', '-d', '--pull', 'missing', 'valheim'], 20 * 60_000);
  }
  async stop() {
    const before = await this.inspect();
    if (!before?.State.Running) return;
    await this.compose(['stop', '-t', '120', 'valheim'], 150_000);
    const after = await this.inspect();
    if (after?.State.Running)
      throw new AppError('O servidor continua ativo. Nenhum arquivo sera copiado.', 409);
    if (after?.State.ExitCode === 137 || after?.State.OOMKilled)
      throw new AppError(
        'Encerramento forcado detectado. Confira o mundo antes de copiar ou restaurar.',
        409,
      );
  }
  async logs() {
    const info = await this.inspect();
    if (!info) return [];
    const world = configuredWorld(info);
    if (world && world !== this.config.worldName) return [];
    const args = ['logs', '--timestamps', '--tail', '200'];
    // Avoid treating a previous session's join code as current.
    if (info.State.Running && !info.State.StartedAt.startsWith('0001'))
      args.push('--since', info.State.StartedAt);
    const text = await this.run([...args, info.Id]);
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\S+)\s+(.*)$/);
        return {
          timestamp: match?.[1] || new Date().toISOString(),
          text: redact(match?.[2] || line, this.config.password),
        };
      });
  }
  async status(): Promise<ServerStatus> {
    const base = {
      profileId: this.config.profileId,
      serverName: this.config.serverName,
      worldName: this.config.worldName,
      crossplay: this.config.crossplay,
      cpuPercent: null,
      memoryBytes: null,
      memoryLimitBytes: null,
      startedAt: null,
      joinCode: null,
      checkedAt: new Date().toISOString(),
    };
    try {
      const info = await this.inspect();
      if (!info)
        return {
          ...base,
          state: 'missing',
          message: 'Docker disponivel. Importe seu mundo antes de iniciar.',
        };
      if (!info.State.Running)
        return {
          ...base,
          state: 'stopped',
          message: info.State.OOMKilled
            ? 'O servidor parou por falta de memoria.'
            : 'Servidor desligado. Seu mundo permanece salvo.',
        };
      const world = configuredWorld(info);
      if (world && world !== this.config.worldName) {
        return {
          ...base,
          state: 'unavailable',
          message:
            'O container esta executando outro mundo. Confira o servidor antes de continuar.',
        };
      }
      const state =
        info.State.Health?.Status === 'healthy'
          ? 'ready'
          : info.State.Health?.Status === 'unhealthy'
            ? 'unhealthy'
            : 'starting';
      const result: ServerStatus = {
        ...base,
        state,
        startedAt: info.State.StartedAt,
        message:
          state === 'ready'
            ? 'Pronto para receber jogadores.'
            : state === 'unhealthy'
              ? 'A verificacao de disponibilidade falhou. Consulte os logs.'
              : 'Preparando o servidor. O primeiro download pode demorar.',
      };
      try {
        const raw = JSON.parse(
          await this.run(['stats', '--no-stream', '--format', '{{json .}}', info.Id], 10000),
        );
        const [used, limit] = String(raw.MemUsage).split('/');
        result.cpuPercent = Number.parseFloat(raw.CPUPerc) || 0;
        result.memoryBytes = parseBytes(used);
        result.memoryLimitBytes = parseBytes(limit);
      } catch {
        /* Metrics may be temporarily unavailable during startup. */
      }
      if (state === 'ready') {
        const lines = await this.logs();
        result.joinCode = this.joinCodes.read(`${info.Id}:${info.State.StartedAt}`, lines);
      }
      return result;
    } catch (error) {
      return {
        ...base,
        state: 'unavailable',
        message: error instanceof Error ? error.message : 'Docker indisponivel.',
      };
    }
  }
}
export function configuredWorld(info: Inspection) {
  return info.Config.Env?.find((value) => value.startsWith('WORLD_NAME='))?.slice(
    'WORLD_NAME='.length,
  );
}

export class JoinCodeCache {
  private key = '';
  private value: string | null = null;
  read(key: string, lines: LogLine[]) {
    if (key !== this.key) {
      this.key = key;
      this.value = null;
    }
    for (const line of lines) {
      const match = line.text.match(/join code\s*[:=]?\s*(\d{6})/i);
      if (match) this.value = match[1];
    }
    return this.value;
  }
}
export function parseBytes(value: string | undefined): number | null {
  const match = value?.trim().match(/^([\d.]+)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB|TB|TiB)$/);
  if (!match) return null;
  const units: Record<string, number> = {
    B: 1,
    kB: 1000,
    KB: 1000,
    KiB: 1024,
    MB: 1e6,
    MiB: 1024 ** 2,
    GB: 1e9,
    GiB: 1024 ** 3,
    TB: 1e12,
    TiB: 1024 ** 4,
  };
  return Number(match[1]) * units[match[2]];
}
