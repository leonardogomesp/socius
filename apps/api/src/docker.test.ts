import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { parseBytes, runCommand, JoinCodeCache, DockerAdapter } from './docker';
import { fixture } from './test-helper';
import { redact } from './config';
describe('Docker boundaries', () => {
  it('does not attribute another world container or its logs to the selected profile', async () => {
    const { storage, directory } = await fixture();
    try {
      const adapter = new DockerAdapter(storage.config);
      vi.spyOn(adapter, 'inspect').mockResolvedValue({
        Id: 'a'.repeat(64),
        Config: { Labels: {}, Env: ['WORLD_NAME=AnotherWorld'] },
        State: { Running: true, Status: 'running', StartedAt: '', ExitCode: 0, OOMKilled: false },
      });
      expect(await adapter.logs()).toEqual([]);
      expect((await adapter.status()).state).toBe('unavailable');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
  it('keeps the join code when logs roll over and clears it for a new session', () => {
    const cache = new JoinCodeCache();
    expect(
      cache.read('first', [{ timestamp: 'now', text: 'Session with join code 123456 is active' }]),
    ).toBe('123456');
    expect(cache.read('first', [{ timestamp: 'now', text: 'World saved' }])).toBe('123456');
    expect(cache.read('second', [])).toBeNull();
  });
  it('parses decimal and binary memory units', () => {
    expect(parseBytes('1.5GiB')).toBe(1.5 * 1024 ** 3);
    expect(parseBytes('512 MB')).toBe(512e6);
    expect(parseBytes('invalid')).toBeNull();
  });
  it('redacts passwords', () => {
    expect(redact('secret-value -password other SERVER_PASS=third', 'secret-value')).toBe(
      '[senha removida] -password [senha removida] SERVER_PASS=[senha removida]',
    );
  });
  it('times out an unresponsive executable', async () => {
    await expect(
      runCommand(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], {
        cwd: process.cwd(),
        timeout: 50,
      }),
    ).rejects.toThrow('tempo de espera');
  });
  it('reports a missing executable', async () => {
    await expect(
      runCommand('socius-command-does-not-exist', [], { cwd: process.cwd() }),
    ).rejects.toThrow('Docker nao encontrado');
  });
});
