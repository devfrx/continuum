/**
 * Saved graph filter presets.
 *
 * A preset captures the full Filtri panel state: structured data query,
 * edge-source selection, visual encodings, physics/display filters and the
 * panel search query. Persistence follows the graph's existing localStorage
 * pattern and keeps parsing defensive so corrupt payloads never break the view.
 */
import { ref, type Ref } from 'vue';
import {
  DEFAULT_EDGE_SOURCE_SELECTION,
  type FilterGroup,
  type GraphEdgeSourceSelection,
} from '@continuum/shared';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { coerceGraphFilters, type GraphFilters } from './useGraphFilters';
import {
  coerceGraphEncodings,
  type GraphEncodings,
} from '@/composables/query/useGraphPropertyEncodings';
import { coerceGraphEdgeSources } from '@/composables/query/useGraphQuery';
import { coerceFilterRoot } from '@/composables/query/useFilterBuilder';

export interface GraphFilterPresetPayload {
  filterRoot: FilterGroup;
  edgeSources: GraphEdgeSourceSelection;
  encodings: GraphEncodings;
  filters: GraphFilters;
  searchQuery: string;
}

export interface GraphFilterPreset {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  payload: GraphFilterPresetPayload;
}

export interface UseGraphFilterPresetsReturn {
  presets: Ref<GraphFilterPreset[]>;
  createPreset: (name: string, payload: GraphFilterPresetPayload) => GraphFilterPreset | null;
  updatePreset: (id: string, payload: GraphFilterPresetPayload) => GraphFilterPreset | null;
  renamePreset: (id: string, name: string) => GraphFilterPreset | null;
  removePreset: (id: string) => void;
}

const STORAGE_KEY = STORAGE_KEYS.graphFilterPresets;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gfp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultEdgeSources(): GraphEdgeSourceSelection {
  return { ...DEFAULT_EDGE_SOURCE_SELECTION, relationPropertyKeys: [] };
}

function coerceTimestamp(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function cloneGraphFilterPresetPayload(
  payload: GraphFilterPresetPayload,
): GraphFilterPresetPayload {
  return {
    filterRoot: cloneJson(payload.filterRoot),
    edgeSources: {
      ...payload.edgeSources,
      relationPropertyKeys: payload.edgeSources.relationPropertyKeys.slice(),
    },
    encodings: cloneJson(payload.encodings),
    filters: { ...payload.filters },
    searchQuery: payload.searchQuery,
  };
}

function coercePayload(value: unknown): GraphFilterPresetPayload | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<GraphFilterPresetPayload>;
  const filterRoot = coerceFilterRoot(raw.filterRoot);
  if (!filterRoot) return null;
  return {
    filterRoot: cloneJson(filterRoot),
    edgeSources: coerceGraphEdgeSources(raw.edgeSources) ?? defaultEdgeSources(),
    encodings: coerceGraphEncodings(raw.encodings),
    filters: coerceGraphFilters(raw.filters),
    searchQuery: typeof raw.searchQuery === 'string' ? raw.searchQuery : '',
  };
}

function coercePreset(value: unknown): GraphFilterPreset | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<GraphFilterPreset>;
  if (typeof raw.id !== 'string' || raw.id.trim().length === 0) return null;
  if (typeof raw.name !== 'string' || raw.name.trim().length === 0) return null;
  const now = Date.now();
  const payload = coercePayload(raw.payload);
  if (!payload) return null;
  return {
    id: raw.id,
    name: raw.name.trim(),
    createdAt: coerceTimestamp(raw.createdAt, now),
    updatedAt: coerceTimestamp(raw.updatedAt, now),
    payload,
  };
}

function readStoredPresets(): GraphFilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(coercePreset)
      .filter((preset): preset is GraphFilterPreset => preset !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function persistPresets(value: GraphFilterPreset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Restrictive WebViews — presets remain available for the current session.
  }
}

export function useGraphFilterPresets(): UseGraphFilterPresetsReturn {
  const presets = ref<GraphFilterPreset[]>(readStoredPresets());

  function commit(next: GraphFilterPreset[]): void {
    presets.value = next;
    persistPresets(next);
  }

  function createPreset(name: string, payload: GraphFilterPresetPayload): GraphFilterPreset | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const now = Date.now();
    const preset: GraphFilterPreset = {
      id: newId(),
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      payload: cloneGraphFilterPresetPayload(payload),
    };
    commit([preset, ...presets.value]);
    return preset;
  }

  function updatePreset(id: string, payload: GraphFilterPresetPayload): GraphFilterPreset | null {
    const index = presets.value.findIndex((preset) => preset.id === id);
    if (index < 0) return null;
    const current = presets.value[index];
    const next: GraphFilterPreset = {
      ...current,
      updatedAt: Date.now(),
      payload: cloneGraphFilterPresetPayload(payload),
    };
    const rest = presets.value.slice();
    rest.splice(index, 1);
    commit([next, ...rest]);
    return next;
  }

  function renamePreset(id: string, name: string): GraphFilterPreset | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const index = presets.value.findIndex((preset) => preset.id === id);
    if (index < 0) return null;
    const next = { ...presets.value[index], name: trimmed, updatedAt: Date.now() };
    const list = presets.value.slice();
    list[index] = next;
    commit(list.sort((a, b) => b.updatedAt - a.updatedAt));
    return next;
  }

  function removePreset(id: string): void {
    commit(presets.value.filter((preset) => preset.id !== id));
  }

  return { presets, createPreset, updatePreset, renamePreset, removePreset };
}
