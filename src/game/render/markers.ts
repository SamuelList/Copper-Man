import * as THREE from 'three';
import { PALETTE } from './palette';

/** Billboarded text glyph ("!", "?", "z Z z") drawn once into a canvas texture. */
export function textSprite(
  text: string,
  color: string,
  size = 0.55,
  stroke = '#000',
): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 96px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, 128, 68);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 68);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }),
  );
  sprite.scale.set(size * 2, size, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/**
 * Flat ring on the floor (focus highlight, footstep "heard" pulses). `throughWalls` draws it on
 * top of everything, for things you sense rather than see.
 */
export function floorRing(
  inner: number,
  outer: number,
  color: number,
  throughWalls = false,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      depthWrite: false,
      depthTest: !throughWalls,
      side: THREE.DoubleSide,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.04;
  mesh.renderOrder = throughWalls ? 19 : 5;
  return mesh;
}

/** Radial progress dial (hold-to-interact, fixture recharge), redrawn only when it changes. */
export class Dial {
  readonly sprite: THREE.Sprite;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private last = -1;

  constructor(
    private readonly color: string,
    size = 0.42,
    private readonly mode: 'ring' | 'pie' = 'ring',
  ) {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    this.ctx = c.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }),
    );
    this.sprite.scale.set(size, size, 1);
    this.sprite.renderOrder = 21;
  }

  set(fraction: number) {
    const f = Math.round(Math.max(0, Math.min(1, fraction)) * 48) / 48;
    if (f === this.last) return;
    this.last = f;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 96, 96);
    const start = -Math.PI / 2;
    if (this.mode === 'ring') {
      ctx.lineWidth = 14;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(48, 48, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = this.color;
      ctx.beginPath();
      ctx.arc(48, 48, 34, start, start + Math.PI * 2 * f);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(48, 48, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(48, 48);
      ctx.arc(48, 48, 34, start, start + Math.PI * 2 * f);
      ctx.closePath();
      ctx.fill();
    }
    this.texture.needsUpdate = true;
  }
}

/** Little burst of copper sparks while scrapping. */
export class Sparks {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private next = 0;

  constructor(private readonly count = 80) {
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: PALETTE.spark,
        size: 4,
        sizeAttenuation: false,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.pos.fill(-999);
  }

  emit(x: number, y: number, z: number, n: number) {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.count;
      this.pos.set([x, y, z], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.2;
      this.vel.set([Math.cos(a) * s, 1.5 + Math.random() * 1.5, Math.sin(a) * s], i * 3);
      this.life[i] = 0.35 + Math.random() * 0.3;
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.count; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      if (this.life[i]! <= 0) {
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i * 3 + 1]! -= 9 * dt;
      this.pos[i * 3]! += this.vel[i * 3]! * dt;
      this.pos[i * 3 + 1]! += this.vel[i * 3 + 1]! * dt;
      this.pos[i * 3 + 2]! += this.vel[i * 3 + 2]! * dt;
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
  }
}

/** Soft round sprite texture shared by dust puffs. */
let puffTexture: THREE.CanvasTexture | null = null;
function puff() {
  if (puffTexture) return puffTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(c);
  return puffTexture;
}

/** Little dust clouds kicked up by running feet. */
export class DustPuffs {
  readonly group = new THREE.Group();
  private readonly sprites: THREE.Sprite[] = [];
  private readonly life: number[] = [];
  private readonly vel: THREE.Vector3[] = [];
  private next = 0;

  constructor(count = 36) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: puff(),
          color: 0xd8cfc0,
          transparent: true,
          depthWrite: false,
          opacity: 0,
        }),
      );
      s.visible = false;
      s.renderOrder = 4;
      this.sprites.push(s);
      this.life.push(0);
      this.vel.push(new THREE.Vector3());
      this.group.add(s);
    }
  }

  emit(x: number, z: number, strength: number, color = 0xd8cfc0) {
    const n = 2 + Math.round(strength * 2);
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.sprites.length;
      const s = this.sprites[i]!;
      (s.material as THREE.SpriteMaterial).color.setHex(color);
      s.position.set(x + (Math.random() - 0.5) * 0.12, 0.05, z + (Math.random() - 0.5) * 0.12);
      s.scale.setScalar(0.12);
      s.visible = true;
      this.life[i] = 0.55;
      const a = Math.random() * Math.PI * 2;
      this.vel[i]!.set(Math.cos(a) * 0.35, 0.25 + Math.random() * 0.2, Math.sin(a) * 0.35);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.sprites.length; i++) {
      if (this.life[i]! <= 0) continue;
      const s = this.sprites[i]!;
      this.life[i]! -= dt;
      const t = Math.max(0, this.life[i]! / 0.55);
      s.position.addScaledVector(this.vel[i]!, dt);
      s.scale.setScalar(0.12 + (1 - t) * 0.32);
      (s.material as THREE.SpriteMaterial).opacity = t * 0.45;
      s.visible = t > 0;
    }
  }
}

/** Comic pop-ups for gadgets: a word that bounces up and fades over an expanding floor ring. */
export class PopFx {
  readonly group = new THREE.Group();
  private readonly active: { sprite: THREE.Sprite; ring: THREE.Mesh; age: number }[] = [];

  pop(word: string, color: string, ringColor: number, x: number, z: number) {
    const sprite = textSprite(word, color, 0.5, '#1b1b1b');
    sprite.position.set(x, 0.9, z);
    const ring = floorRing(0.2, 0.3, ringColor, true);
    ring.position.set(x, 0.05, z);
    this.group.add(sprite, ring);
    this.active.push({ sprite, ring, age: 0 });
  }

  update(dt: number) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fx = this.active[i]!;
      fx.age += dt;
      const t = fx.age / 1.3;
      if (t >= 1) {
        this.group.remove(fx.sprite, fx.ring);
        fx.sprite.material.map?.dispose();
        fx.sprite.material.dispose();
        fx.ring.geometry.dispose();
        (fx.ring.material as THREE.Material).dispose();
        this.active.splice(i, 1);
        continue;
      }
      // Overshoot pop, then drift up and fade.
      const pop =
        t < 0.15 ? t / 0.15 : 1 + Math.sin(Math.min(1, (t - 0.15) / 0.2) * Math.PI) * 0.15;
      fx.sprite.scale.set(pop, pop * 0.5, 1);
      fx.sprite.position.y = 0.9 + t * 0.5;
      fx.sprite.material.opacity = 1 - Math.max(0, (t - 0.6) / 0.4);
      fx.ring.scale.setScalar(1 + t * 5);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.7;
    }
  }
}
