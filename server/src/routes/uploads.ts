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
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
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
  return cleaned.length > 200 ? cleaned.slice(0, 200) : cleaned || 'file';
}

/** Resolve the uploads dir relative to the process cwd when not absolute. */
function uploadsRoot(): string {
  return resolve(process.cwd(), env.UPLOADS_DIR);
}

export const uploadRoutes: FastifyPluginAsync = async (app) => {
  await app.register(multipart, {
    limits: { fileSize: env.UPLOADS_MAX_BYTES, files: 1 },
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

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      await rm(dir, { recursive: true, force: true });
      return reply.code(413).send({
        error: 'file-too-large',
        message: `File exceeds the ${env.UPLOADS_MAX_BYTES} byte limit`,
      });
    }
    await writeFile(target, buffer);
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
    if (!dir.startsWith(uploadsRoot())) {
      return reply.badRequest('Path traversal rejected');
    }
    await rm(dir, { recursive: true, force: true });
    return { ok: true };
  });
};
