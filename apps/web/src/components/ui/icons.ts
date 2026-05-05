/**
 * Re-export of the centralized icon registry.
 *
 * The single source of truth lives in `@/assets/icons`. This file exists so
 * existing imports (`@/components/ui/icons`, `./icons`) keep working without
 * a sweeping rename, while guaranteeing there is exactly one registry.
 *
 * `IconName` is an alias of `AppIconName` for backwards compatibility.
 */
export {
  ICONS,
  isValidIconName,
  getIconSvgString,
  type IconDef,
  type AppIconName,
} from '@/assets/icons';
export type { AppIconName as IconName } from '@/assets/icons';
