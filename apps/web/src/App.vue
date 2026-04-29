<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { Icon, type IconName } from '@/components/ui';
import { useTheme } from '@/composables/useTheme';

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
      { to: '/search', label: 'Search', icon: 'search' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/ai', label: 'AI', icon: 'ai' },
      { to: '/settings', label: 'Settings', icon: 'settings' },
    ],
  },
];

const { isDark, toggle } = useTheme();
const themeLabel = computed(() => (isDark.value ? 'Switch to light mode' : 'Switch to dark mode'));
const themeIcon = computed<IconName>(() => (isDark.value ? 'kind-sun' : 'kind-moon'));
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <header class="sidebar-header">
        <div class="sidebar-brand">
          <div class="sidebar-wordmark brand-wordmark">CONT\NUUM</div>
          <div class="sidebar-tagline">knowledge base</div>
        </div>
      </header>

      <nav v-for="group in navGroups" :key="group.label" class="nav-section" :aria-label="group.label">
        <div class="nav-section-label">{{ group.label }}</div>
        <RouterLink v-for="item in group.items" :key="item.to" :to="item.to" class="nav-link">
          <Icon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <footer class="sidebar-footer">
        <span class="sidebar-footer__hint">Theme</span>
        <button type="button" class="theme-toggle" :aria-label="themeLabel" :title="themeLabel" @click="toggle">
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
  color: var(--accent);
}

.theme-toggle:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
</style>
