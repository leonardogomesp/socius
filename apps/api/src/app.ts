import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { Manager } from './manager';
import { AppError } from './errors';
import { redact } from './config';
import { settingsSchema } from './profiles';

const requestSchema = z
  .object({
    action: z.enum([
      'start',
      'stop',
      'restart',
      'backup',
      'restore',
      'import',
      'create-profile',
      'update-profile',
      'activate',
    ]),
    profileId: z.string().uuid().optional(),
    settings: settingsSchema.optional(),
    backupId: z
      .string()
      .regex(/^[br]-[a-f0-9-]{36}$/)
      .optional(),
    worldId: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    confirm: z.boolean().optional(),
  })
  .strict();
export function createApp(manager: Manager, token = randomBytes(32).toString('hex')) {
  const app = express();
  app.disable('x-powered-by');
  const port = manager.storage.config.port;
  const hosts = new Set([
    `localhost:${port}`,
    `127.0.0.1:${port}`,
    'localhost:5173',
    '127.0.0.1:5173',
  ]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));
  function validToken(candidate: unknown) {
    if (typeof candidate !== 'string') return false;
    const received = Buffer.from(candidate);
    const expected = Buffer.from(token);
    return received.length === expected.length && timingSafeEqual(received, expected);
  }
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; frame-ancestors 'none'",
    );
    if (!hosts.has(req.headers.host || ''))
      return res.status(403).json({ error: 'Host nao permitido.' });
    if (req.headers.origin && !origins.has(req.headers.origin))
      return res.status(403).json({ error: 'Origem nao permitida.' });
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.get('/api/session', (_req, res) => res.json({ token }));
  app.use('/api', (req, res, next) => {
    if (!validToken(req.headers['x-manager-token']))
      return res.status(401).json({ error: 'Sessao local invalida. Atualize a pagina.' });
    next();
  });
  const route =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      void fn(req, res).catch(next);
    };
  app.get(
    '/api/snapshot',
    route(async (_req, res) => res.json(await manager.current())),
  );
  app.get(
    '/api/worlds',
    route(async (_req, res) => res.json(await manager.worlds())),
  );
  app.post('/api/profiles', (req, res, next) => {
    try {
      const settings = settingsSchema.parse(req.body);
      if (!!settings.worldId === !!settings.worldName)
        throw new AppError('Escolha um mundo local ou informe o nome de um mundo novo.');
      const operation = manager.submit({
        action: settings.worldId ? 'import' : 'create-profile',
        settings,
        confirm: true,
      });
      res.status(202).json(operation);
    } catch (error) {
      next(error);
    }
  });
  app.put('/api/profiles/:id', (req, res, next) => {
    try {
      const body = z
        .object({ settings: settingsSchema, confirm: z.boolean().optional() })
        .strict()
        .parse(req.body);
      const operation = manager.submit({
        action: 'update-profile',
        profileId: z.string().uuid().parse(req.params.id),
        settings: body.settings,
        confirm: body.confirm,
      });
      res.status(202).json(operation);
    } catch (error) {
      next(error);
    }
  });
  app.get(
    '/api/profiles/:id/password',
    route(async (req, res) => {
      if (!manager.profiles) throw new AppError('Perfis indisponiveis.', 503);
      res.json({ password: manager.profiles.password(z.string().uuid().parse(req.params.id)) });
    }),
  );
  app.post('/api/operations', (req, res, next) => {
    try {
      const operation = manager.submit(requestSchema.parse(req.body));
      res.status(202).json(operation);
    } catch (error) {
      next(error);
    }
  });
  const web = path.join(manager.storage.config.root, 'apps/web/dist');
  if (existsSync(web)) {
    app.use(express.static(web));
    app.get('*', (req, res) =>
      req.path.startsWith('/api/')
        ? res.status(404).json({ error: 'Rota nao encontrada.' })
        : res.sendFile(path.join(web, 'index.html')),
    );
  } else
    app.get('/', (_req, res) =>
      res.status(503).send('Execute npm run build e npm start, ou use npm run dev.'),
    );
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const status =
      error instanceof AppError
        ? error.status
        : error instanceof z.ZodError ||
            (error as { type?: string })?.type === 'entity.parse.failed'
          ? 400
          : 500;
    const message =
      error instanceof z.ZodError
        ? 'Parametros invalidos para esta operacao.'
        : error instanceof Error
          ? error.message
          : 'Erro inesperado.';
    const safeMessage = manager.profiles?.redact(message) ?? message;
    res.status(status).json({ error: redact(safeMessage, manager.storage.config.password) });
  });
  return { app, token, validToken, hosts, origins };
}
