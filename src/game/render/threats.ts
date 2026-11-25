import type { Vec2 } from '@core/model/types';
import * as THREE from 'three';
import { onOverlay } from './layers';
import { bearingTo } from './lookMath';
import { asOverlay } from './materials';

/** Someone paying attention to you. */
export interface Threat {
  pos: Vec2;
  /** How sure they are, 0 (a glance) to 1 (certain). */
  level: number;
  /** They've raised the alarm (chasing, radioing, snitching). */
  alarmed: boolean;
}

const MAX = 8;
/** Distance in front of the camera, and the ring's radius there. */
const DEPTH = 0.5;
const RADIUS = 0.058;

const NOTICING = new THREE.Color(0xffd54f);
const SURE = new THREE.Color(0xff7043);
const ALARMED = new THREE.Color(0xff3d2e);

/**
 * First person hides what the top-down view shows freely: who is looking at you, and from
 * where. So an arc lights up around the crosshair for everyone who's noticing you, on the side
 * they're on (the bottom of the ring is behind you), growing and reddening as they become sure.
 */
export class ThreatRing {
  readonly group = new THREE.Group();
  private readonly arcs: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];

  constructor() {
    // An arc centred on straight ahead (the top of the ring).
    const geometry = new THREE.RingGeometry(0.86, 1, 14, 1, Math.PI / 2 - 0.34, 0.68);
    for (let i = 0; i < MAX; i++) {
      const arc = new THREE.Mesh(
        geometry,
        asOverlay(
          new THREE.MeshBasicMaterial({
            transparent: true,
            depthTest: false,
            depthWrite: false,
            fog: false,
          }),
        ),
      );
      arc.visible = false;
      arc.renderOrder = 30;
      arc.frustumCulled = false;
      this.arcs.push(arc);
      this.group.add(arc);
    }
    this.group.position.z = -DEPTH;
    onOverlay(this.group);
  }

  /** `eye` and the threats are map positions; `yaw` is the heading you're looking along. */
  update(eye: Vec2, yaw: number, threats: readonly Threat[], time: number) {
    // The most pressing first, in case there are more than there are arcs.
    const shown = [...threats]
      .filter((t) => t.alarmed || t.level > 0.04)
      .sort((a, b) => Number(b.alarmed) - Number(a.alarmed) || b.level - a.level)
      .slice(0, MAX);
    this.arcs.forEach((arc, i) => {
      const threat = shown[i];
      arc.visible = !!threat;
      if (!threat) return;
      const level = threat.alarmed ? 1 : Math.min(1, threat.level);
      // To your right is clockwise round the ring.
      arc.rotation.z = -bearingTo(eye, yaw, threat.pos);
      const pulse = threat.alarmed ? 1 + Math.sin(time * 10) * 0.08 : 1;
      arc.scale.setScalar(RADIUS * (0.85 + level * 0.3) * pulse);
      const material = arc.material;
      if (threat.alarmed) material.color.copy(ALARMED);
      else material.color.copy(NOTICING).lerp(SURE, Math.min(1, level * 1.2));
      material.opacity = threat.alarmed ? 0.95 : 0.35 + level * 0.55;
    });
  }

  dispose() {
    this.arcs[0]?.geometry.dispose();
    for (const arc of this.arcs) arc.material.dispose();
  }
}
