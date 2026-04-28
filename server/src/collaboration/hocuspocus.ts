import {
  Server,
  type onLoadDocumentPayload,
  type onStoreDocumentPayload,
} from '@hocuspocus/server';
import * as Y from 'yjs';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { documents } from '../db/schema.js';
import { env } from '../config.js';

let server: Server | null = null;

export async function startHocuspocus(): Promise<Server> {
  if (server) return server;

  server = new Server({
    name: 'continuum-collab',
    port: env.HOCUSPOCUS_PORT,
    address: env.HOCUSPOCUS_HOST,

    async onLoadDocument({ documentName, document }: onLoadDocumentPayload) {
      const [row] = await db
        .select()
        .from(documents)
        .where(eq(documents.name, documentName))
        .limit(1);
      if (row) Y.applyUpdate(document, new Uint8Array(row.state));
      return document;
    },

    async onStoreDocument({ documentName, document }: onStoreDocumentPayload) {
      const update = Y.encodeStateAsUpdate(document);
      const buf = Buffer.from(update);
      await db
        .insert(documents)
        .values({ name: documentName, state: buf })
        .onConflictDoUpdate({
          target: documents.name,
          set: { state: buf, updatedAt: sql`now()` },
        });
    },
  });

  await server.listen();
  return server;
}

export async function stopHocuspocus() {
  await server?.destroy();
  server = null;
}
