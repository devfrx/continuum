/** Editor-native tabbed container block. */
import { Node, mergeAttributes } from '@tiptap/core';
import {
  normalizeTabPanelAttrs,
  normalizeTabsAttrs,
  type TabPanelAttrs,
  type TabsAttrs,
} from './tabsTypes';

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseTabs(el: HTMLElement): TabsAttrs {
  return normalizeTabsAttrs(parseJson<Partial<TabsAttrs>>(el.getAttribute('data-tabs'), {}));
}

function parsePanel(el: HTMLElement): TabPanelAttrs {
  const payload = parseJson<Partial<TabPanelAttrs>>(el.getAttribute('data-tab-panel'), {});
  return normalizeTabPanelAttrs({
    id: payload.id ?? el.getAttribute('data-tab-id') ?? undefined,
    title: payload.title ?? el.getAttribute('data-tab-title') ?? undefined,
    active: payload.active === true || el.getAttribute('data-active') === 'true',
    schemaVersion: payload.schemaVersion,
  });
}

export const Tabs = Node.create({
  name: 'tabs',
  group: 'block',
  content: 'tabPanel+',
  defining: true,
  isolating: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      activeTabId: { default: null, parseHTML: (el) => parseTabs(el).activeTabId },
      schemaVersion: { default: 1, parseHTML: (el) => parseTabs(el).schemaVersion },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tabs"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = normalizeTabsAttrs(node.attrs);
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'tabs',
        'data-tabs': JSON.stringify(attrs),
        class: 'continuum-tabs',
      }),
      0,
    ];
  },
});

export const TabPanel = Node.create({
  name: 'tabPanel',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

  addAttributes() {
    return {
      id: { default: null, parseHTML: (el) => parsePanel(el).id },
      title: { default: 'Tab', parseHTML: (el) => parsePanel(el).title },
      active: { default: false, parseHTML: (el) => parsePanel(el).active },
      schemaVersion: { default: 1, parseHTML: (el) => parsePanel(el).schemaVersion },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tab-panel"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = normalizeTabPanelAttrs(node.attrs);
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'tab-panel',
        'data-tab-id': attrs.id,
        'data-tab-title': attrs.title,
        'data-active': attrs.active ? 'true' : 'false',
        'data-tab-panel': JSON.stringify(attrs),
        class: 'continuum-tab-panel',
      }),
      0,
    ];
  },
});