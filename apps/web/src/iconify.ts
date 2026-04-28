/**
 * Bootstrap Iconify with offline icon collections.
 *
 * Iconify normally fetches icon data lazily from its API. We bundle the
 * required JSON locally and feed it to Iconify's in-memory storage on
 * app start, so every lookup resolves instantly with zero network calls.
 * This is required by Continuum's "everything runs locally" constraint.
 *
 * Collections registered:
 *   - `ph:*` — Phosphor Icons (used for the kind/category picker; the
 *     `-fill` variants give us the rounded + filled style that matches
 *     Continuum's hand-authored icon set).
 *   - `lucide:*` — kept loaded as a secondary set for future use.
 */
import { addCollection } from '@iconify/vue';
import phosphor from '@iconify-json/ph/icons.json';
import lucide from '@iconify-json/lucide/icons.json';

addCollection(phosphor as Parameters<typeof addCollection>[0]);
addCollection(lucide as Parameters<typeof addCollection>[0]);
