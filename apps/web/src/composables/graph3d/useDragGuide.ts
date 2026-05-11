/**
 * Drag-time gizmo: axis-decomposed vector showing where the dragged
 * node is moving relative to its origin, plus a drop indicator onto
 * the reference plane.
 *
 * The guide owns:
 *   - the diagonal "vector" line from origin → current,
 *   - X / Y / Z component segments forming a step-wise route,
 *   - mini X / Y / Z axes anchored at the current point,
 *   - axis-letter sprite labels (X / Y / Z),
 *   - a vertical drop line + ring footprint projecting onto the floor,
 *   - an origin dot.
 *
 * Per-instance composable. Caller drives lifecycle via `show / update /
 * clear`. Buffers and materials are reused across `update()` calls, so
 * there are no per-frame allocations once a session starts.
 */
import * as THREE from 'three';
import type { Ref } from 'vue';
import type { GraphPalette } from '@/composables/useGraphPalette';
import { cssToThreeColor } from '@/components/graph/colorBridge';
import {
  DRAG_GUIDE_ACTIVE_THRESHOLD,
  DRAG_GUIDE_AXIS_LENGTH,
  REFERENCE_PLANE_Y,
  type AxisKey,
} from './types';
import { disposeObject } from './threeUtils';
import type { LabelSpritePainterApi } from './useLabelSpritePainter';

type GuideLine = THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;

interface GuideLineBundle {
  line: GuideLine;
  positions: Float32Array;
}

interface DragGuide extends THREE.Group {
  userData: {
    origin: THREE.Vector3;
    vector: GuideLineBundle;
    xSegment: GuideLineBundle;
    ySegment: GuideLineBundle;
    zSegment: GuideLineBundle;
    dropLine: GuideLineBundle;
    xAxis: GuideLineBundle;
    yAxis: GuideLineBundle;
    zAxis: GuideLineBundle;
    labels: Partial<Record<AxisKey, THREE.Sprite>>;
    footprint: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  };
}

export interface DragGuideApi {
  /** Show a fresh guide rooted at the dragged node's origin. */
  show(scene: THREE.Scene, origin: THREE.Vector3): void;
  /** Reposition all components against the dragged node's current point. */
  update(current: THREE.Vector3): void;
  /** Remove the guide from its scene and dispose all GPU resources. */
  clear(): void;
  /** True if a guide is currently mounted. */
  isActive(): boolean;
}

export interface DragGuideOptions {
  palette: Ref<GraphPalette>;
  /** Live axis-lock from the keyboard composable, or null when free. */
  activeAxisLock: () => AxisKey | null;
  painter: LabelSpritePainterApi;
}

function makeGuideLine(color: THREE.Color, opacity: number): GuideLineBundle {
  const positions = new Float32Array(6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  line.renderOrder = 40;
  return { line, positions };
}

function setGuideLine(bundle: GuideLineBundle, from: THREE.Vector3, to: THREE.Vector3): void {
  bundle.positions[0] = from.x;
  bundle.positions[1] = from.y;
  bundle.positions[2] = from.z;
  bundle.positions[3] = to.x;
  bundle.positions[4] = to.y;
  bundle.positions[5] = to.z;
  const attribute = bundle.line.geometry.getAttribute('position') as THREE.BufferAttribute;
  attribute.needsUpdate = true;
  bundle.line.geometry.computeBoundingSphere();
}

function setGuideOpacity(bundle: GuideLineBundle, opacity: number): void {
  bundle.line.material.opacity = opacity;
  bundle.line.material.needsUpdate = true;
}

function componentOpacity(length: number, active: boolean): number {
  if (length < 1) return 0.08;
  return active ? 0.95 : 0.38 + Math.min(0.28, length / 180);
}

export function useDragGuide(opts: DragGuideOptions): DragGuideApi {
  let scene: THREE.Scene | null = null;
  let guide: DragGuide | null = null;

  // Reusable scratch vectors so update() never allocates per frame.
  const tmpDelta = new THREE.Vector3();
  const tmpXPoint = new THREE.Vector3();
  const tmpXyPoint = new THREE.Vector3();
  const tmpProjected = new THREE.Vector3();
  const tmpEnd = new THREE.Vector3();

  const p = (): GraphPalette => opts.palette.value;
  const highlightColor = (): THREE.Color => cssToThreeColor(p().accent || '#e8dcc8');
  const axisColors = (): Record<AxisKey, THREE.Color> => ({
    x: cssToThreeColor(p().accent),
    y: cssToThreeColor(p().labelFg),
    z: cssToThreeColor(p().edgeFocus),
  });

  function activeAxisFor(delta: THREE.Vector3): AxisKey | null {
    const lock = opts.activeAxisLock();
    if (lock) return lock;
    const values: Record<AxisKey, number> = {
      x: Math.abs(delta.x),
      y: Math.abs(delta.y),
      z: Math.abs(delta.z),
    };
    const axis = (Object.keys(values) as AxisKey[]).reduce((best, key) => (
      values[key] > values[best] ? key : best
    ), 'x');
    return values[axis] >= DRAG_GUIDE_ACTIVE_THRESHOLD ? axis : null;
  }

  function buildGuide(origin: THREE.Vector3): DragGuide {
    const colors = axisColors();
    const group = new THREE.Group() as DragGuide;
    group.renderOrder = 40;

    const vector = makeGuideLine(highlightColor(), 0.9);
    const xSegment = makeGuideLine(colors.x, 0.35);
    const ySegment = makeGuideLine(colors.y, 0.35);
    const zSegment = makeGuideLine(colors.z, 0.35);
    const dropLine = makeGuideLine(colors.y, 0);
    const xAxis = makeGuideLine(colors.x, 0.28);
    const yAxis = makeGuideLine(colors.y, 0.28);
    const zAxis = makeGuideLine(colors.z, 0.28);

    group.add(
      dropLine.line,
      vector.line,
      xSegment.line,
      ySegment.line,
      zSegment.line,
      xAxis.line,
      yAxis.line,
      zAxis.line,
    );

    const originDot = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 18, 12),
      new THREE.MeshBasicMaterial({
        color: highlightColor(),
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    );
    originDot.position.copy(origin);
    originDot.renderOrder = 42;
    group.add(originDot);

    const footprint = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 6.8, 36),
      new THREE.MeshBasicMaterial({
        color: highlightColor(),
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    footprint.rotation.x = Math.PI / 2;
    footprint.renderOrder = 39;
    group.add(footprint);

    const labels: Partial<Record<AxisKey, THREE.Sprite>> = {};
    for (const axis of Object.keys(colors) as AxisKey[]) {
      const label = opts.painter.paintAxisGlyph(axis.toUpperCase(), colors[axis]);
      if (!label) continue;
      label.renderOrder = 43;
      const material = label.material as THREE.SpriteMaterial;
      material.depthTest = false;
      material.depthWrite = false;
      material.transparent = true;
      material.opacity = 0.68;
      labels[axis] = label;
      group.add(label);
    }

    group.userData = {
      origin: origin.clone(),
      vector,
      xSegment,
      ySegment,
      zSegment,
      dropLine,
      xAxis,
      yAxis,
      zAxis,
      labels,
      footprint,
    };
    return group;
  }

  function applyUpdate(g: DragGuide, current: THREE.Vector3): void {
    const ud = g.userData;
    const colors = axisColors();
    tmpDelta.subVectors(current, ud.origin);
    const active = activeAxisFor(tmpDelta);
    tmpXPoint.set(current.x, ud.origin.y, ud.origin.z);
    tmpXyPoint.set(current.x, current.y, ud.origin.z);
    tmpProjected.set(current.x, REFERENCE_PLANE_Y, current.z);

    setGuideLine(ud.vector, ud.origin, current);
    setGuideLine(ud.xSegment, ud.origin, tmpXPoint);
    setGuideLine(ud.ySegment, tmpXPoint, tmpXyPoint);
    setGuideLine(ud.zSegment, tmpXyPoint, current);
    setGuideLine(ud.dropLine, current, tmpProjected);

    tmpEnd.set(current.x + DRAG_GUIDE_AXIS_LENGTH, current.y, current.z);
    setGuideLine(ud.xAxis, current, tmpEnd);
    tmpEnd.set(current.x, current.y + DRAG_GUIDE_AXIS_LENGTH, current.z);
    setGuideLine(ud.yAxis, current, tmpEnd);
    tmpEnd.set(current.x, current.y, current.z + DRAG_GUIDE_AXIS_LENGTH);
    setGuideLine(ud.zAxis, current, tmpEnd);

    setGuideOpacity(ud.vector, tmpDelta.length() > 1 ? 0.86 : 0.14);
    setGuideOpacity(ud.xSegment, componentOpacity(Math.abs(tmpDelta.x), active === 'x'));
    setGuideOpacity(ud.ySegment, componentOpacity(Math.abs(tmpDelta.y), active === 'y'));
    setGuideOpacity(ud.zSegment, componentOpacity(Math.abs(tmpDelta.z), active === 'z'));
    setGuideOpacity(ud.xAxis, active === 'x' ? 0.9 : 0.28);
    setGuideOpacity(ud.yAxis, active === 'y' ? 0.9 : 0.28);
    setGuideOpacity(ud.zAxis, active === 'z' ? 0.9 : 0.28);

    const dropDistance = Math.abs(current.y - REFERENCE_PLANE_Y);
    const dropAbove = current.y >= REFERENCE_PLANE_Y;
    const dropColor = dropAbove ? colors.z : colors.x;
    ud.dropLine.line.material.color.copy(dropColor);
    setGuideOpacity(
      ud.dropLine,
      dropDistance > 2 ? Math.min(0.72, 0.24 + dropDistance / 120) : 0,
    );
    ud.footprint.position.copy(tmpProjected);
    ud.footprint.material.color.copy(dropColor);
    ud.footprint.material.opacity = dropDistance > 2
      ? Math.min(0.42, 0.16 + dropDistance / 180)
      : 0;
    ud.footprint.visible = dropDistance > 2;

    ud.labels.x?.position.set(
      current.x + DRAG_GUIDE_AXIS_LENGTH + 7,
      current.y,
      current.z,
    );
    ud.labels.y?.position.set(
      current.x,
      current.y + DRAG_GUIDE_AXIS_LENGTH + 7,
      current.z,
    );
    ud.labels.z?.position.set(
      current.x,
      current.y,
      current.z + DRAG_GUIDE_AXIS_LENGTH + 7,
    );
    for (const axis of Object.keys(ud.labels) as AxisKey[]) {
      const material = ud.labels[axis]?.material as THREE.SpriteMaterial | undefined;
      if (material) material.opacity = active === axis ? 1 : 0.58;
    }
  }

  function show(nextScene: THREE.Scene, origin: THREE.Vector3): void {
    clear();
    scene = nextScene;
    guide = buildGuide(origin);
    scene.add(guide);
    applyUpdate(guide, origin);
  }

  function update(current: THREE.Vector3): void {
    if (!guide) return;
    applyUpdate(guide, current);
  }

  function clear(): void {
    if (!guide) return;
    if (scene) scene.remove(guide);
    disposeObject(guide);
    guide = null;
    scene = null;
  }

  function isActive(): boolean {
    return guide !== null;
  }

  return { show, update, clear, isActive };
}
