import type {
  AiHealthResponse,
  AiSearchHit,
  ButtonAction,
  DatabaseView,
  DatabaseViewConfig,
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
  QueryRequest,
  QueryResponse,
} from '@continuum/shared';

/** Compact view summary returned by the views list endpoint. */
export interface ViewSummary {
  id: string;
  name: string;
  isDefault: boolean;
  locked: boolean;
  position: string;
  layoutType: string;
  updatedAt: string;
}

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
  /**
   * Saved Database Views (Notion-class table/board/calendar/… per kind).
   *
   * Definitions live under `/api/kinds/:kindId/views[/:viewId]`; the row
   * query endpoint at `/api/kinds/:kindId/query` returns paginated notes
   * with their resolved property values + group buckets + calc-row totals.
   */
  views: {
    /** List view tabs for a kind (compact summary, no config blob). */
    list: (kindId: string) =>
      http<ViewSummary[]>(`/kinds/${kindId}/views`),
    /** Fetch one full view (config blob inflated). */
    get: (kindId: string, viewId: string) =>
      http<DatabaseView>(`/kinds/${kindId}/views/${viewId}`),
    /** Create a new view. When `config` is omitted the server uses defaults. */
    create: (kindId: string, data: { name: string; config?: DatabaseViewConfig }) =>
      http<DatabaseView>(`/kinds/${kindId}/views`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** Patch a view (any of name, locked, isDefault, config). */
    update: (
      kindId: string,
      viewId: string,
      data: Partial<{ name: string; locked: boolean; isDefault: boolean; config: DatabaseViewConfig }>,
    ) =>
      http<DatabaseView>(`/kinds/${kindId}/views/${viewId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    /** Delete a view (refuses to remove the last view of a kind). */
    remove: (kindId: string, viewId: string) =>
      http<void>(`/kinds/${kindId}/views/${viewId}`, { method: 'DELETE' }),
    /** Duplicate a view (server suffixes the name with " (copy)"). */
    duplicate: (kindId: string, viewId: string) =>
      http<DatabaseView>(`/kinds/${kindId}/views/${viewId}/duplicate`, {
        method: 'POST',
      }),
    /** Persist a complete LexoRank ordering for the kind's view tabs. */
    reorder: (kindId: string, ids: string[]) =>
      http<ViewSummary[]>(`/kinds/${kindId}/views/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    /** Execute a view query (returns one paginated page of rows + facets). */
    query: (kindId: string, body: QueryRequest) =>
      http<QueryResponse>(`/kinds/${kindId}/query`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    /**
     * Export the result of a view query as a CSV file. The server walks
     * the query to completion (capped at 5000 rows) and returns the file
     * as a `text/csv; charset=utf-8` blob with a `Content-Disposition`
     * attachment header. The caller is responsible for triggering the
     * browser download (see `useCsvExport` on the web side).
     */
    exportCsv: async (kindId: string, body: QueryRequest): Promise<Blob> => {
      const res = await fetch(`${BASE}/kinds/${kindId}/export.csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`CSV export failed: ${res.status}`);
      return res.blob();
    },
  },
};

export type { ButtonAction };
