import * as THREE from 'three';
import type { Player } from './player';
import { box as blockBox } from './gfx';
import { Gaze } from './gaze';

const SKIN = 0xbdb8aa;
const BODY = 0x050507;
const VOID = 0x000000;

const box = (w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0) => blockBox(w, h, d, hex, x, y, z, hex === SKIN ? 0.3 : 0);

const SPAWN_DIST = 24;
const CATCH_DIST = 1.4;
const FIRST_SPAWN = 30;

export class Stalker {
  readonly group = new THREE.Group();
  active = false;
  threat = 0;
  onStep?: (dist: number, pan: number) => void;
  onBlink?: () => void;

  private spawnTimer = FIRST_SPAWN;
  private pose = new THREE.Group();
  private arms: THREE.Group[] = [];
  private head = new THREE.Group();
  private poseT = 0;
  private blinkT = 0;
  private gaze = new Gaze();
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
    this.gaze.reset();
    this.spawnTimer = FIRST_SPAWN;
  }

  retreat(cooldown: number): void {
    this.blinkT = 0;
    this.active = false;
    this.group.visible = false;
    this.threat = 0;
    this.gaze.reset();
    this.spawnTimer = cooldown;
  }

  private spawn(player: Player): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = player.yaw + side * (1.8 + Math.random() * 1.2);
    this.group.position.set(
      player.pos.x - Math.sin(a) * SPAWN_DIST,
      0,
      player.pos.z - Math.cos(a) * SPAWN_DIST,
    );
    this.active = true;
    this.group.visible = true;
    this.blinkT = 0;
    this.gaze.reset();
    this.stepT = 1;
    this.restPose(0);
  }

  private inView(camera: THREE.PerspectiveCamera): boolean {
    camera.updateMatrixWorld();
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.sphere.center.set(this.group.position.x, 1.3, this.group.position.z);
    this.sphere.radius = 1.1;
    return this.frustum.intersectsSphere(this.sphere);
  }

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

    if (dist > 42) {
      this.spawn(player);
      dx = player.pos.x - pos.x;
      dz = player.pos.z - pos.z;
      dist = Math.hypot(dx, dz);
    }

    const seen = this.inView(camera);
    this.gaze.update(dt, seen);

    if (this.blinkT > 0) {
      this.blinkT -= dt;
      if (this.blinkT <= 0) this.group.visible = true;
      return false;
    }

    if (this.gaze.time > 4 && dist > 7) {
      const to = Math.max(6, dist * 0.6);
      pos.x = player.pos.x - (dx / dist) * to;
      pos.z = player.pos.z - (dz / dist) * to;
      this.group.visible = false;
      this.blinkT = 0.45;
      this.gaze.reset();
      this.onBlink?.();
      return false;
    }

    let speed = 0;
    if (!seen) speed = 2.8 + 1.4 * progress;
    else if (dist < 5) speed = 0.7;
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
