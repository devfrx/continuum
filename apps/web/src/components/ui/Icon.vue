<script setup lang="ts">
/**
 * Centralized icon component.
 *
 * Renders one of the icons declared in `./icons.ts` OR — when the `name`
 * looks like an Iconify identifier (`prefix:slug`, e.g. `lucide:sword`) —
 * delegates to `@iconify/vue` so users can pick from the bundled Lucide
 * set (~1500 icons) without bundling each as a hand-authored SVG.
 *
 * Color always inherits from the parent via `currentColor`. When `title`
 * is provided the SVG exposes itself as `role="img"` with an `<title>`
 * element; otherwise it is hidden from assistive tech.
 */
import { computed } from 'vue';
import { Icon as IconifyIcon } from '@iconify/vue';
import { ICONS, isValidIconName, warnMissingIconOnce, type IconName } from './icons';

const props = withDefaults(
    defineProps<{
        /**
         * Icon identifier. Use one of the registered `IconName` values for
         * autocomplete + compile-time safety. An Iconify id like
         * `lucide:user` is also accepted; plain `string` lets callers pass
         * dynamic data (e.g. user-defined categories) — unknown names render
         * the dashed-square fallback at runtime.
         */
        name: IconName | (string & {});
        size?: number | string;
        title?: string;
    }>(),
    { size: 16 },
);

const FALLBACK_CONTENT =
    '<rect x="2" y="2" width="20" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2"/>';

const px = computed<string>(() => {
    if (typeof props.size === 'number') return `${props.size}px`;
    return props.size;
});

/** Iconify ids carry a colon (e.g. `lucide:sword`). */
const isIconify = computed<boolean>(() => props.name.includes(':'));

const def = computed(() => {
    if (isIconify.value) return null;
    if (isValidIconName(props.name)) return ICONS[props.name];
    warnMissingIconOnce(props.name);
    return null;
});

const vb = computed<string>(() => def.value?.viewBox ?? '0 0 24 24');

const inner = computed<string>(() => {
    const base = def.value ? def.value.content : FALLBACK_CONTENT;
    return props.title ? `<title>${escapeXml(props.title)}</title>${base}` : base;
});

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
    <IconifyIcon v-if="isIconify" :icon="name" :width="px" :height="px" :title="title"
        :aria-hidden="title ? undefined : 'true'" class="icon" />
    <svg v-else :width="px" :height="px" :viewBox="vb" fill="currentColor" :role="title ? 'img' : undefined"
        :aria-hidden="title ? undefined : 'true'" focusable="false" class="icon" v-html="inner" />
</template>

<style scoped>
.icon {
    display: inline-block;
    vertical-align: -0.125em;
    flex-shrink: 0;
    line-height: 1;
}
</style>
