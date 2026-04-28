<script setup lang="ts">
/**
 * Reusable modal/dialog primitive.
 *
 * Renders a centered card on top of a dimmed backdrop with focus trap,
 * Escape-to-close, and a click-outside-to-close affordance. Content is
 * fully slot-driven so any view can compose its own body / footer.
 *
 * Accessibility:
 *   - rendered into `document.body` via `<Teleport>` so it always sits
 *     above floating panels and never inherits clipping ancestors;
 *   - sets `role="dialog"` + `aria-modal="true"`;
 *   - focuses the first focusable element when opened and restores
 *     focus to the previously-focused element when closed;
 *   - body scroll is locked while the modal is open.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from './Icon.vue';

interface Props {
    modelValue: boolean;
    title?: string;
    /** Visual width tier. Defaults to "md" (~440px). */
    size?: 'sm' | 'md' | 'lg';
    /** Hide the [×] close button in the header. */
    hideClose?: boolean;
    /** Disable the backdrop-click-to-dismiss behavior. */
    persistent?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    size: 'md',
    hideClose: false,
    persistent: false,
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    open: [];
    close: [];
}>();

const dialogRef = ref<HTMLElement | null>(null);
let previouslyFocused: HTMLElement | null = null;

const sizeClass = computed(() => `ui-modal__card--${props.size}`);

function close() {
    if (!props.modelValue) return;
    emit('update:modelValue', false);
    emit('close');
}

function onBackdropClick() {
    if (props.persistent) return;
    close();
}

function onKeydown(e: KeyboardEvent) {
    if (!props.modelValue) return;
    if (e.key === 'Escape' && !props.persistent) {
        e.preventDefault();
        close();
    }
}

function focusFirst() {
    const root = dialogRef.value;
    if (!root) return;
    const candidate = root.querySelector<HTMLElement>(
        'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    );
    candidate?.focus();
}

watch(
    () => props.modelValue,
    async (open) => {
        if (open) {
            previouslyFocused = (document.activeElement as HTMLElement) ?? null;
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', onKeydown);
            emit('open');
            await nextTick();
            focusFirst();
        } else {
            window.removeEventListener('keydown', onKeydown);
            document.body.style.overflow = '';
            previouslyFocused?.focus?.();
            previouslyFocused = null;
        }
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown);
    if (props.modelValue) document.body.style.overflow = '';
});
</script>

<template>
    <Teleport to="body">
        <Transition name="ui-modal">
            <div v-if="modelValue" class="ui-modal" role="dialog" aria-modal="true" @mousedown.self="onBackdropClick">
                <div ref="dialogRef" class="ui-modal__card" :class="sizeClass" @mousedown.stop>
                    <header v-if="title || !hideClose" class="ui-modal__header">
                        <h2 v-if="title" class="ui-modal__title">{{ title }}</h2>
                        <span v-else class="ui-modal__title" />
                        <button v-if="!hideClose" class="ui-modal__close" type="button" aria-label="Close"
                            @click="close">
                            <Icon name="close" :size="16" />
                        </button>
                    </header>
                    <div class="ui-modal__body">
                        <slot />
                    </div>
                    <footer v-if="$slots.footer" class="ui-modal__footer">
                        <slot name="footer" />
                    </footer>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.ui-modal {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-12);
    background: var(--bg-overlay);
    backdrop-filter: blur(2px);
}

.ui-modal__card {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: calc(100vh - var(--space-24));
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    overflow: hidden;
}

.ui-modal__card--sm {
    max-width: 340px;
}

.ui-modal__card--md {
    max-width: 460px;
}

.ui-modal__card--lg {
    max-width: 680px;
}

.ui-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
    padding: var(--space-7) var(--space-8);
    border-bottom: var(--border-width-1) solid var(--border);
}

.ui-modal__title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--font-weight-semibold);
    color: var(--fg-strong);
    letter-spacing: var(--tracking-snug);
}

.ui-modal__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    color: var(--fg-subtle);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.ui-modal__close:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.ui-modal__body {
    padding: var(--space-10) var(--space-8);
    overflow: auto;
    color: var(--fg);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
}

.ui-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-8);
    border-top: var(--border-width-1) solid var(--border);
    background: var(--bg-soft);
}

/* enter / leave */
.ui-modal-enter-active,
.ui-modal-leave-active {
    transition: opacity var(--duration-base) var(--ease-standard);
}

.ui-modal-enter-active .ui-modal__card,
.ui-modal-leave-active .ui-modal__card {
    transition:
        transform var(--duration-base) var(--ease-emphasized),
        opacity var(--duration-base) var(--ease-standard);
}

.ui-modal-enter-from,
.ui-modal-leave-to {
    opacity: 0;
}

.ui-modal-enter-from .ui-modal__card,
.ui-modal-leave-to .ui-modal__card {
    transform: translateY(8px) scale(0.98);
    opacity: 0;
}
</style>
