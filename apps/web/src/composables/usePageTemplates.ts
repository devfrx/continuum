import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';
import type {
  PageTemplate,
  TemplateApplicationOptions,
  TemplateApplicationPreview,
  TemplateApplicationResult,
  TemplateCreateInput,
  TemplatePropertyCreateInput,
  TemplatePropertyUpdateInput,
  TemplateUpdateInput,
} from '@continuum/shared';

// Module-level reactive cache shared across all callers (same pattern as
// useKinds / useProperties). Mutations performed via this composable update
// the cache so every view that depends on it re-renders automatically.
const templates = ref<PageTemplate[]>([]);
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

function isPageTemplate(value: unknown): value is PageTemplate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PageTemplate>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    Array.isArray(candidate.properties)
  );
}

function upsert(t: PageTemplate): void {
  if (!isPageTemplate(t)) {
    throw new Error('Template API returned an invalid template payload');
  }
  const idx = templates.value.findIndex((x) => x.id === t.id);
  if (idx === -1) templates.value = [...templates.value, t];
  else {
    const next = templates.value.slice();
    next[idx] = t;
    templates.value = next;
  }
}

function removeLocal(id: string): void {
  templates.value = templates.value.filter((t) => t.id !== id);
}

export interface UsePageTemplatesReturn {
  templates: Ref<PageTemplate[]>;
  sorted: ComputedRef<PageTemplate[]>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  load: (force?: boolean) => Promise<void>;
  byId: (id: string) => PageTemplate | null;
  create: (data: TemplateCreateInput) => Promise<PageTemplate>;
  update: (id: string, data: TemplateUpdateInput) => Promise<PageTemplate>;
  remove: (id: string) => Promise<void>;
  fromNote: (data: {
    noteId: string;
    name: string;
    description?: string | null;
    includeProperties?: boolean;
    captureDefaults?: boolean;
  }) => Promise<PageTemplate>;
  addProperty: (
    templateId: string,
    data: TemplatePropertyCreateInput,
  ) => Promise<PageTemplate>;
  updateProperty: (
    templateId: string,
    propertyId: string,
    data: TemplatePropertyUpdateInput,
  ) => Promise<PageTemplate>;
  removeProperty: (templateId: string, propertyId: string) => Promise<PageTemplate>;
  reorderProperties: (templateId: string, ids: string[]) => Promise<PageTemplate>;
  preview: (
    noteId: string,
    data: { templateId: string; options?: TemplateApplicationOptions },
  ) => Promise<TemplateApplicationPreview>;
  apply: (
    noteId: string,
    data: { templateId: string; options?: TemplateApplicationOptions },
  ) => Promise<TemplateApplicationResult>;
}

/**
 * Reactive page-templates store shared across the app. Mirrors the
 * server's `/api/templates` namespace and keeps a local cache in sync
 * with every mutation so list views and pickers stay coherent.
 */
export function usePageTemplates(): UsePageTemplatesReturn {
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    error.value = null;
    try {
      templates.value = (await api.templates.list()).filter(isPageTemplate);
      loaded.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function byId(id: string): PageTemplate | null {
    return templates.value.find((t) => t.id === id) ?? null;
  }

  async function create(data: TemplateCreateInput): Promise<PageTemplate> {
    const t = await api.templates.create(data);
    upsert(t);
    return t;
  }

  async function update(
    id: string,
    data: TemplateUpdateInput,
  ): Promise<PageTemplate> {
    const t = await api.templates.update(id, data);
    upsert(t);
    return t;
  }

  async function remove(id: string): Promise<void> {
    await api.templates.remove(id);
    removeLocal(id);
  }

  async function fromNote(data: {
    noteId: string;
    name: string;
    description?: string | null;
    includeProperties?: boolean;
    captureDefaults?: boolean;
  }): Promise<PageTemplate> {
    const t = await api.templates.fromNote(data);
    upsert(t);
    return t;
  }

  async function addProperty(
    templateId: string,
    data: TemplatePropertyCreateInput,
  ): Promise<PageTemplate> {
    const t = await api.templates.properties.create(templateId, data);
    upsert(t);
    return t;
  }

  async function updateProperty(
    templateId: string,
    propertyId: string,
    data: TemplatePropertyUpdateInput,
  ): Promise<PageTemplate> {
    const t = await api.templates.properties.update(templateId, propertyId, data);
    upsert(t);
    return t;
  }

  async function removeProperty(
    templateId: string,
    propertyId: string,
  ): Promise<PageTemplate> {
    const t = await api.templates.properties.remove(templateId, propertyId);
    upsert(t);
    return t;
  }

  async function reorderProperties(
    templateId: string,
    ids: string[],
  ): Promise<PageTemplate> {
    const t = await api.templates.properties.reorder(templateId, ids);
    upsert(t);
    return t;
  }

  async function preview(
    noteId: string,
    data: { templateId: string; options?: TemplateApplicationOptions },
  ): Promise<TemplateApplicationPreview> {
    return api.templates.preview(noteId, data);
  }

  async function apply(
    noteId: string,
    data: { templateId: string; options?: TemplateApplicationOptions },
  ): Promise<TemplateApplicationResult> {
    return api.templates.apply(noteId, data);
  }

  const sorted = computed<PageTemplate[]>(() =>
    [...templates.value]
      .filter(isPageTemplate)
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

  return {
    templates,
    sorted,
    loaded,
    loading,
    error,
    load,
    byId,
    create,
    update,
    remove,
    fromNote,
    addProperty,
    updateProperty,
    removeProperty,
    reorderProperties,
    preview,
    apply,
  };
}
