/**
 * Shared row-display wiring for implemented database renderers.
 *
 * Keeps common layout knobs (`showPageIcon`, `wrapContent`, `openIn`)
 * consistent across Table, List, Board, Gallery and Calendar without
 * copying router/kind-store logic into every renderer.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useKinds } from '@/composables/useKinds';
import type { DatabaseView } from '@continuum/shared';
import { openDatabaseRow, readCommonDisplay } from './layout';

export function useDatabaseRowDisplay(getView: () => DatabaseView) {
  const router = useRouter();
  const kinds = useKinds();
  void kinds.load();

  const common = computed(() => readCommonDisplay(getView().config.layout));

  function openRow(noteId: string): void {
    openDatabaseRow(router, noteId, common.value.openIn);
  }

  function iconOf(kind: string): string {
    return kinds.iconOf(kind || 'note');
  }

  function colorOf(kind: string): string {
    return kinds.colorOf(kind || 'note');
  }

  return { common, openRow, iconOf, colorOf };
}
