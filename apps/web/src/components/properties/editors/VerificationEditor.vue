<script setup lang="ts">
/**
 * Verification property editor.
 *
 * Behaves like a click-to-cycle badge:
 *   none → verified  →  expired (auto if `ttl` lapses)
 * Clicking again resets back to `none`. The verified-at timestamp is
 * captured on the client and stored alongside the state so the server
 * can compute expiry deterministically.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import {
    DURATION_UNIT_MS,
    type PropertyDefinition,
    type VerificationConfig,
    type VerificationState,
    type VerificationValue,
} from '@continuum/shared';

const props = defineProps<{
    value: VerificationValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: VerificationValue] }>();

const cfg = computed(() => props.definition.config as VerificationConfig);

/**
 * Resolve the configured TTL into milliseconds. Prefers the new
 * `{ amount, unit }` pair; falls back to the legacy `ttlDays` field so
 * pre-migration values keep expiring on schedule. Returns 0 when no TTL
 * is configured (= never expire).
 */
const ttlMs = computed<number>(() => {
    const ttl = cfg.value.ttl;
    if (ttl) return ttl.amount * DURATION_UNIT_MS[ttl.unit];
    if (cfg.value.ttlDays) return cfg.value.ttlDays * DURATION_UNIT_MS.days;
    return 0;
});

// Reactive wall-clock so a verified badge flips to `expired` on its own
// once the TTL elapses. Cheap (one timer per mounted editor) and stops on
// unmount.
const now = ref(Date.now());
const tick = window.setInterval(() => {
    now.value = Date.now();
}, 30_000);
onBeforeUnmount(() => window.clearInterval(tick));

const effective = computed<VerificationState>(() => {
    const state = props.value?.state ?? 'unverified';
    if (state !== 'verified') return state;
    const verifiedAt = props.value?.verifiedAt;
    if (ttlMs.value === 0 || !verifiedAt) return state;
    const ageMs = now.value - new Date(verifiedAt).getTime();
    return ageMs > ttlMs.value ? 'expired' : 'verified';
});

const label = computed(() => {
    switch (effective.value) {
        case 'verified': return 'Verified';
        case 'expired': return 'Expired';
        default: return 'Verify';
    }
});

const iconName = computed(() => {
    switch (effective.value) {
        case 'verified': return 'check' as const;
        case 'expired': return 'warning' as const;
        default: return 'plus' as const;
    }
});

function toggle(): void {
    const next: VerificationState = effective.value === 'verified' ? 'unverified' : 'verified';
    emit('update:value', {
        type: 'verification',
        state: next,
        verifiedAt: next === 'verified' ? new Date().toISOString() : null,
    });
}
</script>

<template>
    <button type="button" class="prop-verif" :data-state="effective" @click="toggle">
        <Icon :name="iconName" :size="12" />
        <span>{{ label }}</span>
    </button>
</template>

<style scoped>
.prop-verif {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: 999px; border: var(--border-width-1) solid var(--border);
    background: transparent; color: var(--fg-muted);
    font-size: var(--text-xs); font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard),
                color var(--duration-fast) var(--ease-standard),
                border-color var(--duration-fast) var(--ease-standard);
}
.prop-verif:hover { background: var(--bg-soft); }
.prop-verif[data-state="verified"] {
    background: color-mix(in srgb, var(--success, #22c55e) 15%, transparent);
    border-color: var(--success, #22c55e);
    color: var(--success, #22c55e);
}
.prop-verif[data-state="expired"] {
    background: color-mix(in srgb, var(--warning, #f59e0b) 15%, transparent);
    border-color: var(--warning, #f59e0b);
    color: var(--warning, #f59e0b);
}
</style>
