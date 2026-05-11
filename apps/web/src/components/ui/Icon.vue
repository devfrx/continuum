<script setup lang="ts">
/**
 * Centralized icon component.
 *
 * Renders one of the icons declared in `@/assets/icons` (preferred) OR —
 * when the `name` looks like an Iconify identifier (`prefix:slug`, e.g.
 * `solar:user-bold`) — delegates directly to `@iconify/vue`. The latter
 * is used by the kind icon picker, which stores raw Solar ids selected by
 * the user.
 *
 * Color always inherits from the parent via `currentColor`. When `title`
 * is provided the SVG exposes itself as `role="img"` with an `<title>`
 * element; otherwise it is hidden from assistive tech.
 */
import { computed } from 'vue';
import { Icon as IconifyIcon } from '@iconify/vue/dist/offline';
import { ICONS, isValidIconName, type AppIconName as IconName } from '@/assets/icons';

const props = withDefaults(
  defineProps<{
    /**
     * Icon identifier. Use one of the registered `IconName` values for
     * autocomplete + compile-time safety. An Iconify id like
     * `solar:user-bold` is also accepted; plain `string` lets callers pass
     * dynamic data (e.g. user-defined categories) — unknown names render
     * the dashed-square fallback at runtime.
     */
    name: IconName | (string & {});
    size?: number | string;
    title?: string;
  }>(),
  { size: 16 },
);

const FALLBACK_INNER =
  '<rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>';

const px = computed<string>(() => {
  if (typeof props.size === 'number') return `${props.size}px`;
  return props.size;
});

/** Iconify ids carry a colon (e.g. `solar:user-bold`). */
const isIconify = computed<boolean>(() => props.name.includes(':'));

/** Resolved registry entry, or `null` if `name` is an iconify id or unknown. */
const def = computed(() => {
  if (isIconify.value) return null;
  if (isValidIconName(props.name)) return ICONS[props.name];
  warnMissingIconOnce(props.name);
  return null;
});

/** True when the registry entry uses a raw inner SVG instead of an iconify id. */
const useInner = computed<boolean>(() => def.value?.inner != null);

const innerHtml = computed<string>(() => {
  const base = def.value?.inner ?? FALLBACK_INNER;
  return props.title ? `<title>${escapeXml(props.title)}</title>${base}` : base;
});

const innerViewBox = computed<string>(() => def.value?.viewBox ?? '0 0 24 24');

/** Iconify id resolved from a registry entry (when not using inline SVG). */
const iconifyId = computed<string | null>(() => {
  if (isIconify.value) return props.name;
  return def.value?.icon ?? null;
});

const warned = new Set<string>();
function warnMissingIconOnce(name: string): void {
  if (warned.has(name)) return;
  warned.add(name);
  // eslint-disable-next-line no-console
  console.warn(`[Icon] Unknown icon name: "${name}"`);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
</script>

<template>
  <svg v-if="useInner" :width="px" :height="px" :viewBox="innerViewBox" fill="none" :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : 'true'" focusable="false" class="icon" v-html="innerHtml" />
  <IconifyIcon v-else-if="iconifyId" :icon="iconifyId" :width="px" :height="px" :title="title"
    :aria-hidden="title ? undefined : 'true'" class="icon" />
  <svg v-else :width="px" :height="px" viewBox="0 0 24 24" fill="none" :role="title ? 'img' : undefined"
    :aria-hidden="title ? undefined : 'true'" focusable="false" class="icon" v-html="innerHtml" />
</template>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: -0.125em;
  flex-shrink: 0;
  line-height: 1;
}
</style>
