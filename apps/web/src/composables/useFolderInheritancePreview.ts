/**
 * useFolderInheritancePreview — resolve the *inherited* effective values
 * (defaultKind / icon / color) for a folder being created or edited.
 *
 * The folder form shows "(inherits: …)" hints next to each optional
 * field; this composable centralises the lookup so the form (and any
 * sub-field component) can simply ask: "what would I inherit if I
 * leave this blank?".
 *
 * Behaviour
 * ─────────
 *   • Edit mode → inherits from the folder's *parent* (NOT itself).
 *   • Create mode → inherits from the explicit `parentId` argument.
 *   • Root (no parent) → falls back to {@link ROOT_FALLBACK}.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import { ROOT_FALLBACK } from '@continuum/shared';
import type { FolderEffective, FolderNode } from '@continuum/shared';
import { useFolders } from './useFolders';

export interface FolderInheritancePreviewOptions {
  /** Folder being edited, or `null` when creating a new one. */
  folder: Ref<FolderNode | null>;
  /** Parent folder id used in create mode; ignored when `folder` is set. */
  parentId: Ref<string | null>;
}

export interface FolderInheritancePreviewReturn {
  /** Id of the ancestor whose effective values are inherited. */
  inheritedFrom: ComputedRef<string | null>;
  /** Resolved effective values from that ancestor. */
  inherited: ComputedRef<FolderEffective>;
}

export function useFolderInheritancePreview(
  options: FolderInheritancePreviewOptions,
): FolderInheritancePreviewReturn {
  const folders = useFolders();

  const inheritedFrom = computed<string | null>(() => {
    if (options.folder.value) {
      return folders.byId(options.folder.value.id)?.parentId ?? null;
    }
    return options.parentId.value;
  });

  const inherited = computed<FolderEffective>(
    () => folders.effectiveFor(inheritedFrom.value) ?? ROOT_FALLBACK,
  );

  return { inheritedFrom, inherited };
}
