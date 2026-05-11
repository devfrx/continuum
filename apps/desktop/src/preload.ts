/**
 * Continuum Electron preload script.
 *
 * Currently a no-op. The renderer is online-only and reaches the Fastify
 * server on localhost:3001 via fetch + Hocuspocus WS. If/when filesystem
 * or native dialog access is required, expose a typed surface via:
 *
 *   import { contextBridge } from 'electron';
 *   contextBridge.exposeInMainWorld('continuum', { ... });
 *
 * Maintain contextIsolation=true and nodeIntegration=false in main.ts.
 */
export {};

