import type { Vec2 } from '@core/model/types';
import * as THREE from 'three';
import { headingToRotation, toWorld } from './coords';
import type { CharacterModel } from './models';
import { textSprite } from './markers';

export interface ActorPose {
  pos: Vec2;
  facing: number;
  moving: boolean;
  crouching?: boolean;
  sprinting?: boolean;
}

/** Smoothly animated character: position, turning, walk bob, crouch squash. */
export class ActorView {
  readonly model: CharacterModel;
  private walkPhase = 0;
  private crouch = 0;
  private yaw = 0;
  private initialized = false;

  constructor(model: CharacterModel, scene: THREE.Scene) {
    this.model = model;
    scene.add(model.root);
  }

  get root() {
    return this.model.root;
  }

  sync(pose: ActorPose, dt: number) {
    const { root, body } = this.model;
    root.position.set(toWorld(pose.pos.x), 0, toWorld(pose.pos.y));
    const targetYaw = headingToRotation(pose.facing);
    if (!this.initialized) {
      this.yaw = targetYaw;
      this.initialized = true;
    }
    let d = targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 14);
    root.rotation.y = this.yaw;

    this.crouch += ((pose.crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 12);
    if (pose.moving) this.walkPhase += dt * (pose.sprinting ? 16 : 11);
    const bob = pose.moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    body.position.y = bob * (1 - this.crouch * 0.5);
    body.scale.set(1 + this.crouch * 0.08, 1 - this.crouch * 0.38, 1 + this.crouch * 0.08);
    body.rotation.z = pose.sprinting ? -0.18 : -this.crouch * 0.12;
  }
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
