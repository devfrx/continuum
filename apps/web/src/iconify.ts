/**
 * Bootstrap Iconify with offline icon collections.
 *
 * Iconify normally fetches icon data lazily from its API. We bundle the
 * required JSON locally and feed it to Iconify's in-memory storage on
 * app start, so every lookup resolves instantly with zero network calls.
 * This is required by Continuum's "everything runs locally" constraint.
 *
 * Collections registered:
 *   - `solar:*` — Solar Bold (rounded filled). Single source of truth for
 *     every icon rendered by `<Icon>` and the kind picker.
 */
import { addCollection } from '@iconify/vue';
import { icons as solarIcons } from '@iconify-json/solar';

addCollection(solarIcons);
