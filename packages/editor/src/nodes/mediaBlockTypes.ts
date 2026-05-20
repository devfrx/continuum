/**
 * Shared attr helpers for video, audio and file blocks.
 *
 * The editor stores only portable metadata; uploads and URL validation live
 * in the host renderer so the package remains free of app-specific APIs.
 */
import type { FileRef } from '@continuum/shared';

export const MEDIA_BLOCK_SCHEMA_VERSION = 1;
export const MEDIA_BLOCK_KINDS = ['video', 'audio', 'file'] as const;

export type MediaBlockKind = (typeof MEDIA_BLOCK_KINDS)[number];
export type MediaBlockSource = 'upload' | 'link' | null;

export interface MediaBlockAttrs {
  kind: MediaBlockKind;
  source: MediaBlockSource;
  url: string | null;
  name: string | null;
  mime: string | null;
  size: number | null;
  uploadId: string | null;
  caption: string;
  schemaVersion: number;
}

export function isMediaBlockKind(value: unknown): value is MediaBlockKind {
  return typeof value === 'string' && MEDIA_BLOCK_KINDS.includes(value as MediaBlockKind);
}

function safeKind(value: unknown): MediaBlockKind {
  return isMediaBlockKind(value) ? value : 'file';
}

function safeSource(value: unknown): MediaBlockSource {
  return value === 'upload' || value === 'link' ? value : null;
}

function safeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeSize(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function createMediaBlockAttrs(
  kind: MediaBlockKind,
  input: Partial<MediaBlockAttrs> = {},
): MediaBlockAttrs {
  return {
    kind,
    source: safeSource(input.source),
    url: safeString(input.url),
    name: safeString(input.name),
    mime: safeString(input.mime),
    size: safeSize(input.size),
    uploadId: safeString(input.uploadId),
    caption: typeof input.caption === 'string' ? input.caption : '',
    schemaVersion: typeof input.schemaVersion === 'number'
      ? input.schemaVersion
      : MEDIA_BLOCK_SCHEMA_VERSION,
  };
}

export function normalizeMediaBlockAttrs(
  input: Partial<MediaBlockAttrs> | null | undefined,
): MediaBlockAttrs {
  return createMediaBlockAttrs(safeKind(input?.kind), input ?? {});
}

export function mediaAttrsFromFile(kind: MediaBlockKind, ref: FileRef): MediaBlockAttrs {
  return createMediaBlockAttrs(kind, {
    source: 'upload',
    url: ref.url,
    name: ref.name,
    mime: ref.mime,
    size: ref.size,
    uploadId: ref.id,
  });
}
