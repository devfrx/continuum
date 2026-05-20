/**
 * "Turn into" menu adapter.
 *
 * Transformation rules live in `blocks/blockTransforms.ts`; this module only
 * projects those rules into the shared `ContextMenuItem` shape rendered by
 * the host application's `UiContextMenu`.
 */
import type { ContextMenuItem } from '@continuum/shared';
import type { MenuContext } from '../editorMenu';
import {
  getTurnIntoSourceTypeAtSelection,
  getTurnIntoTargetsForSource,
  runTurnIntoTarget,
  type TurnIntoGroup,
  type TurnIntoTarget,
} from '../blocks/blockTransforms';

export function buildTurnIntoMenuItem(context: MenuContext): ContextMenuItem | null {
  const sourceType = getTurnIntoSourceTypeAtSelection(context.editor);
  const targets = getTurnIntoTargetsForSource(sourceType);
  if (targets.length === 0) return null;
  if (targets.length === 1) {
    const target = targets[0]!;
    return {
      id: `turn-into-${target.id}`,
      label: `Turn into ${target.label}`,
      icon: target.icon,
      shortcut: target.shortcut,
      active: target.isActive(context.editor),
      onSelect: () => runTurnIntoTarget(context.editor, target.id),
    };
  }
  return {
    id: 'turn-into',
    label: 'Turn into',
    icon: 'edit',
    children: buildTurnIntoChildren(context, targets),
  };
}

function buildTurnIntoChildren(
  context: MenuContext,
  targets: readonly TurnIntoTarget[],
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  let previousGroup: TurnIntoGroup | null = null;
  for (const target of targets) {
    if (previousGroup !== null && target.group !== previousGroup) {
      items.push({ id: `ti-divider-${target.group}`, divider: true });
    }
    previousGroup = target.group;
    items.push({
      id: `ti-${target.id}`,
      label: target.label,
      icon: target.icon,
      shortcut: target.shortcut,
      active: target.isActive(context.editor),
      onSelect: () => runTurnIntoTarget(context.editor, target.id),
    });
  }
  return items;
}
