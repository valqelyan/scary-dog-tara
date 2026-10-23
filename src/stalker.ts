import * as THREE from 'three';
import type { Player } from './player';

const SKIN = 0xbdb8aa;
const BODY = 0x050507;
const VOID = 0x000000;

function box(w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({
      color: hex,
      flatShading: true,
      // The pale face glows faintly so it floats out of the dark.
      emissive: hex === SKIN ? new THREE.Color(hex).multiplyScalar(0.3) : new THREE.Color(0x000000),
    }),
  );
  m.position.set(x, y, z);
  return m;
}

const SPAWN_DIST = 24;
const CATCH_DIST = 1.4;
const FIRST_SPAWN = 30;

/**
 * A tall figure that only moves while you are not looking at it.
 * Stare at it too long and it blinks closer; let it reach you and it's over.
 */
export class Stalker {
  readonly group = new THREE.Group();
  active = false;
  /** 0..1, how dangerous it is right now (distance based). */
  threat = 0;
  /** Seconds the player has been watching it. */
  watched = 0;
  onStep?: (dist: number, pan: number) => void;
  /** Fired when it blinks out and comes back closer. */
  onBlink?: () => void;

  private spawnTimer = FIRST_SPAWN;
  private pose = new THREE.Group();
  private arms: THREE.Group[] = [];
  private head = new THREE.Group();
  private poseT = 0;
  private blinkT = 0;
  private stepT = 1;
  private readonly frustum = new THREE.Frustum();
  private readonly projView = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();

  constructor() {
    this.group.add(this.pose);
    const p = this.pose;

    p.add(box(0.11, 1.15, 0.11, BODY, -0.13, 0.575, 0));
    p.add(box(0.11, 1.15, 0.11, BODY, 0.13, 0.575, 0));
    p.add(box(0.42, 0.95, 0.22, BODY, 0, 1.6, 0));

    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.27, 2.02, 0);
      arm.add(box(0.07, 1.45, 0.07, BODY, 0, -0.72, 0));
      this.arms.push(arm);
      p.add(arm);
    }

    p.add(box(0.07, 0.2, 0.07, BODY, 0, 2.18, 0));
    const h = this.head;
    h.position.set(0, 2.33, 0);
    h.add(box(0.2, 0.3, 0.2, SKIN, 0, 0, 0));
    h.add(box(0.045, 0.06, 0.02, VOID, -0.05, 0.05, 0.1));
    h.add(box(0.045, 0.06, 0.02, VOID, 0.05, 0.05, 0.1));
    h.add(box(0.03, 0.12, 0.02, VOID, 0, -0.07, 0.1));
    p.add(h);

    this.group.visible = false;
  }

  reset(): void {
    this.active = false;
    this.group.visible = false;
    this.group.scale.setScalar(1);
    this.blinkT = 0;
    this.threat = 0;
    this.watched = 0;
    this.spawnTimer = FIRST_SPAWN;
  }

  /** Banish it for a while (dawn, or after being stared down). */
  retreat(cooldown: number): void {
    this.blinkT = 0;
    this.active = false;
    this.group.visible = false;
    this.threat = 0;
    this.watched = 0;
    this.spawnTimer = cooldown;
  }

  private spawn(player: Player): void {
    // Somewhere behind or beside you, out of sight.
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = player.yaw + side * (1.8 + Math.random() * 1.2); // ~100°-170° from where you look
    this.group.position.set(
      player.pos.x - Math.sin(a) * SPAWN_DIST,
      0,
      player.pos.z - Math.cos(a) * SPAWN_DIST,
    );
    this.active = true;
    this.group.visible = true;
    this.blinkT = 0;
    this.watched = 0;
    this.stepT = 1;
    this.restPose(0);
  }

  /** Is the figure inside the camera's view right now? */
  private inView(camera: THREE.PerspectiveCamera): boolean {
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.sphere.center.set(this.group.position.x, 1.3, this.group.position.z);
    this.sphere.radius = 1.1;
    return this.frustum.intersectsSphere(this.sphere);
  }

  /** Stop-motion twitch: a new slightly wrong pose every time it moves. */
  private restPose(amount: number): void {
    const r = () => (Math.random() - 0.5) * 2;
    this.pose.rotation.z = r() * 0.07 * amount;
    this.pose.rotation.x = r() * 0.06 * amount;
    this.arms[0].rotation.z = 0.04 + r() * 0.25 * amount;
    this.arms[1].rotation.z = -0.04 + r() * 0.25 * amount;
    this.arms[0].rotation.x = r() * 0.3 * amount;
    this.arms[1].rotation.x = r() * 0.3 * amount;
    this.head.rotation.z = r() * 0.35 * amount;
    this.head.rotation.x = 0.1 + r() * 0.25 * amount;
  }

  /**
   * @param progress 0..1 through the night
   * @param dawning  stop spawning and flee
   * @returns true once it has caught the player
   */
  update(
    dt: number,
    player: Player,
    camera: THREE.PerspectiveCamera,
    progress: number,
    dawning: boolean,
  ): boolean {
    if (dawning) {
      if (this.active) this.retreat(1e9);
      return false;
    }

    if (!this.active) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) this.spawn(player);
      return false;
    }

    const pos = this.group.position;
    let dx = player.pos.x - pos.x;
    let dz = player.pos.z - pos.z;
    let dist = Math.hypot(dx, dz);

    // Outrun it completely and it simply turns up closer, behind you again.
    if (dist > 42) {
      this.spawn(player);
      dx = player.pos.x - pos.x;
      dz = player.pos.z - pos.z;
      dist = Math.hypot(dx, dz);
    }

    const seen = this.inView(camera);
    if (seen) this.watched += dt;
    else this.watched = Math.max(0, this.watched - dt * 0.5);

    // Mid-blink: gone for a moment.
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) this.group.visible = true;
      return false;
    }

    // Staring is not safe. Look too long and the lights stutter; when they return it is much closer.
    if (this.watched > 4 && dist > 7) {
      const to = Math.max(6, dist * 0.6);
      pos.x = player.pos.x - (dx / dist) * to;
      pos.z = player.pos.z - (dz / dist) * to;
      this.group.visible = false;
      this.blinkT = 0.45;
      this.watched = 0;
      this.onBlink?.();
      return false;
    }

    let speed = 0;
    if (!seen) speed = 2.8 + 1.4 * progress;
    else if (dist < 5) speed = 0.7; // even watched, it creeps when it's this close
    if (dist < 7 && !seen) speed *= 1.25;

    if (speed > 0 && dist > 1e-4) {
      pos.x += (dx / dist) * speed * dt;
      pos.z += (dz / dist) * speed * dt;
      this.poseT -= dt;
      if (this.poseT <= 0) {
        this.restPose(1);
        this.poseT = 0.35;
      }
      this.stepT -= dt;
      if (this.stepT <= 0 && dist < 20) {
        const pan = ((-dx * Math.cos(player.yaw) + dz * Math.sin(player.yaw)) / dist) * 0.9;
        this.onStep?.(dist, pan);
        this.stepT = 1.1 + Math.random() * 1.2;
      }
    }

    this.group.rotation.y = Math.atan2(dx, dz);
    dist = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    this.threat = THREE.MathUtils.clamp(1 - (dist - 3) / 21, 0, 1);

    return dist < CATCH_DIST;
  }

  /** Jumpscare framing: right in your face, towering over the camera. */
  placeInFront(player: Player): void {
    const f = 1.0;
    this.group.position.set(player.pos.x - Math.sin(player.yaw) * f, 0, player.pos.z - Math.cos(player.yaw) * f);
    this.group.rotation.y = player.yaw;
    this.restPose(0);
    this.head.rotation.x = 0.35;
    this.group.visible = true;
  }

  shake(amount: number): void {
    this.pose.position.set((Math.random() - 0.5) * amount, 0, (Math.random() - 0.5) * amount);
    this.head.rotation.z = (Math.random() - 0.5) * amount * 6;
  }
}
