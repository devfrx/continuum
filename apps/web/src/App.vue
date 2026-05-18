<script setup lang="ts">
/**
 * App shell — floating overlay sidebar.
 *
 * Layout is a single full-bleed `<main>`. The global navigation lives in
 * a *floating* sidebar surface that:
 *   • is hidden by default (no chrome stealing horizontal space),
 *   • is summoned by a vertical pill anchored to the viewport's left
 *     edge at mid-height (the same pill collapses it back),
 *   • slides in from the left as an overlay, detached from the window
 *     edges (margin all around, rounded corners, soft shadow),
 *   • dismisses on outside click, ESC, the pill, a nav-link click, or
 *     the global Ctrl/Cmd+B shortcut.
 *
 * Visual language: minimal/flat, matches the editor surfaces. The
 * footer hosts the AI provider status pill (click → /settings) and the
 * theme toggle.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { Icon, UiPromptModal } from '@/components/ui';
import type { AppIconName as IconName } from '@/assets/icons';
import { useTheme } from '@/composables/useTheme';
import { useSidebar } from '@/composables/useSidebar';
import { usePromptModal } from '@/composables/usePromptModal';
import { useAiHealth } from '@/composables/useAiHealth';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Notes', icon: 'notes' },
  { to: '/graph', label: 'Graph', icon: 'graph' },
  { to: '/templates', label: 'Templates', icon: 'templates' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const { isDark, toggle: toggleTheme } = useTheme();
const themeLabel = computed(() => (isDark.value ? 'Switch to light mode' : 'Switch to dark mode'));
const themeIcon = computed<IconName>(() => (isDark.value ? 'theme-light' : 'theme-dark'));

// Brand assets shipped from `public/brand/`. The `_dark` variant is the
// foreground designed for dark surfaces and vice versa, so we pick by
// the active theme. Vite resolves `/brand/...` from `public/`.
const brandMarkSrc = computed<string>(() =>
  isDark.value ? '/brand/continuum_logo_light.webp' : '/brand/continuum_logo_dark.webp',
);
const brandWordmarkSrc = computed<string>(() =>
  isDark.value
    ? '/brand/continuum_text_logo_light.webp'
    : '/brand/continuum_text_logo_dark.webp',
);

const { open, toggle, hide } = useSidebar();
const pillLabel = computed(() => (open.value ? 'Collapse sidebar' : 'Expand sidebar'));
const pillIcon = computed<IconName>(() => (open.value ? 'chevron-left' : 'chevron-right'));

// Refs used by the outside-click dismiss handler. Pointerdown fires
// before click, so we must explicitly skip targets inside either the
// sidebar surface or the pill (otherwise toggling via the pill would
// hide → click → toggle, leaving the sidebar in the wrong state).
const sidebarRef = ref<HTMLElement | null>(null);
const pillRef = ref<HTMLElement | null>(null);

function onDocPointerDown(e: PointerEvent): void {
  if (!open.value) return;
  const target = e.target as Node | null;
  if (!target) return;
  if (sidebarRef.value?.contains(target)) return;
  if (pillRef.value?.contains(target)) return;
  hide();
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return;
  if (!open.value) return;
  if (e.defaultPrevented) return;
  hide();
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown);
  document.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown);
  document.removeEventListener('keydown', onKey);
});

// ── AI provider status (footer pill) ─────────────────────────────
const { health } = useAiHealth();
const aiOnlineCount = computed<number>(
  () => (health.value?.providers ?? []).filter((p) => p.reachable).length,
);
const aiTotalCount = computed<number>(() => health.value?.providers.length ?? 0);
const aiPrimary = computed(() => {
  const providers = health.value?.providers ?? [];
  return providers.find((p) => p.name === health.value?.primary) ?? providers[0] ?? null;
});
const aiTone = computed<'success' | 'warning' | 'danger' | 'idle'>(() => {
  if (!health.value) return 'idle';
  if (aiOnlineCount.value === 0) return 'danger';
  if (aiOnlineCount.value < aiTotalCount.value) return 'warning';
  return 'success';
});
const aiLabel = computed<string>(() => {
  if (!health.value) return 'AI: checking…';
  const p = aiPrimary.value;
  if (!p) return 'AI: not configured';
  return p.reachable ? p.name : `${p.name} offline`;
});
const aiTitle = computed<string>(
  () => `${aiOnlineCount.value}/${aiTotalCount.value || '–'} AI providers online — open Settings`,
);

// ── Global prompt modal ─────────────────────────────────────────
const {
  open: promptOpen,
  title: promptTitle,
  label: promptLabel,
  placeholder: promptPlaceholder,
  initialValue: promptInitial,
  confirmLabel: promptConfirmLabel,
  submit: onPromptSubmit,
  cancel: onPromptCancel,
} = usePromptModal();
</script>

<template>
  <div class="layout" :class="{ 'sidebar-open': open }">
    <main class="main">
      <RouterView />
    </main>

    <!-- Pill trigger: vertical, fixed at mid-height on the left edge -->
    <button
      ref="pillRef"
      type="button"
      class="sidebar-pill"
      :class="{ 'is-active': open }"
      :aria-label="pillLabel"
      :aria-expanded="open"
      aria-controls="app-sidebar"
      :title="`${pillLabel} (Ctrl+B)`"
      @click="toggle"
    >
      <Icon :name="pillIcon" :size="14" />
    </button>

    <!-- Floating sidebar overlay -->
    <Transition name="sidebar-slide">
      <aside
        v-show="open"
        id="app-sidebar"
        ref="sidebarRef"
        class="app-sidebar"
        aria-label="Primary navigation"
      >
        <header class="app-sidebar__brand">
          <RouterLink to="/" class="brand-link" @click="hide">
            <img class="brand-mark" :src="brandMarkSrc" alt="" aria-hidden="true" draggable="false" />
            <span class="brand-text">
              <img class="brand-wordmark" :src="brandWordmarkSrc" alt="Continuum" draggable="false" />
              <span class="brand-tagline">knowledge base</span>
            </span>
          </RouterLink>
        </header>

        <nav class="app-sidebar__nav" aria-label="Primary">
          <RouterLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="nav-link"
            @click="hide"
          >
            <Icon :name="item.icon" :size="16" class="nav-link__icon" />
            <span class="nav-link__label">{{ item.label }}</span>
          </RouterLink>
        </nav>

        <footer class="app-sidebar__footer">
          <RouterLink
            to="/settings"
            class="ai-status"
            :class="`ai-status--${aiTone}`"
            :title="aiTitle"
            @click="hide"
          >
            <span class="ai-status__dot" aria-hidden="true" />
            <span class="ai-status__text">{{ aiLabel }}</span>
            <span class="ai-status__count">{{ aiOnlineCount }}/{{ aiTotalCount || '–' }}</span>
          </RouterLink>

          <button
            type="button"
            class="footer-icon-btn"
            :aria-label="themeLabel"
            :title="themeLabel"
            @click="toggleTheme"
          >
            <Icon :name="themeIcon" :size="15" />
          </button>
        </footer>
      </aside>
    </Transition>

    <UiPromptModal
      v-model="promptOpen"
      :title="promptTitle"
      :label="promptLabel"
      :placeholder="promptPlaceholder"
      :initial-value="promptInitial"
      :confirm-label="promptConfirmLabel"
      @submit="onPromptSubmit"
      @cancel="onPromptCancel"
    />
  </div>
</template>

<style scoped>
/*
 * Shell styling lives in `styles/layout.css` so it can target the
 * floating sidebar surface from outside scoped boundaries.
 */
</style>
