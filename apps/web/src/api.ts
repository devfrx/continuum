import type {
  AiHealthResponse,
  AiSearchHit,
  Folder,
  FolderEffective,
  FolderNode,
  GraphEdge,
  GraphNode,
  KindDefinition,
  Note,
} from '@continuum/shared';

export interface BacklinkEntry {
  id: string;
  title: string;
  kind: string;
  snippet: string;
}

const BASE = '/api';

/**
 * Thin wrapper around `fetch` that prefixes the API base and parses JSON.
 *
 * Why we don't always set `Content-Type: application/json`:
 *   Fastify 5's default content-type parser rejects an empty body when the
 *   header is set (`FST_ERR_CTP_EMPTY_JSON_BODY`). Bodyless requests
 *   (typically DELETE / GET) must therefore omit the header entirely.
 *   We only attach it when an actual body is being sent.
 */
async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init.body !== null;
  const headers: HeadersInit = {
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers ?? {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const api = {
  notes: {
    list: () => http<Note[]>('/notes'),
    get: (id: string) => http<Note>(`/notes/${id}`),
    create: (data: Partial<Note>) =>
      http<Note>('/notes', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<Note>) =>
      http<Note>(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => http<{ ok: true }>(`/notes/${id}`, { method: 'DELETE' }),
    search: (query: string) =>
      http<unknown[]>(`/notes/search`, { method: 'POST', body: JSON.stringify({ query }) }),
    semanticSearch: (
      query: string,
      signal?: AbortSignal,
      options?: { folderId?: string | null; recursive?: boolean },
    ) =>
      http<AiSearchHit[]>(`/notes/search`, {
        method: 'POST',
        body: JSON.stringify({
          query,
          ...(options?.folderId !== undefined ? { folderId: options.folderId } : {}),
          ...(options?.recursive !== undefined ? { recursive: options.recursive } : {}),
        }),
        signal,
      }),
    backlinks: (id: string) => http<BacklinkEntry[]>(`/notes/${id}/backlinks`),
    reindex: () =>
      http<{ total: number; ok: number; failed: number }>(`/notes/reindex`, { method: 'POST' }),
    /** Move a single note into a folder (or root with `folderId: null`). */
    move: (id: string, folderId: string | null) =>
      http<Note>(`/notes/${id}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ folderId }),
      }),
    /** Move many notes at once; returns the count actually moved. */
    bulkMove: (ids: string[], folderId: string | null) =>
      http<{ moved: number }>(`/notes/bulk-move`, {
        method: 'POST',
        body: JSON.stringify({ ids, folderId }),
      }),
  },
  links: {
    list: () => http<{ id: string; sourceId: string; targetId: string; type: string }[]>('/links'),
    graph: () => http<GraphPayload>('/links/graph'),
    create: (data: { sourceId: string; targetId: string; type?: string }) =>
      http('/links', { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: string) => http<{ ok: true }>(`/links/${id}`, { method: 'DELETE' }),
  },
  ai: {
    health: () => http<AiHealthResponse>('/ai/health'),
  },
  kinds: {
    list: () => http<KindDefinition[]>('/kinds'),
    create: (data: Partial<KindDefinition>) =>
      http<KindDefinition>('/kinds', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<KindDefinition>) =>
      http<KindDefinition>(`/kinds/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) =>
      http<{ ok: true }>(`/kinds/${id}`, { method: 'DELETE' }),
  },
  folders: {
    /** Forest of `FolderNode` rooted at top-level folders. */
    tree: () => http<FolderNode[]>('/folders'),
    /** Single folder + its inherited (effective) values. */
    get: (id: string) => http<Folder & { effective: FolderEffective }>(`/folders/${id}`),
    create: (data: {
      name: string;
      parentId?: string | null;
      slug?: string;
      defaultKind?: string | null;
      icon?: string | null;
      color?: string | null;
    }) => http<Folder>('/folders', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        slug: string;
        defaultKind: string | null;
        icon: string | null;
        color: string | null;
      }>,
    ) => http<Folder>(`/folders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    move: (
      id: string,
      data: { parentId: string | null; before?: string | null; after?: string | null },
    ) => http<Folder>(`/folders/${id}/move`, { method: 'POST', body: JSON.stringify(data) }),
    remove: (id: string) => http<{ ok: true }>(`/folders/${id}`, { method: 'DELETE' }),
  },
};
