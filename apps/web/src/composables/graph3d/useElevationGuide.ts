/**
 * Vertical elevation guide attached to interactive nodes (hover /
 * selection / drag).
 *
 * Each guide is a self-updating THREE.Group rendered as a child of the
 * node it belongs to. It contains:
 *   - a thin vertical line dropping the node onto the reference plane
 *     at Y = `REFERENCE_PLANE_Y`,
 *   - a flat ring "footprint" sitting at that drop point.
 *
 * Both repaint themselves every frame via `onBeforeRender` so the guide
 * stays in sync with the parent's world Y as the simulation tick or a
 * cascade drag moves the node up and down.
 *
 * Per-instance composable: returns a factory bound to the live palette.
 */
import * as THREE from 'three';
import type { Ref } from 'vue';
import type { GraphPalette } from '@/composables/useGraphPalette';
import { cssToThreeColor } from '@/components/graph/colorBridge';
import { REFERENCE_PLANE_Y } from './types';

export interface ElevationGuide extends THREE.Group {
  userData: {
    line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    footprint: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    linePositions: Float32Array;
    aboveColor: THREE.Color;
    belowColor: THREE.Color;
    primary: boolean;
  };
}

export interface ElevationGuideApi {
  /** Build a guide attached to a node of the given visual radius. */
  create(radius: number, primary: boolean): ElevationGuide;
}

function updateElevationGuide(guide: ElevationGuide, nodeWorldY: number): void {
  const delta = REFERENCE_PLANE_Y - nodeWorldY;
  const distance = Math.abs(delta);
  const visible = distance > 3;
  const above = nodeWorldY >= REFERENCE_PLANE_Y;
  const color = above ? guide.userData.aboveColor : guide.userData.belowColor;
  const strength = Math.min(1, distance / 120);

  const lineMaterial = guide.userData.line.material;
  lineMaterial.color.copy(color);
  lineMaterial.opacity = visible
    ? (guide.userData.primary ? 0.22 + strength * 0.26 : 0.08 + strength * 0.16)
    : 0;
  lineMaterial.needsUpdate = true;

  const positions = guide.userData.linePositions;
  positions[3] = 0;
  positions[4] = delta;
  positions[5] = 0;
  guide.userData.line.geometry.attributes.position.needsUpdate = true;
  guide.userData.line.geometry.computeBoundingSphere();

  const footprintMaterial = guide.userData.footprint.material;
  footprintMaterial.color.copy(color);
  footprintMaterial.opacity = visible
    ? (guide.userData.primary ? 0.3 + strength * 0.18 : 0.1 + strength * 0.1)
    : 0;
  footprintMaterial.needsUpdate = true;

  guide.userData.footprint.position.set(0, delta, 0);
  guide.userData.footprint.visible = visible;
  guide.userData.line.visible = visible;
}

export function useElevationGuide(palette: Ref<GraphPalette>): ElevationGuideApi {
  const p = (): GraphPalette => palette.value;

  function create(radius: number, primary: boolean): ElevationGuide {
    const group = new THREE.Group() as ElevationGuide;
    const positions = new Float32Array([0, 0, 0, 0, 0, 0]);
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const accent = cssToThreeColor(p().accent || '#e8dcc8');
    const lineMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: primary ? 0.34 : 0.14,
      depthWrite: false,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    line.renderOrder = -2;
    group.add(line);

    const footprint = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(2.8, radius * 0.5), Math.max(3.8, radius * 0.74), 32),
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: primary ? 0.38 : 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    footprint.rotation.x = Math.PI / 2;
    footprint.renderOrder = -1;
    group.add(footprint);

    group.userData = {
      line,
      footprint,
      linePositions: positions,
      aboveColor: cssToThreeColor(p().edgeFocus),
      belowColor: cssToThreeColor(p().accent),
      primary,
    };
    const sync = (): void => {
      const parent = group.parent;
      if (!parent) return;
      updateElevationGuide(group, parent.position.y);
    };
    line.onBeforeRender = sync;
    footprint.onBeforeRender = sync;
    return group;
  }

  return { create };
}
