/**
 * Three.js / 3d-force-graph bootstrap for the knowledge-graph canvas.
 *
 * Owns:
 *   - the `ForceGraph3DInstance` (renderer / scene / camera / animation
 *     loop are driven internally by 3d-force-graph),
 *   - the cinematic light rig (ambient + hemisphere + key + warm rim),
 *   - the scene fog tied to the palette background colour,
 *   - the `ResizeObserver` that pushes `clientWidth/Height` into the
 *     WebGL renderer when the host element resizes,
 *   - the capture-phase `contextmenu` listener that suppresses the
 *     native browser menu without breaking OrbitControls' pointer state,
 *   - the palette watcher that flips background + fog when dark mode
 *     toggles (and forwards to a caller-supplied repaint hook).
 *
 * The shell wires reducers and event callbacks via the `configure`
 * callback, then receives back a shallow ref to the graph instance.
 *
 * Per-instance composable. All listeners and disposables are torn down
 * in `onBeforeUnmount`.
 */
import { onBeforeUnmount, onMounted, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import * as THREE from 'three';
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph';
import type { GraphPalette } from '@/composables/useGraphPalette';

export interface ThreeSceneOptions {
  container: Ref<HTMLDivElement | null>;
  palette: Ref<GraphPalette>;
  /** Wire reducers/callbacks on the freshly-created instance. */
  configure: (instance: ForceGraph3DInstance) => void;
  /** Called after bg + fog are repainted on a palette flip. */
  onPaletteChange?: (instance: ForceGraph3DInstance, next: GraphPalette) => void;
  /** Called once the instance and lights are ready and configured. */
  onReady?: () => void;
}

export interface ThreeSceneApi {
  graph: ShallowRef<ForceGraph3DInstance | null>;
}

export function useThreeScene(opts: ThreeSceneOptions): ThreeSceneApi {
  const graph = shallowRef<ForceGraph3DInstance | null>(null);
  let resizeObserver: ResizeObserver | null = null;
  let contextMenuTarget: HTMLElement | null = null;

  const p = (): GraphPalette => opts.palette.value;

  /**
   * Suppress only the browser's native context menu. We deliberately do
   * NOT stop propagation: OrbitControls / DragControls share an internal
   * pointer state map keyed by pointerId, and capture-phase swallowing
   * of pointerdown desynchronises that map (later pointercancel from
   * DragControls dispatches a synthetic dragend that calls
   * `OrbitControls.onPointerUp` on a pointerId that was never tracked
   * → `Cannot read properties of undefined (reading 'x')`). Letting the
   * libraries see every pointer event keeps their state consistent.
   */
  function onContextMenuCapture(event: MouseEvent): void {
    event.preventDefault();
  }

  function syncSize(): void {
    const el = opts.container.value;
    const g = graph.value;
    if (!el || !g) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w > 0 && h > 0) g.width(w).height(h);
  }

  onMounted(() => {
    const el = opts.container.value;
    if (!el) return;

    const instance = new ForceGraph3D(el, { controlType: 'orbit' })
      .backgroundColor(p().bg)
      .showNavInfo(false);

    // Three-light rig tuned for a calm, professional feel:
    //   - low ambient so the spheres don't go flat,
    //   - hemisphere fill that lifts the tops without colour cast,
    //   - one cool key + one warm rim so each sphere reads as a 3D
    //     pebble rather than a sticker on the canvas.
    const scene = instance.scene();
    const bgColor = new THREE.Color(p().bg);
    scene.fog = new THREE.Fog(bgColor, 220, 1100);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const hemi = new THREE.HemisphereLight(0xf6efe1, 0x101010, 0.55);
    hemi.position.set(0, 1, 0);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(120, 180, 220);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xe8dcc8, 0.35);
    rim.position.set(-150, -60, -180);
    scene.add(rim);

    graph.value = instance;
    opts.configure(instance);

    syncSize();
    resizeObserver = new ResizeObserver(syncSize);
    resizeObserver.observe(el);

    contextMenuTarget = el;
    el.addEventListener('contextmenu', onContextMenuCapture);

    opts.onReady?.();
  });

  watch(opts.palette, (next) => {
    const g = graph.value;
    if (!g) return;
    g.backgroundColor(next.bg);
    const scene = g.scene();
    if (scene.fog && 'color' in scene.fog) {
      (scene.fog as THREE.Fog).color = new THREE.Color(next.bg);
    }
    opts.onPaletteChange?.(g, next);
  }, { deep: false });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    contextMenuTarget?.removeEventListener('contextmenu', onContextMenuCapture);
    contextMenuTarget = null;

    const g = graph.value;
    if (g) {
      (g as unknown as { _destructor?: () => void })._destructor?.();
      graph.value = null;
    }
  });

  return { graph };
}
