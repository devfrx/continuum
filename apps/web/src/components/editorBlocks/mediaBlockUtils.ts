import type { MediaBlockAttrs, MediaBlockKind } from '@continuum/editor';
import type { FileRef } from '@continuum/shared';

export interface MediaBlockMeta {
  label: string;
  icon: 'video' | 'audio' | 'file';
  accept: string;
}

export interface MediaPreviewSource {
  mode: 'direct' | 'embed' | 'file';
  url: string;
  provider: string | null;
  /** Optional poster image URL for the lite-embed facade (avoids loading provider iframe up front). */
  posterUrl: string | null;
}

const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

export const MEDIA_BLOCK_META: Record<MediaBlockKind, MediaBlockMeta> = {
  video: { label: 'Video', icon: 'video', accept: 'video/*' },
  audio: { label: 'Audio', icon: 'audio', accept: 'audio/*' },
  file: { label: 'File', icon: 'file', accept: '' },
};

export function emptyMediaBlockAttrs(kind: MediaBlockKind): MediaBlockAttrs {
  return {
    kind,
    source: null,
    url: null,
    name: null,
    mime: null,
    size: null,
    uploadId: null,
    caption: '',
    schemaVersion: 1,
  };
}

export function attrsFromUpload(kind: MediaBlockKind, ref: FileRef): MediaBlockAttrs {
  return {
    ...emptyMediaBlockAttrs(kind),
    source: 'upload',
    url: ref.url,
    name: ref.name,
    mime: ref.mime,
    size: ref.size,
    uploadId: ref.id,
  };
}

export function formatFileSize(size: number | null): string {
  if (size === null || !Number.isFinite(size)) return '';
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = size / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}

export function mediaDisplayName(attrs: MediaBlockAttrs): string {
  if (attrs.name) return attrs.name;
  if (!attrs.url) return MEDIA_BLOCK_META[attrs.kind].label;
  try {
    const url = new URL(attrs.url, window.location.origin);
    const tail = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) ?? '');
    return tail || url.hostname || MEDIA_BLOCK_META[attrs.kind].label;
  } catch {
    return attrs.url;
  }
}

export function safeMediaUrl(url: string | null, kind: MediaBlockKind): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^blob:/i.test(trimmed)) return trimmed;
  if (kind === 'video' && /^data:video\//i.test(trimmed)) return trimmed;
  if (kind === 'audio' && /^data:audio\//i.test(trimmed)) return trimmed;
  return null;
}

export function resolveMediaPreview(attrs: MediaBlockAttrs): MediaPreviewSource | null {
  const url = safeMediaUrl(attrs.url, attrs.kind);
  if (!url) return null;
  if (attrs.kind === 'file') return { mode: 'file', url, provider: null, posterUrl: null };
  if (attrs.kind === 'video') {
    const embed = videoEmbedUrl(url);
    if (embed) return embed;
  }
  return { mode: 'direct', url, provider: null, posterUrl: null };
}

export function attrsFromLink(kind: MediaBlockKind, rawUrl: string): Partial<MediaBlockAttrs> | null {
  const url = safeMediaUrl(rawUrl, kind);
  if (!url) return null;
  return {
    source: 'link',
    url,
    name: linkName(url, kind),
    mime: null,
    size: null,
    uploadId: null,
  };
}

function linkName(url: string, kind: MediaBlockKind): string {
  const embed = kind === 'video' ? videoEmbedUrl(url) : null;
  if (embed?.provider) return `${embed.provider} video`;
  try {
    const parsed = new URL(url, window.location.origin);
    const tail = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).at(-1) ?? '');
    return tail || parsed.hostname || MEDIA_BLOCK_META[kind].label;
  } catch {
    return MEDIA_BLOCK_META[kind].label;
  }
}

function videoEmbedUrl(rawUrl: string): MediaPreviewSource | null {
  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const youtubeId = youtubeVideoId(parsed, host);
    if (youtubeId) {
      // We render the player inside a click-to-load facade (see MediaBlockPreview),
      // so the iframe never loads until the user explicitly opts in. We use the
      // standard `youtube.com/embed/<id>` host because the privacy-enhanced
      // `youtube-nocookie.com` variant fails playback on `localhost` (the player
      // shows "An error occurred. Please try again later.").
      const embed = new URL(`https://www.youtube.com/embed/${youtubeId}`);
      embed.searchParams.set('rel', '0');
      embed.searchParams.set('modestbranding', '1');
      const start = youtubeStartSeconds(parsed);
      if (start > 0) embed.searchParams.set('start', String(start));
      return {
        mode: 'embed',
        url: embed.toString(),
        provider: 'YouTube',
        posterUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      };
    }
    const vimeoId = vimeoVideoId(parsed, host);
    if (vimeoId) {
      return { mode: 'embed', url: `https://player.vimeo.com/video/${vimeoId}`, provider: 'Vimeo', posterUrl: null };
    }
  } catch {
    return null;
  }
  return null;
}

/** Returns a trusted iframe player URL, or null for provider pages that block framing. */
export function safeIframeEmbedUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);
    if ((host === 'youtube.com' || host === 'youtube-nocookie.com') && parts[0] === 'embed' && cleanProviderId(parts[1] ?? '')) {
      return parsed.toString();
    }
    if (host === 'player.vimeo.com' && parts[0] === 'video' && /^\d+$/.test(parts[1] ?? '')) {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

function youtubeVideoId(url: URL, host: string): string | null {
  if (host === 'youtu.be') return cleanProviderId(url.pathname.slice(1));
  if (host !== 'youtube.com' && host !== 'youtube-nocookie.com' && host !== 'm.youtube.com') return null;
  if (url.pathname === '/watch') return cleanProviderId(url.searchParams.get('v') ?? '');
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') return cleanProviderId(parts[1] ?? '');
  return null;
}

function vimeoVideoId(url: URL, host: string): string | null {
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const candidate = parts[0] === 'video' ? parts[1] : parts[0];
  return /^\d+$/.test(candidate ?? '') ? candidate ?? null : null;
}

function cleanProviderId(value: string): string | null {
  const id = value.trim();
  return YOUTUBE_VIDEO_ID.test(id) ? id : null;
}

function youtubeStartSeconds(url: URL): number {
  const raw = url.searchParams.get('start') ?? url.searchParams.get('t') ?? '';
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(raw);
  if (!match || !match[0]) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}
