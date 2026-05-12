import type {
  AiHealthResponse,
  AiSearchHit,
  ButtonAction,
  FileRef,
  Folder,
  FolderEffective,
  FolderNode,
  GraphEdge,
  GraphNode,
  KindDefinition,
  Note,
  NoteProperty,
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
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
    /**
     * Wipe every note in the workspace. Server cascades through embeddings
     * and links via FK `ON DELETE CASCADE`. The UI guards this behind the
     * Settings → Danger zone confirmation modal.
     */
    removeAll: () => http<{ ok: true; deleted: number }>(`/notes`, { method: 'DELETE' }),
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
  /**
   * Custom property catalogue (per-kind definitions) and per-note values.
   * Definitions live under `/api/kinds/:kindId/properties` and
   * `/api/properties/:id`; values under `/api/notes/:noteId/properties[/:propId]`.
   */
  properties: {
    /** List all property definitions configured for a kind. */
    listForKind: (kindId: string) =>
      http<PropertyDefinition[]>(`/kinds/${kindId}/properties`),
    /** Create a new property definition for a kind. */
    create: (
      kindId: string,
      data: {
        label: string;
        type: PropertyType;
        key?: string;
        icon?: string | null;
        description?: string | null;
        config?: PropertyConfig;
        position?: string;
      },
    ) =>
      http<PropertyDefinition>(`/kinds/${kindId}/properties`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** Patch a definition (label, icon, description, config, position). */
    update: (
      id: string,
      data: Partial<{
        label: string;
        icon: string | null;
        description: string | null;
        config: PropertyConfig;
        position: string;
      }>,
    ) =>
      http<PropertyDefinition>(`/properties/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    /** Persist the complete display order for a kind's property definitions. */
    reorder: (kindId: string, ids: string[]) =>
      http<PropertyDefinition[]>(`/kinds/${kindId}/properties/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    /** Delete a definition (cascades all stored values). */
    remove: (id: string) =>
      http<{ ok: true }>(`/properties/${id}`, { method: 'DELETE' }),
    /** List every property + current value for a note. */
    listForNote: (noteId: string) =>
      http<NoteProperty[]>(`/notes/${noteId}/properties`),
    /** Set / update one value. Sending an empty value clears it server-side. */
    setValue: (noteId: string, propertyId: string, value: PropertyValue) =>
      http<{ ok: true; value: PropertyValue | null }>(
        `/notes/${noteId}/properties/${propertyId}`,
        { method: 'PUT', body: JSON.stringify(value) },
      ),
    /** Explicitly clear a value (equivalent to setValue with an empty value). */
    clearValue: (noteId: string, propertyId: string) =>
      http<{ ok: true }>(`/notes/${noteId}/properties/${propertyId}`, {
        method: 'DELETE',
      }),
    /**
     * Trigger a `button` property's configured action server-side. The
     * server returns the updated target value when the action mutates a
     * property (e.g. set-property / increment-property); for `open-url`
     * the server returns `null` and the client opens the URL itself.
     */
    runButton: (noteId: string, propertyId: string) =>
      http<{
        ok: true;
        result: { targetPropertyId: string; value: PropertyValue | null } | null;
      }>(`/notes/${noteId}/properties/${propertyId}/run`, { method: 'POST' }),
  },
  /**
   * File uploads backing the `files` property type. Multipart upload via
   * a bare `fetch` (we can't use the json-only `http` helper because the
   * body is a `FormData`).
   */
  uploads: {
    /** Upload a single file and return the persisted reference. */
    create: async (file: File): Promise<FileRef> => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await fetch(`${BASE}/uploads`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as FileRef;
    },
    /** Delete an uploaded file from disk by id. */
    remove: (id: string) =>
      http<{ ok: true }>(`/uploads/${id}`, { method: 'DELETE' }),
  },
};

export type { ButtonAction };
