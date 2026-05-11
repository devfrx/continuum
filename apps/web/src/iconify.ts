/**
 * Bootstrap Iconify with offline icon collections.
 *
 * The `@iconify/vue/dist/offline` entry strips out the network code path
 * entirely — there is no `api.iconify.design` fallback, so any icon
 * lookup that misses the in-memory cache simply renders as the
 * Iconify default placeholder. This is required by Continuum's
 * "everything runs locally" constraint and satisfies the renderer's
 * strict `connect-src` Content Security Policy.
 *
 * Collections registered:
 *   - `solar:*` — Solar Bold (rounded filled). Single source of truth
 *     for every icon rendered by `<Icon>` and the kind picker.
 */
import { addCollection } from '@iconify/vue/dist/offline';
import { icons as solarIcons } from '@iconify-json/solar';

addCollection(solarIcons);
