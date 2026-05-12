<script setup lang="ts">
/**
 * SearchInput — debounced free-text search bound to `view.search`.
 *
 * Emits `update` with the cleaned value (`null` when blank) after a
 * 250 ms quiet period so we don't spam the server while the user types.
 */
import { ref, watch, onBeforeUnmount } from 'vue';
import UiInput from '@/components/ui/UiInput.vue';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps<{ modelValue: string | null | undefined }>();
const emit = defineEmits<{ update: [value: string | null] }>();

const local = ref<string>(props.modelValue ?? '');
let timer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => props.modelValue,
    (v) => {
        const next = v ?? '';
        if (next !== local.value) local.value = next;
    },
);

watch(local, (v) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
        const trimmed = v.trim();
        emit('update', trimmed.length > 0 ? trimmed : null);
    }, 250);
});

onBeforeUnmount(() => {
    if (timer) clearTimeout(timer);
});
</script>

<template>
    <UiInput v-model="local" placeholder="Search…" size="sm" :left-icon="true" class="db-search">
        <template #icon>
            <Icon name="search" :size="14" />
        </template>
    </UiInput>
</template>

<style scoped>
.db-search {
    max-width: 240px;
}
</style>
