import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { promises as fs } from 'node:fs';
import { createApp } from './app';
import { Manager } from './manager';
import type { DockerPort } from './docker';
import { fixture } from './test-helper';
let directory: string;
let local: ReturnType<typeof createApp>;
let manager: Manager;
beforeAll(async () => {
  const value = await fixture();
  directory = value.directory;
  const docker: DockerPort = {
    inspect: async () => null,
    start: async () => {},
    stop: async () => {},
    logs: async () => [],
    status: async () => ({
      profileId: null,
      state: 'missing',
      serverName: 'Test',
      worldName: 'TestWorld',
      crossplay: true,
      cpuPercent: null,
      memoryBytes: null,
      memoryLimitBytes: null,
      startedAt: null,
      joinCode: null,
      message: 'Missing',
      checkedAt: new Date().toISOString(),
    }),
  };
  manager = new Manager(docker, value.storage);
  await manager.init();
  local = createApp(manager, 'a'.repeat(64));
});
afterAll(async () => {
  await manager.waitForIdle();
  await fs.rm(directory, { recursive: true, force: true });
});
describe('Local API boundaries', () => {
  it('rejects unexpected hosts and foreign origins', async () => {
    expect(
      (await request(local.app).get('/api/session').set('Host', 'attacker.example:3000')).status,
    ).toBe(403);
    expect(
      (
        await request(local.app)
          .get('/api/session')
          .set('Host', '127.0.0.1:3000')
          .set('Origin', 'https://attacker.example')
      ).status,
    ).toBe(403);
  });
  it('requires a session and excludes configuration secrets', async () => {
    expect(
      (await request(local.app).get('/api/snapshot').set('Host', 'localhost:3000')).status,
    ).toBe(401);
    const response = await request(local.app)
      .get('/api/snapshot')
      .set('Host', 'localhost:3000')
      .set('x-manager-token', local.token);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('test-secret');
  });
  it('rejects arbitrary commands and path traversal', async () => {
    const response = await request(local.app)
      .post('/api/operations')
      .set('Host', 'localhost:3000')
      .set('x-manager-token', local.token)
      .send({ action: 'exec', command: 'arbitrary' });
    expect(response.status).toBe(400);
    expect(
      (
        await request(local.app)
          .post('/api/operations')
          .set('Host', 'localhost:3000')
          .set('x-manager-token', local.token)
          .send({ action: 'restore', backupId: '../../outside', confirm: true })
      ).status,
    ).toBe(400);
  });
  it('accepts async operations with 202 and an operation id', async () => {
    const response = await request(local.app)
      .post('/api/operations')
      .set('Host', 'localhost:3000')
      .set('x-manager-token', local.token)
      .send({ action: 'stop' });
    expect(response.status).toBe(202);
    expect(response.body.id).toBeTruthy();
    await manager.waitForIdle();
    expect(manager.operations[0].status).toBe('succeeded');
  });
  it('rejects a multibyte invalid session without throwing', async () => {
    expect(local.validToken('é'.repeat(64))).toBe(false);
    expect(
      (
        await request(local.app)
          .get('/api/snapshot')
          .set('Host', 'localhost:3000')
          .set('x-manager-token', 'é'.repeat(64))
      ).status,
    ).toBe(401);
  });
});
