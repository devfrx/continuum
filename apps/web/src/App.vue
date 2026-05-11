<script setup lang="ts">
/**
 * App shell — persistent left rail.
 *
 * The sidebar is always visible as a 56-px icon rail anchored to the
 * viewport edge: the navigation icons stay in the same position whether
 * the rail is collapsed or expanded, so muscle memory works regardless
 * of state. A chevron in the footer expands the rail to its full width
 * and reveals labels + the brand mark; the same chevron rotates to
 * collapse it back. There is no floating toggle and no scrim — the rail
 * never overlays content, it always occupies its own column.
 */
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { Icon, UiPromptModal } from '@/components/ui';
import type { AppIconName as IconName } from '@/assets/icons';
import { useTheme } from '@/composables/useTheme';
import { useSidebar } from '@/composables/useSidebar';
import { usePromptModal } from '@/composables/usePromptModal';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Notes', icon: 'notes' },
      { to: '/graph', label: 'Graph', icon: 'graph' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const { isDark, toggle: toggleTheme } = useTheme();
const themeLabel = computed(() => (isDark.value ? 'Switch to light mode' : 'Switch to dark mode'));
const themeIcon = computed<IconName>(() => (isDark.value ? 'theme-light' : 'theme-dark'));

const { open, toggle } = useSidebar();
const collapseLabel = computed(() => (open.value ? 'Collapse sidebar' : 'Expand sidebar'));
const collapseIcon = computed<IconName>(() => (open.value ? 'sidebar-collapse' : 'sidebar-expand'));

function toggleSidebar(): void {
  toggle();
}

// Global prompt modal — shared across all consumers via `usePromptModal`.
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
    <aside id="app-sidebar" class="app-sidebar" :class="{ 'is-open': open, 'is-collapsed': !open }"
      :aria-label="'Primary navigation'">
      <header class="sidebar-header">
        <RouterLink to="/" class="sidebar-brand" :title="open ? undefined : 'Continuum'">
          <span class="sidebar-mark" aria-hidden="true">C</span>
          <span v-show="open" class="sidebar-brand-text">
            <span class="sidebar-wordmark brand-wordmark">CONT\NUUM</span>
            <span class="sidebar-tagline">knowledge base</span>
          </span>
        </RouterLink>
      </header>

      <nav v-for="group in navGroups" :key="group.label" class="nav-section" :aria-label="group.label">
        <div v-show="open" class="nav-section-label">{{ group.label }}</div>
        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-link"
          :title="open ? undefined : item.label" :aria-label="item.label">
          <Icon :name="item.icon" :size="18" />
          <span v-show="open" class="nav-link__label">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <footer class="sidebar-footer">
        <button type="button" class="sidebar-icon-btn" :aria-label="themeLabel" :title="themeLabel"
          @click="toggleTheme">
          <Icon :name="themeIcon" :size="16" />
        </button>
        <button type="button" class="sidebar-icon-btn sidebar-collapse-btn" :aria-label="collapseLabel"
          :aria-expanded="open" :aria-controls="'app-sidebar'" :title="`${collapseLabel} (Ctrl+B)`"
          @click="toggleSidebar">
          <Icon :name="collapseIcon" :size="16" />
        </button>
      </footer>
    </aside>
    <main class="main">
      <RouterView />
    </main>

    <UiPromptModal v-model="promptOpen" :title="promptTitle" :label="promptLabel" :placeholder="promptPlaceholder"
      :initial-value="promptInitial" :confirm-label="promptConfirmLabel" @submit="onPromptSubmit"
      @cancel="onPromptCancel" />
  </div>
</template>

<style scoped>
/*
 * Sidebar styling lives in `styles/layout.css` so it can target the
 * shell from outside scoped boundaries. This block only holds bits that
 * are intrinsic to App.vue's local widgets (none right now).
 */
</style>
