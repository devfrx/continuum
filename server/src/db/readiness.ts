import { setTimeout as sleep } from 'node:timers/promises';
import { sql } from './client.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_INTERVAL_MS = 1_000;

const TRANSIENT_DB_CODES = new Set([
  '57P03', // cannot_connect_now: Postgres is still starting up.
  '53300', // too_many_connections: can clear during container startup.
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
]);

type DatabaseReadyLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

type WaitForDatabaseOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  logger?: DatabaseReadyLogger;
};

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTransientDatabaseError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && TRANSIENT_DB_CODES.has(code)) return true;

  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes('database system is starting up') ||
    message.includes('connection refused') ||
    message.includes('connection terminated') ||
    message.includes('connect econnrefused') ||
    message.includes('timeout')
  );
}

/**
 * Wait until Postgres accepts a trivial query before startup code touches DB tables.
 */
export async function waitForDatabase(options: WaitForDatabaseOptions = {}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const startedAt = Date.now();
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;

    try {
      await sql`select 1`;
      if (attempt > 1) options.logger?.info('Postgres is ready');
      return;
    } catch (error) {
      lastError = error;

      if (!isTransientDatabaseError(error)) throw error;

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(timeoutMs - elapsedMs, 0);
      const message = getErrorMessage(error);

      options.logger?.warn(
        `Waiting for Postgres (${attempt}, ${Math.ceil(remainingMs / 1000)}s left): ${message}`,
      );

      await sleep(Math.min(intervalMs, remainingMs));
    }
  }

  const lastMessage = lastError ? ` Last error: ${getErrorMessage(lastError)}` : '';
  throw new Error(
    `Postgres did not become ready within ${Math.ceil(timeoutMs / 1000)}s.` +
      ` Start it with "pnpm docker:up" or use "pnpm start" for the full dev bootstrap.` +
      lastMessage,
  );
}