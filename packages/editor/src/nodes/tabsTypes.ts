/** Shared attribute helpers for the editor-native Tabs block. */

export const TABS_SCHEMA_VERSION = 1;
export const DEFAULT_TAB_TITLES = ['Tab 1', 'Tab 2'] as const;

export interface TabsAttrs {
  activeTabId: string | null;
  schemaVersion: number;
}

export interface TabPanelAttrs {
  id: string;
  title: string;
  active: boolean;
  schemaVersion: number;
}

export interface TabsBlockContent {
  type: 'tabs';
  attrs: TabsAttrs;
  content: Array<{
    type: 'tabPanel';
    attrs: TabPanelAttrs;
    content: Array<{ type: 'paragraph' }>;
  }>;
}

export function createTabId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `tab-${crypto.randomUUID()}`
    : `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeTabsAttrs(input: Partial<TabsAttrs> | null | undefined): TabsAttrs {
  return {
    activeTabId: safeString(input?.activeTabId),
    schemaVersion: safeVersion(input?.schemaVersion),
  };
}

export function createTabsAttrs(activeTabId: string | null): TabsAttrs {
  return { activeTabId: safeString(activeTabId), schemaVersion: TABS_SCHEMA_VERSION };
}

export function normalizeTabPanelAttrs(
  input: Partial<TabPanelAttrs> | null | undefined,
): TabPanelAttrs {
  return createTabPanelAttrs(input ?? {});
}

export function createTabPanelAttrs(input: Partial<TabPanelAttrs> = {}): TabPanelAttrs {
  return {
    id: safeString(input.id) ?? createTabId(),
    title: safeString(input.title) ?? 'Tab',
    active: input.active === true,
    schemaVersion: safeVersion(input.schemaVersion),
  };
}

export function createTabsBlockContent(titles: readonly string[] = DEFAULT_TAB_TITLES): TabsBlockContent {
  const panels = (titles.length > 0 ? titles : DEFAULT_TAB_TITLES).map((title, index) => ({
    type: 'tabPanel' as const,
    attrs: createTabPanelAttrs({ title, active: index === 0 }),
    content: [{ type: 'paragraph' as const }],
  }));
  return {
    type: 'tabs',
    attrs: createTabsAttrs(panels[0]?.attrs.id ?? null),
    content: panels,
  };
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeVersion(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : TABS_SCHEMA_VERSION;
}