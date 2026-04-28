import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Walk up from this file to find a .env (workspace root).
const here = dirname(fileURLToPath(import.meta.url));
let dir = here;
for (let i = 0; i < 6; i++) {
  const candidate = resolve(dir, '.env');
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
  const parent = dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
// Also try default cwd lookup as a fallback.
loadEnv();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SERVER_HOST: z.string().default('0.0.0.0'),
  SERVER_PORT: z.coerce.number().default(3001),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string(),

  AI_PRIMARY_PROVIDER: z.enum(['lmstudio', 'ollama']).default('lmstudio'),
  AI_FALLBACK_PROVIDER: z.enum(['lmstudio', 'ollama']).default('ollama'),

  AI_LMSTUDIO_BASE_URL: z.string().default('http://localhost:1234/v1'),
  AI_LMSTUDIO_API_KEY: z.string().default('lm-studio'),
  AI_LMSTUDIO_CHAT_MODEL: z.string().optional(),
  AI_LMSTUDIO_EMBED_MODEL: z.string().optional(),

  AI_OLLAMA_BASE_URL: z.string().default('http://localhost:11434/v1'),
  AI_OLLAMA_API_KEY: z.string().default('ollama'),
  AI_OLLAMA_CHAT_MODEL: z.string().default('llama3.2'),
  AI_OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),

  AI_EMBEDDING_DIMENSIONS: z.coerce.number().default(768),

  HOCUSPOCUS_PORT: z.coerce.number().default(1235),
  HOCUSPOCUS_HOST: z.string().default('0.0.0.0'),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
