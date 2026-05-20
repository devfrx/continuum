/**
 * File upload endpoint backing the `files` property type.
 *
 * Files are stored on the server filesystem under `env.UPLOADS_DIR` (the
 * directory is created on demand). Each upload receives a UUID and is
 * stored at `<uploadsDir>/<uuid>/<safe-name>`. The original file name is
 * sanitised to ASCII-safe, length-bounded text — the canonical name is
 * still kept in the returned `FileRef.name` for display.
 *
 * Storage path layout keeps each file inside its own folder so name
 * collisions across uploads with the same name are impossible without
 * needing a flat naming scheme that hides the original extension.
 *
 * Routes
 * ──────
 *   POST   /api/uploads          multipart/form-data → FileRef
 *   DELETE /api/uploads/:id      remove an uploaded file from disk
 *
 * Static serving (read-only) is wired separately in `server/src/index.ts`.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { resolve, extname, isAbsolute, relative } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import multipart from '@fastify/multipart';
import type { FileRef } from '@continuum/shared';
import { env } from '../config.js';

/** Strip path separators / illegal characters and clamp length. */
function safeName(input: string): string {
  const cleaned = input
    .replace(/[\\/]+/g, '-')
    .replace(/[\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const safe = cleaned === '.' || cleaned === '..' ? 'file' : cleaned;
  return safe.length > 200 ? safe.slice(0, 200) : safe || 'file';
}

/** Resolve the uploads dir relative to the process cwd when not absolute. */
function uploadsRoot(): string {
  return resolve(process.cwd(), env.UPLOADS_DIR);
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel));
}

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: env.UPLOADS_MAX_BYTES, files: 1 },
    throwFileSizeLimit: false,
  });

  await mkdir(uploadsRoot(), { recursive: true });

  app.post('/', async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.badRequest('No file uploaded');

    const id = randomUUID();
    const dir = resolve(uploadsRoot(), id);
    await mkdir(dir, { recursive: true });

    const name = safeName(file.filename || `upload${extname(file.filename || '')}`);
    const target = resolve(dir, name);
    if (!isInside(dir, target)) return reply.badRequest('Path traversal rejected');

    try {
      await pipeline(file.file, createWriteStream(target, { flags: 'wx' }));
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }

    if (file.file.truncated) {
      await rm(dir, { recursive: true, force: true });
      return reply.code(413).send({
        error: 'file-too-large',
        message: `File exceeds the ${env.UPLOADS_MAX_BYTES} byte limit`,
      });
    }

    const stats = await stat(target);

    const ref: FileRef = {
      id,
      name,
      mime: file.mimetype || 'application/octet-stream',
      size: stats.size,
      url: `/api/uploads/${id}/${encodeURIComponent(name)}`,
      uploadedAt: new Date().toISOString(),
    };
    return ref;
  });

  app.delete('/:id', async (req, reply) => {
    const params = req.params as { id?: string };
    const id = params.id ?? '';
    if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
      return reply.badRequest('Invalid upload id');
    }
    const dir = resolve(uploadsRoot(), id);
    if (!isInside(uploadsRoot(), dir)) {
      return reply.badRequest('Path traversal rejected');
    }
    await rm(dir, { recursive: true, force: true });
    return { ok: true };
  });
};
