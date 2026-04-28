import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { aiManager } from './manager.js';

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
  model: z.string().optional(),
  temperature: z.number().optional(),
  stream: z.boolean().optional().default(false),
});

const embedSchema = z.object({
  input: z.union([z.string(), z.array(z.string())]),
});

export const aiRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => aiManager.health());

  app.post('/chat', async (req, reply) => {
    const body = chatSchema.parse(req.body);

    if (body.stream) {
      try {
        const stream = await aiManager.chatStream(body.messages, {
          model: body.model,
          temperature: body.temperature,
        });
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });
        for await (const chunk of stream) {
          reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.warn({ err }, 'AI chat stream failed');
        if (!reply.raw.headersSent) {
          return reply.code(503).send({
            error: 'ai-unavailable',
            message,
            hint: 'No AI provider responded. Start LM Studio or Ollama and try again.',
          });
        }
      }
      return;
    }

    try {
      return await aiManager.chat(body.messages, {
        model: body.model,
        temperature: body.temperature,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn({ err }, 'AI chat failed');
      return reply.code(503).send({
        error: 'ai-unavailable',
        message,
        hint: 'No AI provider responded. Start LM Studio or Ollama and try again.',
      });
    }
  });

  app.post('/embed', async (req, reply) => {
    const { input } = embedSchema.parse(req.body);
    try {
      const vectors = await aiManager.embed(input);
      return { embeddings: vectors };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.warn({ err }, 'AI embed failed');
      return reply.code(503).send({
        error: 'ai-unavailable',
        message,
        hint: 'No AI provider responded. Start LM Studio or Ollama and try again.',
      });
    }
  });
};
