<script setup lang="ts">
/**
 * ListLayoutSettings.vue — knobs specific to the List renderer.
 *
 * The List renderer is intentionally minimalist; its only knobs are the
 * shared common-display ones. This component still exists for symmetry
 * with the rest of the registry so the panel never has to special-case.
 */
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <CommonDisplayToggles :view="view" @patch-layout="patch" />
</template>
