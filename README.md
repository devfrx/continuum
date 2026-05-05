# cont\nuum

> **cont\nuum** (read: *continuum*) — the `\` glyph is rendered as a stylized
> "i" by the brand typeface *Hanley Pro Sans*. In plain text/ASCII contexts
> it is safe to write **continuum**.

AI-first knowledge base for worldbuilding, lore, characters, classes, races and any kind of personal documentation. Designed to be faster and more flexible than Obsidian, with native local-AI integration via **LM Studio** (primary) and **Ollama** (fallback).

## Stack

| Layer        | Tech                                                       |
|--------------|------------------------------------------------------------|
| Web frontend | Vue 3 + Vite + TypeScript + Pinia + vue-router             |
| Desktop      | Electron 33 (wraps the same web app)                       |
| Backend      | Node.js + Fastify 5 + Zod                                  |
| Database     | PostgreSQL 16 + `pgvector` (HNSW cosine index)             |
| ORM          | Drizzle ORM                                                |
| AI clients   | `openai` SDK against OpenAI-compatible `/v1` endpoints     |
| Editor       | TipTap (planned) — Markdown + WYSIWYG with Y.js collab     |
| Graph        | Sigma.js 3 (planned) + optional Three.js force-graph 3D    |
| Storage      | MinIO (S3-compatible) for files/images                     |
| Cache/PubSub | Redis                                                      |
| Monorepo     | pnpm workspaces + Turborepo                                |

## Repo layout

```
apps/
  web/          # Vue 3 + Vite app (works in browser AND inside Electron)
  desktop/      # Electron shell that loads the web app
packages/
  shared/       # Shared TypeScript types
  ai-client/    # ProviderManager: LM Studio (primary) -> Ollama (fallback)
  editor/       # TipTap wrapper (placeholder)
  graph/        # Sigma.js wrapper (placeholder)
server/         # Fastify API + Drizzle + pgvector RAG
docker-compose.yml  # Postgres + Redis + MinIO
```

## Quick start

Prerequisites: **Node 20+**, **pnpm 9+**, **Docker Desktop**, plus **LM Studio** and/or **Ollama** running locally.

```powershell
# 1. install
pnpm install

# 2. spin up Postgres + Redis + MinIO
pnpm docker:up

# 3. configure env
copy .env.example .env

# 4. generate & apply DB migrations
cd server
pnpm db:generate
pnpm db:migrate
cd ..

# 5. start backend, web app, and (optionally) Electron in parallel
pnpm dev
```

The web app is served at <http://localhost:5174>, the API at <http://localhost:3001>.

## AI configuration

Both LM Studio and Ollama expose **OpenAI-compatible** endpoints, so the same `openai` SDK is used for both — only `baseURL` changes.

| Provider   | Default base URL                     | Notes                                   |
|------------|--------------------------------------|-----------------------------------------|
| LM Studio  | `http://localhost:1234/v1`           | Primary. Configure model in LM Studio.  |
| Ollama     | `http://localhost:11434/v1`          | Fallback. `ollama pull llama3.2` first. |

The server tries the **primary** first; on network failure or unreachability, it automatically falls back to the secondary. See [server/src/ai/manager.ts](server/src/ai/manager.ts) and [packages/ai-client/src/provider-manager.ts](packages/ai-client/src/provider-manager.ts).

### RAG flow

1. On note create/update, the backend computes embeddings via the active provider's `/v1/embeddings` endpoint.
2. Embeddings are stored in `embeddings.embedding` (pgvector column with HNSW cosine index).
3. `POST /api/notes/search { query }` embeds the query and returns the top-K closest notes.
4. Your local AI agent can call the same endpoint to get worldbuilding context to inject into prompts.

## API endpoints

- `GET /health` — server liveness
- `GET /api/ai/health` — provider status + available models for both providers
- `POST /api/ai/chat` — chat completion (set `stream: true` for SSE)
- `POST /api/ai/embed` — generate embeddings
- `GET /api/notes` — list notes
- `POST /api/notes` — create note (auto-embeds)
- `PUT /api/notes/:id` — update note (re-embeds)
- `DELETE /api/notes/:id` — delete note
- `POST /api/notes/search` — semantic search via pgvector

## Roadmap

- [x] Monorepo scaffold + Vue/Fastify/Drizzle baseline
- [x] AI Provider Manager with LM Studio primary + Ollama fallback
- [x] pgvector RAG for notes
- [ ] TipTap editor with Markdown ↔ WYSIWYG toggle
- [ ] Y.js + Hocuspocus collaboration server
- [ ] Sigma.js 2D knowledge graph
- [ ] Three.js 3D graph view
- [ ] MCP integration (LM Studio supports MCP via API)
- [ ] Custom entity templates (character / race / class / location...)
- [ ] Dockerized server profile for full self-hosted deploy
