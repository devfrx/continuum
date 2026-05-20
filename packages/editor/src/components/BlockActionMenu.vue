<script setup lang="ts">
/**
 * BlockActionMenu
 * Compact command panel for the native block handle. It mirrors the
 * editor's existing context-menu vocabulary (move, duplicate, turn into,
 * delete) but is local to the editor package, so hosts do not need to
 * implement another menu surface just to make blocks usable.
 */
import type { Editor } from '@tiptap/core';
import { computed, inject, nextTick, onBeforeUnmount, ref, watch, type Component } from 'vue';
import type { EditorBlockSnapshot } from '../blocks/blockActions';
import {
  deleteBlock,
  duplicateBlock,
  insertParagraphAfterBlock,
  insertParagraphBeforeBlock,
  moveBlockBy,
} from '../blocks/blockActions';
import {
  getTurnIntoTargetsForBlock,
  isTurnIntoTargetActiveForBlock,
  runTurnIntoTargetForBlock,
  type TurnIntoGroup,
} from '../blocks/blockTransforms';
import { useContinuumScrollLock } from '../composables/useContinuumScrollLock';
import { ICON_COMPONENT_KEY } from '../hostBridge';

interface BlockMenuAction {
  id: string;
  label: string;
  icon: string;
  fallback: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  action: () => void;
}

type BlockMenuEntry =
  | { kind: 'divider'; id: string }
  | ({ kind: 'action' } & BlockMenuAction);

const props = defineProps<{
  editor: Editor;
  block: EditorBlockSnapshot;
  canMoveUp: boolean;
  canMoveDown: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const IconRenderer = inject<Component | null>(ICON_COMPONENT_KEY, null);
useContinuumScrollLock(() => true);
const turnIntoSubmenuOpen = ref(false);
const turnIntoTrigger = ref<HTMLElement | null>(null);
const turnIntoSubmenu = ref<HTMLElement | null>(null);
const turnIntoSubmenuStyle = ref<Record<string, string>>({
  left: '8px',
  top: '8px',
  minWidth: '220px',
  maxHeight: '70vh',
});

const SUBMENU_MIN_WIDTH = 220;
const SUBMENU_GAP = 6;
const VIEWPORT_PADDING = 8;

const primaryActions = computed<BlockMenuAction[]>(() => [
  {
    id: 'add-above',
    label: 'Add above',
    icon: 'plus',
    fallback: '+',
    action: () => insertParagraphBeforeBlock(props.editor, props.block),
  },
  {
    id: 'add-below',
    label: 'Add below',
    icon: 'plus',
    fallback: '+',
    action: () => insertParagraphAfterBlock(props.editor, props.block),
  },
  {
    id: 'move-up',
    label: 'Move up',
    icon: 'arrow-up',
    fallback: '^',
    disabled: !props.canMoveUp,
    action: () => moveBlockBy(props.editor, props.block, -1),
  },
  {
    id: 'move-down',
    label: 'Move down',
    icon: 'arrow-down',
    fallback: 'v',
    disabled: !props.canMoveDown,
    action: () => moveBlockBy(props.editor, props.block, 1),
  },
  {
    id: 'duplicate',
    label: 'Duplicate',
    icon: 'copy',
    fallback: 'D',
    action: () => duplicateBlock(props.editor, props.block),
  },
]);

const turnIntoActions = computed<BlockMenuAction[]>(() => getTurnIntoTargetsForBlock(props.block).map(
  (target) => ({
    id: `turn-${target.id}`,
    label: target.label,
    icon: target.icon,
    fallback: target.label.slice(0, 2),
    shortcut: target.shortcut,
    active: isTurnIntoTargetActiveForBlock(props.block, target.id),
    action: () => runTurnIntoTargetForBlock(props.editor, props.block, target.id),
  }),
));

const directTurnIntoAction = computed<BlockMenuAction | null>(() => {
  const action = turnIntoActions.value[0];
  if (turnIntoActions.value.length !== 1 || !action) return null;
  return { ...action, label: `Turn into ${action.label}` };
});

const turnIntoSubmenuEntries = computed<BlockMenuEntry[]>(() => {
  const entries: BlockMenuEntry[] = [];
  let previousGroup: TurnIntoGroup | null = null;
  for (const target of getTurnIntoTargetsForBlock(props.block)) {
    if (previousGroup !== null && target.group !== previousGroup) {
      entries.push({ kind: 'divider', id: `turn-divider-${target.group}` });
    }
    previousGroup = target.group;
    entries.push({
      kind: 'action',
      id: `turn-${target.id}`,
      label: target.label,
      icon: target.icon,
      fallback: target.label.slice(0, 2),
      shortcut: target.shortcut,
      active: isTurnIntoTargetActiveForBlock(props.block, target.id),
      action: () => runTurnIntoTargetForBlock(props.editor, props.block, target.id),
    });
  }
  return entries;
});

const hasTurnIntoSubmenu = computed(() => turnIntoActions.value.length > 1);

const dangerActions = computed<BlockMenuAction[]>(() => [
  {
    id: 'delete',
    label: 'Delete',
    icon: 'trash',
    fallback: 'x',
    danger: true,
    action: () => deleteBlock(props.editor, props.block),
  },
]);

function run(action: () => void): void {
  action();
  turnIntoSubmenuOpen.value = false;
  emit('close');
}

function viewportBounds(): { left: number; top: number; width: number; height: number } {
  const viewport = window.visualViewport;
  return {
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function placeTurnIntoSubmenu(width: number, height: number): void {
  const trigger = turnIntoTrigger.value;
  if (!trigger) return;
  const viewport = viewportBounds();
  const rect = trigger.getBoundingClientRect();
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const maxHeight = Math.max(160, viewport.height - VIEWPORT_PADDING * 2);
  const panelWidth = Math.max(SUBMENU_MIN_WIDTH, width);
  const panelHeight = Math.min(height, maxHeight);
  const opensLeft = rect.right + SUBMENU_GAP + panelWidth > viewportRight - VIEWPORT_PADDING;
  const left = opensLeft
    ? Math.max(viewport.left + VIEWPORT_PADDING, rect.left - panelWidth - SUBMENU_GAP)
    : Math.min(rect.right + SUBMENU_GAP, viewportRight - VIEWPORT_PADDING - panelWidth);
  const top = rect.top + panelHeight > viewportBottom - VIEWPORT_PADDING
    ? Math.max(viewport.top + VIEWPORT_PADDING, viewportBottom - VIEWPORT_PADDING - panelHeight)
    : Math.max(viewport.top + VIEWPORT_PADDING, rect.top);
  turnIntoSubmenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    minWidth: `${SUBMENU_MIN_WIDTH}px`,
    maxHeight: `${maxHeight}px`,
  };
}

async function updateTurnIntoSubmenuPlacement(): Promise<void> {
  if (!turnIntoSubmenuOpen.value) return;
  placeTurnIntoSubmenu(SUBMENU_MIN_WIDTH, 320);
  await nextTick();
  const panel = turnIntoSubmenu.value;
  if (!panel) return;
  const rect = panel.getBoundingClientRect();
  placeTurnIntoSubmenu(rect.width, rect.height);
}

function openTurnIntoSubmenu(): void {
  turnIntoSubmenuOpen.value = true;
  void updateTurnIntoSubmenuPlacement();
}

function onFloatingReposition(): void {
  void updateTurnIntoSubmenuPlacement();
}

watch(turnIntoSubmenuOpen, (isOpen) => {
  if (isOpen) {
    window.addEventListener('resize', onFloatingReposition);
    window.addEventListener('scroll', onFloatingReposition, true);
    void updateTurnIntoSubmenuPlacement();
    return;
  }
  window.removeEventListener('resize', onFloatingReposition);
  window.removeEventListener('scroll', onFloatingReposition, true);
});

watch(
  () => `${props.block.from}:${props.block.to}:${props.block.type}`,
  () => {
    turnIntoSubmenuOpen.value = false;
  },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', onFloatingReposition);
  window.removeEventListener('scroll', onFloatingReposition, true);
});
</script>

<template>
  <div class="continuum-block-menu-shell" data-continuum-scroll-lock-allow="true">
    <div class="continuum-block-menu" role="menu" :aria-label="`${block.label} block actions`" @pointerdown.stop>
      <div class="continuum-block-menu__header">
        <span class="continuum-block-menu__block-icon" aria-hidden="true">
          <component v-if="IconRenderer" :is="IconRenderer" :name="block.icon" :size="15" />
          <span v-else>{{ block.label.slice(0, 1) }}</span>
        </span>
        <span class="continuum-block-menu__header-text">
          <span class="continuum-block-menu__eyebrow">Block actions</span>
          <span class="continuum-block-menu__title">{{ block.label }}</span>
        </span>
      </div>

      <div class="continuum-block-menu__section" @pointerenter="turnIntoSubmenuOpen = false">
        <button v-for="item in primaryActions" :key="item.id" type="button" class="continuum-block-menu__item"
          role="menuitem" :disabled="item.disabled" @pointerdown.prevent="run(item.action)">
          <span class="continuum-block-menu__icon" aria-hidden="true">
            <component v-if="IconRenderer" :is="IconRenderer" :name="item.icon" :size="14" />
            <span v-else>{{ item.fallback }}</span>
          </span>
          <span class="continuum-block-menu__label">{{ item.label }}</span>
        </button>
      </div>

      <template v-if="directTurnIntoAction || hasTurnIntoSubmenu">
        <div class="continuum-block-menu__divider" role="separator" />
        <div v-if="directTurnIntoAction" class="continuum-block-menu__section">
          <button type="button" class="continuum-block-menu__item" role="menuitem"
            :class="{ 'is-active': directTurnIntoAction.active }"
            @pointerdown.prevent="run(directTurnIntoAction.action)">
            <span class="continuum-block-menu__icon" aria-hidden="true">
              <component v-if="IconRenderer" :is="IconRenderer" :name="directTurnIntoAction.icon" :size="14" />
              <span v-else>{{ directTurnIntoAction.fallback }}</span>
            </span>
            <span class="continuum-block-menu__label">{{ directTurnIntoAction.label }}</span>
          </button>
        </div>
        <div v-else class="continuum-block-menu__submenu-wrap">
          <button ref="turnIntoTrigger" type="button" class="continuum-block-menu__item has-submenu" role="menuitem"
            aria-haspopup="menu" :aria-expanded="turnIntoSubmenuOpen"
            :class="{ 'is-active': turnIntoSubmenuOpen }"
            @focus="openTurnIntoSubmenu" @pointerenter="openTurnIntoSubmenu"
            @pointerdown.prevent="openTurnIntoSubmenu">
            <span class="continuum-block-menu__icon" aria-hidden="true">
              <component v-if="IconRenderer" :is="IconRenderer" name="edit" :size="14" />
              <span v-else>Ti</span>
            </span>
            <span class="continuum-block-menu__label">Turn into</span>
            <span class="continuum-block-menu__chevron" aria-hidden="true">
              <component v-if="IconRenderer" :is="IconRenderer" name="chevron-right" :size="12" />
              <span v-else>›</span>
            </span>
          </button>
        </div>
      </template>

      <div class="continuum-block-menu__divider" role="separator" />
      <div class="continuum-block-menu__section" @pointerenter="turnIntoSubmenuOpen = false">
        <button v-for="item in dangerActions" :key="item.id" type="button"
          class="continuum-block-menu__item" :class="{ 'is-danger': item.danger }" role="menuitem"
          @pointerdown.prevent="run(item.action)">
          <span class="continuum-block-menu__icon" aria-hidden="true">
            <component v-if="IconRenderer" :is="IconRenderer" :name="item.icon" :size="14" />
            <span v-else>{{ item.fallback }}</span>
          </span>
          <span class="continuum-block-menu__label">{{ item.label }}</span>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="turnIntoSubmenuOpen" ref="turnIntoSubmenu" class="continuum-block-menu__submenu" role="menu"
        aria-label="Turn into block type" data-continuum-scroll-lock-allow="true" :style="turnIntoSubmenuStyle"
        @pointerenter="openTurnIntoSubmenu" @pointerdown.stop>
        <template v-for="entry in turnIntoSubmenuEntries">
          <div v-if="entry.kind === 'divider'" :key="entry.id" class="continuum-block-menu__divider"
            role="separator" />
          <button v-else :key="entry.id" type="button" class="continuum-block-menu__item"
            :class="{ 'is-active': entry.active }" role="menuitem"
            @pointerdown.prevent="run(entry.action)">
            <span class="continuum-block-menu__icon" aria-hidden="true">
              <component v-if="IconRenderer" :is="IconRenderer" :name="entry.icon" :size="14" />
              <span v-else>{{ entry.fallback }}</span>
            </span>
            <span class="continuum-block-menu__label">{{ entry.label }}</span>
            <span v-if="entry.shortcut" class="continuum-block-menu__shortcut">
              {{ entry.shortcut }}
            </span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
