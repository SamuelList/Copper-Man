import type { Vec2 } from '@core/model/types';
import * as THREE from 'three';
import { headingToRotation, toWorld } from './coords';
import { Gait } from './gait';
import type { CharacterModel } from './models';
import { textSprite } from './markers';

export interface ActorPose {
  pos: Vec2;
  facing: number;
  running?: boolean;
  crouching?: boolean;
  working?: boolean;
}

/** World-space point where a foot just landed. */
export interface Footfall {
  x: number;
  z: number;
  run: number;
}

/** Ignore position jumps bigger than this (teleports) when measuring speed. */
const TELEPORT_TILES = 1.5;

/**
 * Animated character: follows the simulation position, turns smoothly, and drives the rig
 * with the procedural gait (walk/run blend, crouch, work, leaning into turns).
 */
export class ActorView {
  readonly model: CharacterModel;
  private readonly gait = new Gait();
  private yaw = 0;
  private speed = 0;
  private last: { x: number; z: number } | null = null;

  constructor(model: CharacterModel, scene: THREE.Scene) {
    this.model = model;
    scene.add(model.root);
  }

  get root() {
    return this.model.root;
  }

  /** Update from the simulation; returns any footfalls this frame (for dust puffs). */
  sync(pose: ActorPose, dt: number): Footfall[] {
    const { root, rig, thigh, shin, scale } = this.model;
    const x = toWorld(pose.pos.x);
    const z = toWorld(pose.pos.y);
    root.position.set(x, 0, z);

    // Measure real ground speed (tiles/s) so the legs match what the body actually does.
    if (this.last && dt > 0) {
      const moved = Math.hypot(x - this.last.x, z - this.last.z);
      const instant = moved > TELEPORT_TILES ? 0 : moved / dt;
      this.speed += (instant - this.speed) * (1 - Math.exp(-dt * 14));
    }
    this.last = { x, z };

    const targetYaw = headingToRotation(pose.facing);
    if (!this.initialized) {
      this.yaw = targetYaw;
      this.initialized = true;
    }
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = d * Math.min(1, dt * 14);
    this.yaw += turn;
    root.rotation.y = this.yaw;

    const {
      pose: p,
      strikes,
      run,
    } = this.gait.update({
      speed: this.speed,
      running: !!pose.running,
      crouching: !!pose.crouching,
      working: !!pose.working,
      turnRate: dt > 0 ? turn / dt : 0,
      dt,
    });

    rig.pelvis.position.y = (thigh + shin) * p.pelvis;
    rig.pelvis.rotation.x = p.roll;
    rig.torso.rotation.z = -p.lean;
    rig.torso.rotation.y = p.twist;
    rig.torso.scale.y = 1 + p.breathe;
    rig.head.rotation.z = p.head;
    rig.hipL.rotation.z = p.hipL;
    rig.hipR.rotation.z = p.hipR;
    rig.kneeL.rotation.z = p.kneeL;
    rig.kneeR.rotation.z = p.kneeR;
    rig.shoulderL.rotation.z = p.shoulderL;
    rig.shoulderR.rotation.z = p.shoulderR;
    rig.elbowL.rotation.z = p.elbowL;
    rig.elbowR.rotation.z = p.elbowR;
    // Arms hang slightly out from the body.
    rig.shoulderL.rotation.x = 0.08;
    rig.shoulderR.rotation.x = -0.08;

    const footfalls: Footfall[] = [];
    if (strikes.length) {
      const c = Math.cos(this.yaw);
      const sn = Math.sin(this.yaw);
      for (const foot of strikes) {
        // Local foot position (forward, side) rotated into the world.
        const fx = 0.18 * scale;
        const fz = (foot === 0 ? -0.085 : 0.085) * scale;
        footfalls.push({ x: x + fx * c + fz * sn, z: z - fx * sn + fz * c, run });
      }
    }
    return footfalls;
  }

  private initialized = false;
}

/** "!" / "?" above an NPC's head. */
export class StatusIcon {
  private readonly alert = textSprite('!', '#ff5252');
  private readonly curious = textSprite('?', '#ffeb3b');
  readonly group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.group.add(this.alert, this.curious);
    scene.add(this.group);
  }

  sync(pos: Vec2, icon: '' | '!' | '?', height: number, time: number, visible: boolean) {
    this.alert.visible = visible && icon === '!';
    this.curious.visible = visible && icon === '?';
    this.group.position.set(toWorld(pos.x), height + Math.sin(time * 6) * 0.05, toWorld(pos.y));
  }
}

/**
 * Where an NPC was last seen. Fades out over a few seconds once they leave your sight, so the
 * fog of war hides them without leaving you clueless.
 */
export class LastSeenGhost {
  readonly mesh: THREE.Mesh;
  private age = Infinity;

  constructor(scene: THREE.Scene, color: number, height: number) {
    this.mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.2, height - 0.4, 3, 10),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: false,
      }),
    );
    this.mesh.position.y = height / 2;
    this.mesh.visible = false;
    this.mesh.renderOrder = 18;
    scene.add(this.mesh);
  }

  /** Call every frame with the NPC's current visibility. */
  sync(pos: Vec2, visible: boolean, dt: number) {
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    if (visible) {
      this.age = 0;
      this.mesh.position.x = toWorld(pos.x);
      this.mesh.position.z = toWorld(pos.y);
      this.mesh.visible = false;
      return;
    }
    this.age += dt;
    const fade = 1 - this.age / 3.5;
    this.mesh.visible = fade > 0;
    mat.opacity = Math.max(0, fade) * 0.35;
  }
}
