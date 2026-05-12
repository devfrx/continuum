import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import fastifyStatic from '@fastify/static';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from './config.js';
import { aiRoutes } from './ai/routes.js';
import { noteRoutes } from './routes/notes.js';
import { linkRoutes } from './routes/links.js';
import { kindRoutes } from './routes/kinds.js';
import { folderRoutes } from './routes/folders.js';
import { propertyRoutes } from './routes/properties.js';
import { uploadRoutes } from './routes/uploads.js';
import { ensureDatabaseSchema } from './db/schemaMaintenance.js';
import { seedKinds } from './db/seed.js';
import { waitForDatabase } from './db/readiness.js';
import { startHocuspocus } from './collaboration/hocuspocus.js';

async function start() {
  const app = Fastify({
    logger: {
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: env.CORS_ORIGIN.split(',') });

  // Read-only file server for the `files` property type uploads. The path
  // is configurable via UPLOADS_DIR; created on first boot if missing.
  const uploadsRoot = resolve(process.cwd(), env.UPLOADS_DIR);
  await mkdir(uploadsRoot, { recursive: true });
  await app.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: '/api/uploads/',
    decorateReply: false,
    index: false,
  });

  app.get('/health', async () => ({
    ok: true,
    name: 'continuum-server',
    env: env.NODE_ENV,
    time: new Date().toISOString(),
  }));

  await app.register(aiRoutes, { prefix: '/api/ai' });
  await app.register(noteRoutes, { prefix: '/api/notes' });
  await app.register(linkRoutes, { prefix: '/api/links' });
  await app.register(kindRoutes, { prefix: '/api/kinds' });
  await app.register(folderRoutes, { prefix: '/api/folders' });
  // Properties span both kinds and notes, so they mount at the bare /api root.
  await app.register(propertyRoutes, { prefix: '/api' });
  await app.register(uploadRoutes, { prefix: '/api/uploads' });

  try {
    await waitForDatabase({ logger: app.log });
    await ensureDatabaseSchema();
    const { inserted } = await seedKinds();
    if (inserted > 0) app.log.info(`Seeded ${inserted} default kinds`);
    await app.listen({ host: env.SERVER_HOST, port: env.SERVER_PORT });
    await startHocuspocus();
    app.log.info(`Hocuspocus listening on ws://${env.HOCUSPOCUS_HOST}:${env.HOCUSPOCUS_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
