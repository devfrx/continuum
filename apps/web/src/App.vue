<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { Icon, type IconName } from '@/components/ui';
import { useTheme } from '@/composables/useTheme';
import { useSidebar } from '@/composables/useSidebar';

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

const { open, hide, toggle } = useSidebar();
const toggleLabel = computed(() => (open.value ? 'Close sidebar' : 'Open sidebar'));
const toggleIcon = computed<IconName>(() => (open.value ? 'close' : 'menu'));

/** Esc closes the sidebar (useful when it's open and covering content). */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && open.value) hide();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="layout" :class="{ 'sidebar-open': open }">
    <!--
      Floating toggle button — always visible in the top-left corner so the
      sidebar can be opened from anywhere without hovering or pinning.
    -->
    <button type="button" class="sidebar-toggle" :class="{ 'is-active': open }" :aria-label="toggleLabel"
      :aria-expanded="open" :aria-controls="'app-sidebar'" :title="toggleLabel" @click="toggle">
      <Icon :name="toggleIcon" :size="18" />
    </button>

    <!--
      Backdrop scrim — clicking outside the sidebar closes it. Only active
      while the sidebar is open; transparent so it doesn't darken content.
    -->
    <div v-if="open" class="sidebar-scrim" aria-hidden="true" @click="hide" />

    <aside id="app-sidebar" class="app-sidebar" :class="{ 'is-open': open }" :aria-hidden="!open">
      <header class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-wordmark brand-wordmark">CONT\NUUM</div>
          <div class="sidebar-tagline">knowledge base</div>
        </div>
      </header>

      <nav v-for="group in navGroups" :key="group.label" class="nav-section" :aria-label="group.label">
        <div class="nav-section-label">{{ group.label }}</div>
        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-link" @click="hide">
          <Icon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <footer class="sidebar-footer">
        <span class="sidebar-footer__hint">Theme</span>
        <button type="button" class="theme-toggle" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
          <Icon :name="themeIcon" :size="16" />
        </button>
      </footer>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.sidebar-footer__hint {
  font-size: var(--text-xs);
  color: var(--fg-subtle);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  font-weight: var(--font-weight-semibold);
}

.theme-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  border: var(--border-width-1) solid transparent;
  color: var(--fg-muted);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}

.theme-toggle:hover {
  background: var(--accent-soft);
  color: var(--accent-hover-color);
}

.theme-toggle:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
</style>
