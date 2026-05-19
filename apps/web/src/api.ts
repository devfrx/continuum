import type {
  AiHealthResponse,
  AiSearchHit,
  ButtonAction,
  Database,
  DatabaseBundle,
  DatabaseCreateInput,
  DatabaseQueryRequest,
  DatabaseQueryResponse,
  DatabaseRow,
  DatabaseRowCreateInput,
  DatabaseUpdateInput,
  DatabaseView,
  DatabaseViewCreateInput,
  DatabaseViewUpdateInput,
  FieldCatalog,
  FileRef,
  Folder,
  FolderEffective,
  FolderNode,
  GraphEdge,
  GraphNode,
  GraphQueryRequest,
  GraphQueryResponse,
  KindDefinition,
  Note,
  NotePropertiesResponse,
  PageTemplate,
  PropertyConfig,
  PropertyDefinition,
  PropertyMergePreview,
  PropertyMergeResolutionEntry,
  PropertyType,
  PropertyValue,
  TemplateApplicationOptions,
  TemplateApplicationPreview,
  TemplateApplicationResult,
  TemplateCreateInput,
  TemplatePropertyCreateInput,
  TemplatePropertyUpdateInput,
  TemplateUpdateInput,
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
    /** Patch a definition (label, type, icon, description, config, position). */
    update: (
      id: string,
      data: Partial<{
        label: string;
        type: PropertyType;
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
    /**
     * Create a property definition rooted on a note. Routing rules:
     *   – standalone note  → created as `scope='note'` (private).
     *   – row of one database → created as `scope='database'` on it.
     *   – row of multiple databases → caller must pass `databaseId` to
     *     pick the target, or `private: true` to force the private path.
     */
    createForNote: (
      noteId: string,
      data: {
        label: string;
        type: PropertyType;
        key?: string;
        icon?: string | null;
        description?: string | null;
        config?: PropertyConfig;
        position?: string;
        /** Force the legacy per-note (private) schema. */
        private?: boolean;
        /** Target database id when the note belongs to multiple databases. */
        databaseId?: string;
      },
    ) =>
      http<PropertyDefinition>(`/notes/${noteId}/properties`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** Persist the complete display order for a note's property definitions. */
    reorderForNote: (noteId: string, ids: string[]) =>
      http<PropertyDefinition[]>(`/notes/${noteId}/properties/reorder`, {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    /** Delete a definition (cascades all stored values). */
    remove: (id: string) =>
      http<{ ok: true }>(`/properties/${id}`, { method: 'DELETE' }),
    /**
     * Return the note's effective schema (private + every database it
     * belongs to) plus its database memberships, so the caller can
     * subscribe to shared-schema realtime events.
     */
    listForNote: (noteId: string) =>
      http<NotePropertiesResponse>(`/notes/${noteId}/properties`),
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
   * Property Query Layer — field catalogue used by filter / encoding pickers.
   * The catalogue is surface-scoped because the same field set may be
   * exposed differently on the graph view vs. note views.
   */
  query: {
    fields: (surface: 'graph' | 'note' = 'graph') =>
      http<FieldCatalog>(`/query/fields?surface=${surface}`),
  },
  /**
   * Property Query Layer — graph endpoint that consumes a `GraphQueryRequest`
   * and returns the filtered/projected graph payload. Replaces the legacy
   * `links.graph()` call site for the new query-driven graph view.
   */
  graph: {
    query: (req: GraphQueryRequest) =>
      http<GraphQueryResponse>(`/graph/query`, {
        method: 'POST',
        body: JSON.stringify(req),
      }),
  },
  /**
   * Reusable page templates. Templates are standalone first-class entities
   * surfaced via the dedicated `/templates` view; they can be applied to
   * existing notes non-destructively or used as the seed for a new note.
   */
  templates: {
    list: () => http<PageTemplate[]>('/templates'),
    get: (id: string) => http<PageTemplate>(`/templates/${id}`),
    create: (data: TemplateCreateInput) =>
      http<PageTemplate>('/templates', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: TemplateUpdateInput) =>
      http<PageTemplate>(`/templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      http<{ ok: true }>(`/templates/${id}`, { method: 'DELETE' }),
    /** Snapshot an existing note into a new template. */
    fromNote: (data: {
      noteId: string;
      name: string;
      description?: string | null;
      includeProperties?: boolean;
      captureDefaults?: boolean;
    }) =>
      http<PageTemplate>(`/templates/from-note`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    properties: {
      create: (templateId: string, data: TemplatePropertyCreateInput) =>
        http<PageTemplate>(`/templates/${templateId}/properties`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      update: (
        templateId: string,
        propertyId: string,
        data: TemplatePropertyUpdateInput,
      ) =>
        http<PageTemplate>(
          `/templates/${templateId}/properties/${propertyId}`,
          { method: 'PATCH', body: JSON.stringify(data) },
        ),
      remove: (templateId: string, propertyId: string) =>
        http<PageTemplate>(
          `/templates/${templateId}/properties/${propertyId}`,
          { method: 'DELETE' },
        ),
      reorder: (templateId: string, ids: string[]) =>
        http<PageTemplate>(`/templates/${templateId}/properties/reorder`, {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }),
    },
    /** Create a brand-new note seeded from this template. */
    createNote: (
      templateId: string,
      data: {
        title: string;
        kind?: string;
        folderId?: string | null;
        options?: TemplateApplicationOptions;
      },
    ) =>
      http<{ note: Note; application: TemplateApplicationResult }>(
        `/templates/${templateId}/notes`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    /** Preview the merge that applying a template to an existing note would perform. */
    preview: (
      noteId: string,
      data: { templateId: string; options?: TemplateApplicationOptions },
    ) =>
      http<TemplateApplicationPreview>(
        `/notes/${noteId}/template-preview`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    /** Apply a template to an existing note. Returns 423 when the note is locked. */
    apply: (
      noteId: string,
      data: { templateId: string; options?: TemplateApplicationOptions },
    ) =>
      http<TemplateApplicationResult>(`/notes/${noteId}/apply-template`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  /**
   * Notion-like Databases (a.k.a. datasources). Rows are real notes —
   * value mutations on a row still go through
   * `api.properties.setValue(noteId, propId, …)`. Saved views are not a
   * property of the datasource itself; they live per Tiptap block and
   * are managed through `api.blockViews`.
   */
  databases: {
    list: () => http<Database[]>(`/databases`),
    /** Create a fresh, view-less datasource. */
    create: (data: DatabaseCreateInput) =>
      http<{ database: Database }>(`/databases`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    /** Hot path for editor + manager: database + schema in one round-trip. */
    bundle: (id: string) => http<DatabaseBundle>(`/databases/${id}`),
    update: (id: string, data: DatabaseUpdateInput) =>
      http<Database>(`/databases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      http<{ ok: true }>(`/databases/${id}`, { method: 'DELETE' }),
    properties: {
      list: (databaseId: string) =>
        http<PropertyDefinition[]>(`/databases/${databaseId}/properties`),
      create: (
        databaseId: string,
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
        http<PropertyDefinition>(`/databases/${databaseId}/properties`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      reorder: (databaseId: string, ids: string[]) =>
        http<PropertyDefinition[]>(`/databases/${databaseId}/properties/reorder`, {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }),
    },
    rows: {
      create: (databaseId: string, data: DatabaseRowCreateInput = {}) =>
        http<{ row: DatabaseRow; noteId: string }>(`/databases/${databaseId}/rows`, {
          method: 'POST',
          body: JSON.stringify(data),
        }),
      /**
       * Preview the schema merge required to link an existing note into
       * this database. The response lists the definitions that will be
       * auto-promoted/inherited and any per-key collisions that need a
       * user-supplied {@link PropertyMergeResolutionEntry}.
       */
      previewLink: (databaseId: string, noteId: string) =>
        http<PropertyMergePreview>(`/databases/${databaseId}/rows/preview-link`, {
          method: 'POST',
          body: JSON.stringify({ noteId }),
        }),
      /**
       * Apply a previously previewed merge and add the row. The
       * `resolutions` array must cover every collision returned by the
       * preview (`merge` | `rename` | `keepPrivate`).
       */
      resolveLink: (
        databaseId: string,
        input: {
          noteId: string;
          position?: string;
          resolutions: PropertyMergeResolutionEntry[];
        },
      ) =>
        http<{ row: DatabaseRow; noteId: string }>(
          `/databases/${databaseId}/rows/resolve-link`,
          { method: 'POST', body: JSON.stringify(input) },
        ),
      remove: (databaseId: string, rowId: string, options?: { deleteNote?: boolean }) =>
        http<{ ok: true }>(
          `/databases/${databaseId}/rows/${rowId}` +
            (options?.deleteNote ? `?deleteNote=true` : ''),
          { method: 'DELETE' },
        ),
      reorder: (databaseId: string, ids: string[]) =>
        http<DatabaseRow[]>(`/databases/${databaseId}/rows/reorder`, {
          method: 'POST',
          body: JSON.stringify({ ids }),
        }),
    },
    query: (databaseId: string, request: DatabaseQueryRequest = {}) =>
      http<DatabaseQueryResponse>(`/databases/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify(request),
      }),
  },
  /**
   * Block-scoped saved views. Each view belongs to a single Tiptap
   * `database` block (keyed by `blockId`) and points at exactly one
   * datasource (`dataSourceDatabaseId`).
   */
  blockViews: {
    list: (blockId: string) =>
      http<DatabaseView[]>(`/block-views?blockId=${encodeURIComponent(blockId)}`),
    get: (viewId: string) => http<DatabaseView>(`/block-views/${viewId}`),
    create: (data: DatabaseViewCreateInput) =>
      http<DatabaseView>(`/block-views`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (viewId: string, data: DatabaseViewUpdateInput) =>
      http<DatabaseView>(`/block-views/${viewId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    remove: (viewId: string) =>
      http<{ ok: true }>(`/block-views/${viewId}`, { method: 'DELETE' }),
  },
};

export type { ButtonAction };
