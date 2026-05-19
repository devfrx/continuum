<script setup lang="ts">
/**
 * Merge-schema modal — surfaces the schema delta produced by
 * `api.databases.rows.previewLink(databaseId, noteId)` and lets the
 * user pick a per-collision action before committing the link.
 *
 * Three layers of information are shown:
 *
 *   1. Inherited      — shared definitions the note will inherit silently.
 *   2. Promoted       — private definitions promoted to the shared schema.
 *   3. Collisions     — same-key definitions on both sides; the user
 *                       must pick `merge` (only if types match), `rename`
 *                       (give the private a new key/label and keep it
 *                       distinct in the shared schema), or `keepPrivate`
 *                       (leave the private bound to the note, shadowed
 *                       by the shared one in views).
 *
 * On confirm the modal emits `confirm` with the assembled resolution
 * entries. The parent owns the round-trip to
 * `api.databases.rows.resolveLink` so realtime publishers stay close to
 * the data they invalidate.
 */
import { computed, reactive, watch } from 'vue';
import UiModal from '@/components/ui/UiModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiInput from '@/components/ui/UiInput.vue';
import Icon from '@/components/ui/Icon.vue';
import type {
    PropertyMergeAction,
    PropertyMergePreview,
    PropertyMergeResolutionEntry,
} from '@continuum/shared';

interface Props {
    modelValue: boolean;
    /** Pre-fetched preview from `api.databases.rows.previewLink`. */
    preview: PropertyMergePreview;
    /** Friendly database name shown in the dialog title. */
    databaseName: string;
    /** Friendly note title shown in the dialog title. */
    noteTitle: string;
    /** When true the confirm button shows a loading state. */
    busy?: boolean;
    /** Optional error string shown above the footer. */
    errorMessage?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
    busy: false,
    errorMessage: null,
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    confirm: [resolutions: PropertyMergeResolutionEntry[]];
    cancel: [];
}>();

interface CollisionState {
    action: PropertyMergeAction;
    renameKey: string;
    renameLabel: string;
}

// Reactive per-collision state keyed by collision.key. Re-seeded every
// time a fresh preview comes in so reopening the modal for a different
// note doesn't carry stale picks.
const state = reactive<Record<string, CollisionState>>({});

function seedState(): void {
    for (const key of Object.keys(state)) delete state[key];
    for (const collision of props.preview.collisions) {
        state[collision.key] = {
            action: collision.suggested,
            renameKey: `${collision.private.key}_2`,
            renameLabel: `${collision.private.label} (private)`,
        };
    }
}

watch(
    () => [props.modelValue, props.preview] as const,
    ([open]) => {
        if (open) seedState();
    },
    { immediate: true, deep: true },
);

// Disable confirm when any rename action is missing inputs — the
// backend would reject the payload anyway, but failing fast keeps the
// UX tight.
const validationError = computed<string | null>(() => {
    for (const collision of props.preview.collisions) {
        const pick = state[collision.key];
        if (!pick) continue;
        if (pick.action === 'merge' && !collision.compatible) {
            return `"${collision.key}" cannot be merged — types differ. Pick "Rename" or "Keep private".`;
        }
        if (pick.action === 'rename') {
            if (!pick.renameKey.trim() || !pick.renameLabel.trim()) {
                return `"${collision.key}" needs a new key and label for rename.`;
            }
        }
    }
    return null;
});

const canConfirm = computed(() => !props.busy && validationError.value === null);

const summaryCounts = computed(() => ({
    inherited: props.preview.autoInherited.length,
    promoted: props.preview.autoPromoted.length,
    collisions: props.preview.collisions.length,
}));

function pickAction(key: string, action: PropertyMergeAction): void {
    const entry = state[key];
    if (!entry) return;
    entry.action = action;
}

function onConfirm(): void {
    if (!canConfirm.value) return;
    const resolutions: PropertyMergeResolutionEntry[] = props.preview.collisions.map(
        (collision) => {
            const pick = state[collision.key];
            if (!pick) {
                return { key: collision.key, action: 'keepPrivate' };
            }
            if (pick.action === 'rename') {
                return {
                    key: collision.key,
                    action: 'rename',
                    renameTo: {
                        key: pick.renameKey.trim(),
                        label: pick.renameLabel.trim(),
                    },
                };
            }
            return { key: collision.key, action: pick.action };
        },
    );
    emit('confirm', resolutions);
}

function onCancel(): void {
    emit('cancel');
    emit('update:modelValue', false);
}
</script>

<template>
    <UiModal :model-value="modelValue" title="Link note to database" size="lg"
        persistent @update:model-value="(v) => emit('update:modelValue', v)" @close="onCancel">
        <div class="merge-schema">
            <p class="merge-schema__lede">
                Linking <strong>{{ noteTitle }}</strong> to <strong>{{ databaseName }}</strong>
                requires reconciling its private schema with the shared one.
            </p>

            <div class="merge-schema__summary" role="status">
                <span class="merge-schema__pill merge-schema__pill--inherit">
                    <Icon name="arrow-down" :size="11" />
                    {{ summaryCounts.inherited }} inherited
                </span>
                <span class="merge-schema__pill merge-schema__pill--promote">
                    <Icon name="arrow-up" :size="11" />
                    {{ summaryCounts.promoted }} promoted
                </span>
                <span class="merge-schema__pill merge-schema__pill--collide">
                    <Icon name="alert-triangle" :size="11" />
                    {{ summaryCounts.collisions }} collisions
                </span>
            </div>

            <section v-if="preview.autoInherited.length" class="merge-schema__section">
                <header class="merge-schema__section-title">
                    Will be inherited from the database
                </header>
                <ul class="merge-schema__list">
                    <li v-for="def in preview.autoInherited" :key="def.id" class="merge-schema__item">
                        <span class="merge-schema__key">{{ def.label }}</span>
                        <span class="merge-schema__type">{{ def.type }}</span>
                    </li>
                </ul>
            </section>

            <section v-if="preview.autoPromoted.length" class="merge-schema__section">
                <header class="merge-schema__section-title">
                    Will be promoted to the shared schema
                </header>
                <ul class="merge-schema__list">
                    <li v-for="def in preview.autoPromoted" :key="def.id" class="merge-schema__item">
                        <span class="merge-schema__key">{{ def.label }}</span>
                        <span class="merge-schema__type">{{ def.type }}</span>
                    </li>
                </ul>
            </section>

            <section v-if="preview.collisions.length" class="merge-schema__section">
                <header class="merge-schema__section-title">
                    Conflicts to resolve
                </header>
                <ul class="merge-schema__collisions">
                    <li v-for="collision in preview.collisions" :key="collision.key"
                        class="merge-schema__collision">
                        <div class="merge-schema__collision-head">
                            <div class="merge-schema__collision-side">
                                <span class="merge-schema__side-label">Private</span>
                                <span class="merge-schema__key">{{ collision.private.label }}</span>
                                <span class="merge-schema__type">{{ collision.private.type }}</span>
                            </div>
                            <Icon name="arrow-right" :size="14" class="merge-schema__collision-arrow" />
                            <div class="merge-schema__collision-side">
                                <span class="merge-schema__side-label">Shared</span>
                                <span class="merge-schema__key">{{ collision.shared.label }}</span>
                                <span class="merge-schema__type">{{ collision.shared.type }}</span>
                            </div>
                        </div>

                        <div class="merge-schema__actions" role="radiogroup"
                            :aria-label="`Resolve ${collision.key}`">
                            <button type="button" class="merge-schema__action"
                                :class="{ 'is-active': state[collision.key]?.action === 'merge' }"
                                :disabled="!collision.compatible"
                                :title="collision.compatible ? 'Move values onto the shared definition'
                                    : 'Types differ — merge unavailable'"
                                role="radio"
                                :aria-checked="state[collision.key]?.action === 'merge'"
                                @click="pickAction(collision.key, 'merge')">
                                <Icon name="merge" :size="12" />
                                <span>Merge</span>
                            </button>
                            <button type="button" class="merge-schema__action"
                                :class="{ 'is-active': state[collision.key]?.action === 'rename' }"
                                role="radio"
                                :aria-checked="state[collision.key]?.action === 'rename'"
                                @click="pickAction(collision.key, 'rename')">
                                <Icon name="edit" :size="12" />
                                <span>Rename</span>
                            </button>
                            <button type="button" class="merge-schema__action"
                                :class="{ 'is-active': state[collision.key]?.action === 'keepPrivate' }"
                                role="radio"
                                :aria-checked="state[collision.key]?.action === 'keepPrivate'"
                                @click="pickAction(collision.key, 'keepPrivate')">
                                <Icon name="lock" :size="12" />
                                <span>Keep private</span>
                            </button>
                        </div>

                        <div v-if="state[collision.key]?.action === 'rename'"
                            class="merge-schema__rename">
                            <label class="merge-schema__rename-field">
                                <span>New key</span>
                                <UiInput v-model="state[collision.key]!.renameKey"
                                    placeholder="new_key" />
                            </label>
                            <label class="merge-schema__rename-field">
                                <span>New label</span>
                                <UiInput v-model="state[collision.key]!.renameLabel"
                                    placeholder="New label" />
                            </label>
                        </div>

                        <p v-if="state[collision.key]?.action === 'merge' && !collision.compatible"
                            class="merge-schema__hint merge-schema__hint--warn">
                            Types differ ({{ collision.private.type }} vs {{ collision.shared.type }}).
                            Merge would lose data — pick Rename or Keep private.
                        </p>
                    </li>
                </ul>
            </section>

            <p v-if="errorMessage" class="merge-schema__error" role="alert">
                {{ errorMessage }}
            </p>
            <p v-else-if="validationError" class="merge-schema__error" role="alert">
                {{ validationError }}
            </p>
        </div>

        <template #footer>
            <UiButton variant="ghost" size="sm" :disabled="busy" @click="onCancel">
                Cancel
            </UiButton>
            <UiButton variant="primary" size="sm" :disabled="!canConfirm" @click="onConfirm">
                {{ busy ? 'Linking…' : 'Link note' }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.merge-schema {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-height: 70vh;
    overflow-y: auto;
}

.merge-schema__lede {
    margin: 0;
    color: var(--fg-muted);
    font-size: var(--text-sm);
}

.merge-schema__summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
}

.merge-schema__pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--fg-muted);
    background: var(--bg-soft);
}

.merge-schema__pill--inherit {
    color: color-mix(in srgb, var(--accent) 80%, var(--fg-muted));
}

.merge-schema__pill--promote {
    color: color-mix(in srgb, var(--success, #2f9e44) 80%, var(--fg-muted));
}

.merge-schema__pill--collide {
    color: color-mix(in srgb, var(--warning, #f59f00) 90%, var(--fg-muted));
}

.merge-schema__section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.merge-schema__section-title {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fg-subtle);
}

.merge-schema__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.merge-schema__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    font-size: var(--text-sm);
}

.merge-schema__key {
    font-weight: 500;
    color: var(--fg);
}

.merge-schema__type {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    font-variant: small-caps;
    letter-spacing: 0.04em;
}

.merge-schema__collisions {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.merge-schema__collision {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--bg-soft);
}

.merge-schema__collision-head {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--space-2);
}

.merge-schema__collision-side {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.merge-schema__side-label {
    font-size: var(--text-xxs, 10px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-subtle);
}

.merge-schema__collision-arrow {
    color: var(--fg-subtle);
}

.merge-schema__actions {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
}

.merge-schema__action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: var(--border-width-1) solid var(--border);
    background: var(--bg);
    color: var(--fg-muted);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.merge-schema__action:hover:not(:disabled) {
    background: var(--bg-soft);
    color: var(--fg);
}

.merge-schema__action.is-active {
    border-color: color-mix(in srgb, var(--accent) 60%, transparent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
}

.merge-schema__action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.merge-schema__rename {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
}

.merge-schema__rename-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}

.merge-schema__hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}

.merge-schema__hint--warn {
    color: color-mix(in srgb, var(--warning, #f59f00) 90%, var(--fg-muted));
}

.merge-schema__error {
    margin: 0;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--danger, #e03131) 12%, transparent);
    color: color-mix(in srgb, var(--danger, #e03131) 90%, var(--fg));
    font-size: var(--text-xs);
}
</style>
