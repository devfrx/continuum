import { describe, expect, it } from 'vitest';
import type { MediaBlockAttrs } from '@continuum/editor';
import { resolveMediaPreview, safeIframeEmbedUrl } from '@/components/editorBlocks/mediaBlockUtils';

function videoAttrs(url: string): MediaBlockAttrs {
  return {
    kind: 'video',
    source: 'link',
    url,
    name: null,
    mime: null,
    size: null,
    uploadId: null,
    caption: '',
    schemaVersion: 1,
  };
}

describe('mediaBlockUtils', () => {
  it('normalizes YouTube watch links to the iframe player endpoint', () => {
    const preview = resolveMediaPreview(videoAttrs('https://www.youtube.com/watch?v=Xfba147mgM4'));

    expect(preview).toMatchObject({ mode: 'embed', provider: 'YouTube' });
    expect(preview?.url).toBe('https://www.youtube.com/embed/Xfba147mgM4?rel=0&modestbranding=1');
    expect(preview?.posterUrl).toBe('https://i.ytimg.com/vi/Xfba147mgM4/hqdefault.jpg');
  });

  it('preserves YouTube start times while avoiding non-player iframe URLs', () => {
    const preview = resolveMediaPreview(videoAttrs('https://youtu.be/Xfba147mgM4?t=1m2s'));

    expect(preview?.url).toBe(
      'https://www.youtube.com/embed/Xfba147mgM4?rel=0&modestbranding=1&start=62',
    );
    expect(safeIframeEmbedUrl('https://www.youtube.com/')).toBeNull();
    expect(safeIframeEmbedUrl('https://www.youtube-nocookie.com/')).toBeNull();
    expect(
      safeIframeEmbedUrl('https://www.youtube.com/embed/Xfba147mgM4?rel=0'),
    ).toBe('https://www.youtube.com/embed/Xfba147mgM4?rel=0');
  });
});