import { ProviderManager, type ProviderConfig } from '@continuum/ai-client';
import { env } from '../config.js';

const providers: ProviderConfig[] = [
  {
    name: 'lmstudio',
    baseUrl: env.AI_LMSTUDIO_BASE_URL,
    apiKey: env.AI_LMSTUDIO_API_KEY,
    chatModel: env.AI_LMSTUDIO_CHAT_MODEL,
    embedModel: env.AI_LMSTUDIO_EMBED_MODEL,
  },
  {
    name: 'ollama',
    baseUrl: env.AI_OLLAMA_BASE_URL,
    apiKey: env.AI_OLLAMA_API_KEY,
    chatModel: env.AI_OLLAMA_CHAT_MODEL,
    embedModel: env.AI_OLLAMA_EMBED_MODEL,
  },
];

export const aiManager = new ProviderManager({
  primary: env.AI_PRIMARY_PROVIDER,
  fallback: env.AI_FALLBACK_PROVIDER,
  providers,
});
