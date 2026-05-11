/**
 * Sigma drag / hover / click / right-click bindings for the 2D
 * Knowledge Graph view. The handlers mutate caller-owned state via
 * the supplied callbacks; they hold no reactive references of their
 * own so the file stays test-friendly and free of Vue imports.
 */
import type { Graph, LiveSimulationHandle, Sigma } from '@continuum/graph';

export interface InteractionCallbacks {
  /** Called on left-click — usually `selected.value = buildSelected(...)`. */
  onSelectNode(id: string): void;
  /** Called on double-click. */
  onOpenNote(id: string): void;
  /** Called on stage click — usually clears selection + closes ctx menu. */
  onClickStage(): void;
  /** Called on right-click on a node. */
  onContextMenu(evt: { id: string; clientX: number; clientY: number; highlighted: boolean }): void;
  /** Hover callbacks update the focus subgraph. */
  onHoverNode(id: string | null): void;
  onHoverEdge(id: string | null): void;
  /** Cursor accessor — the container element whose cursor changes during drag. */
  container(): HTMLElement | null;
}

export interface InteractionHandle {
  /** Module-private drag state; release on global mouseup safety net. */
  isDragging(): boolean;
  /** Force-release any in-progress drag (called from window mouseup). */
  releaseDrag(): void;
}

export function bindInteractions(
  sigma: Sigma,
  graph: Graph,
  liveSim: LiveSimulationHandle | null,
  cb: InteractionCallbacks,
): InteractionHandle {
  let draggedNode: string | null = null;
  let isDragging = false;

  // --- Node drag (LEFT mouse button only — right is reserved for ctx menu) ---
  sigma.on('downNode', (e) => {
    const orig = e.event.original as MouseEvent | undefined;
    if (orig && orig.button !== 0) return; // ignore right / middle
    isDragging = true;
    draggedNode = e.node;
    liveSim?.setDragged(e.node);
    if (!sigma.getCustomBBox()) sigma.setCustomBBox(sigma.getBBox());
    const el = cb.container();
    if (el) el.style.cursor = 'grabbing';
  });

  sigma.getMouseCaptor().on('mousemovebody', (e) => {
    if (!isDragging || !draggedNode) return;
    const pos = sigma.viewportToGraph(e);
    graph.setNodeAttribute(draggedNode, 'x', pos.x);
    graph.setNodeAttribute(draggedNode, 'y', pos.y);
    e.preventSigmaDefault();
    e.original.preventDefault();
    e.original.stopPropagation();
  });

  const handleUp = (rawEvent?: unknown): void => {
    // Some Sigma builds emit `mouseup` for any button; only release on left.
    const wrapped = rawEvent as { original?: MouseEvent } | MouseEvent | undefined;
    const ev = (wrapped as { original?: MouseEvent } | undefined)?.original
      ?? (wrapped as MouseEvent | undefined);
    if (ev && typeof ev.button === 'number' && ev.button !== 0) return;
    if (!isDragging) return;
    isDragging = false;
    draggedNode = null;
    liveSim?.setDragged(null);
    const el = cb.container();
    if (el) el.style.cursor = '';
    // Intentionally NO reheat here — the previous behaviour (reheat 0.3)
    // injected fresh energy on release, which made nodes visibly drift
    // back toward the centroid. Letting the baseline alpha handle
    // everything keeps the dropped position stable.
  };
  sigma.getMouseCaptor().on('mouseup', handleUp as (c: unknown) => void);
  (sigma.getMouseCaptor() as unknown as {
    on(type: string, listener: (e?: unknown) => void): void;
  }).on('mouseupbody', handleUp);

  // --- Hover (suppressed during drag to avoid focus flicker) ---
  sigma.on('enterNode', ({ node }) => {
    if (isDragging) return;
    cb.onHoverNode(node);
    const el = cb.container();
    if (el) el.style.cursor = 'pointer';
  });
  sigma.on('leaveNode', () => {
    if (isDragging) return;
    cb.onHoverNode(null);
    const el = cb.container();
    if (el) el.style.cursor = '';
  });
  sigma.on('enterEdge', ({ edge }) => {
    if (isDragging) return;
    cb.onHoverEdge(edge);
  });
  sigma.on('leaveEdge', () => {
    if (isDragging) return;
    cb.onHoverEdge(null);
  });

  // --- Click / select / open ---
  sigma.on('clickNode', ({ node, event }) => {
    // Sigma fires clickNode after a drag too; ignore those.
    if (event.original && (event.original as MouseEvent).button !== 0) return;
    cb.onSelectNode(node);
  });
  sigma.on('doubleClickNode', ({ node, event }) => {
    event.preventSigmaDefault();
    cb.onOpenNote(node);
  });
  sigma.on('clickStage', () => {
    cb.onClickStage();
  });

  // --- Right-click → context menu (Sigma v3 native event) ---
  // Empty-stage right-click is intentionally NOT handled: in 2D it has
  // no panning role (Sigma pans with left-drag), but capturing it would
  // still trip a popup that masks the canvas. The native browser
  // context menu is suppressed by `preventNativeContextMenu` registered
  // on the container. Note creation is reachable via the toolbar
  // "New note" button.
  sigma.on('rightClickNode', ({ node, event }) => {
    event.preventSigmaDefault();
    event.original.preventDefault();
    event.original.stopPropagation();
    const orig = event.original as MouseEvent;
    cb.onContextMenu({
      id: node,
      clientX: orig.clientX,
      clientY: orig.clientY,
      highlighted: Boolean(graph.getNodeAttribute(node, 'userHighlight')),
    });
  });

  // NOTE: do NOT bind a generic `rightClick` handler that closes the menu
  // — it would fire immediately after `rightClickNode` and dismiss it.
  // Outside-click closure is handled by the document listener.

  return {
    isDragging: () => isDragging,
    releaseDrag: () => {
      if (!isDragging) return;
      isDragging = false;
      draggedNode = null;
      liveSim?.setDragged(null);
      const el = cb.container();
      if (el) el.style.cursor = '';
    },
  };
}
