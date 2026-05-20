import type { CoverPosition } from '@continuum/shared';

export const DEFAULT_COVER_POSITION: CoverPosition = { x: 50, y: 50 };

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(100, Math.max(0, value));
}

export function normalizeCoverPosition(position: CoverPosition | null | undefined): CoverPosition {
  return {
    x: clampPercent(position?.x ?? DEFAULT_COVER_POSITION.x),
    y: clampPercent(position?.y ?? DEFAULT_COVER_POSITION.y),
  };
}

export function coverBackgroundPosition(position: CoverPosition | null | undefined): string {
  const normalized = normalizeCoverPosition(position);
  return `${normalized.x}% ${normalized.y}%`;
}