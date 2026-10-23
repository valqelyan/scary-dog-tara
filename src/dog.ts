import * as THREE from 'three';
import type { Forest } from './forest';
import type { Player } from './player';

const COAT = 0x0e0a07;
const COAT_LIGHT = 0x1a130d;
const DARK = 0x0c0a09;

const matCache = new Map<number, THREE.MeshLambertMaterial>();
function mat(hex: number): THREE.MeshLambertMaterial {
  let m = matCache.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color: hex,
      flatShading: true,
      emissive: new THREE.Color(hex).multiplyScalar(0.12),
    });
    matCache.set(hex, m);
  }
  return m;
}

function box(w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(hex));
  m.position.set(x, y, z);
  return m;
}

function angleDiff(target: number, current: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

type State = 'follow' | 'alert';

export class Dog {
  readonly group = new THREE.Group();
  readonly pos = this.group.position;

  /** Fired when the dog freezes and stares into the trees. `heading` is a world yaw (sin,cos) direction. */
  onAlertStart?: (heading: number) => void;
  onAlertEnd?: () => void;
  onStep?: () => void;

  /** Where the dog walks, as an angle to the right of the player's view direction. */
  followAngle = 0.5;
  followDist = 2.0;

  private model = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private ears: THREE.Mesh[] = [];
  /** Front-left, front-right, back-left, back-right. */
  private legs: THREE.Group[] = [];

  private heading = 0;
  private speed = 0;
  private phase = 0;
  private lastStepIdx = 0;
  private time = 0;
  private state: State = 'follow';
  private stateT = 0;
  private nextAlert = 20 + Math.random() * 10;
  private lookHeading = 0;
  private crouch = 0;
  private earBack = 0;
  private fromThreat = false;

  /** World yaw toward a real threat. While set, the dog stares that way and stops random false alarms. */
  threatHeading: number | null = null;

  constructor() {
    this.group.add(this.model);
    this.model.scale.setScalar(0.92);
    this.model.add(this.body);
    this.buildBody();
    this.buildHead();
    this.buildTail();
    this.buildLegs();
  }

  private buildBody(): void {
    const b = this.body;
    b.add(box(0.34, 0.34, 0.62, COAT, 0, 0.62, -0.06)); // hindquarters / torso
    b.add(box(0.38, 0.42, 0.38, COAT, 0, 0.65, 0.22)); // chest
    b.add(box(0.3, 0.1, 0.4, COAT_LIGHT, 0, 0.44, 0.12)); // lighter belly
    const neck = box(0.2, 0.34, 0.2, COAT, 0, 0.86, 0.42);
    neck.rotation.x = 0.6;
    b.add(neck);
  }

  private buildHead(): void {
    const h = this.head;
    h.position.set(0, 0.97, 0.58);
    h.add(box(0.24, 0.22, 0.26, COAT, 0, 0, 0.08));
    h.add(box(0.13, 0.11, 0.2, COAT_LIGHT, 0, -0.04, 0.28));
    h.add(box(0.06, 0.05, 0.04, DARK, 0, -0.01, 0.39));

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe3a53a });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.02), eyeMat);
      eye.position.set(sx * 0.07, 0.04, 0.215);
      h.add(eye);

      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.19, 3), mat(COAT));
      ear.position.set(sx * 0.085, 0.17, 0.0);
      ear.rotation.z = -sx * 0.25;
      this.ears.push(ear);
      h.add(ear);
    }
    this.body.add(h);
  }

  private buildTail(): void {
    this.tail.position.set(0, 0.74, -0.36);
    this.tail.add(box(0.06, 0.06, 0.4, COAT, 0, 0, -0.2));
    this.body.add(this.tail);
  }

  private buildLegs(): void {
    const spots: [number, number][] = [
      [-0.12, 0.25],
      [0.12, 0.25],
      [-0.12, -0.28],
      [0.12, -0.28],
    ];
    for (const [x, z] of spots) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.5, z);
      leg.add(box(0.1, 0.5, 0.1, COAT, 0, -0.25, 0));
      leg.add(box(0.11, 0.05, 0.16, COAT_LIGHT, 0, -0.475, 0.03));
      this.legs.push(leg);
      this.model.add(leg);
    }
  }

  reset(player: Player): void {
    this.computeTarget(player, tmpTarget);
    this.pos.copy(tmpTarget);
    this.heading = player.yaw + Math.PI;
    this.group.rotation.y = this.heading;
  }

  private computeTarget(player: Player, out: THREE.Vector3): void {
    const a = player.yaw - this.followAngle;
    out.set(
      player.pos.x - Math.sin(a) * this.followDist,
      0,
      player.pos.z - Math.cos(a) * this.followDist,
    );
  }

  update(dt: number, player: Player, forest: Forest): void {
    this.time += dt;
    this.stateT += dt;

    // Occasionally the dog stops dead and stares at something out in the trees.
    if (this.threatHeading !== null) {
      if (this.state !== 'alert') {
        this.state = 'alert';
        this.stateT = 0;
      }
      this.fromThreat = true;
      this.lookHeading = this.threatHeading;
    } else if (this.fromThreat) {
      this.fromThreat = false;
      this.state = 'follow';
      this.nextAlert = 20 + Math.random() * 20;
    } else if (this.state === 'follow') {
      this.nextAlert -= dt;
      if (this.nextAlert <= 0) {
        this.state = 'alert';
        this.stateT = 0;
        const side = Math.random() < 0.5 ? -1 : 1;
        // Looking to the dog's own side of the player reads best on screen.
        const away = side * (0.9 + Math.random() * 0.9);
        this.lookHeading = player.yaw + Math.PI + away;
        this.onAlertStart?.(this.lookHeading);
      }
    } else if (this.stateT > 6) {
      this.state = 'follow';
      this.nextAlert = 28 + Math.random() * 30;
      this.onAlertEnd?.();
    }

    // --- movement ---
    this.computeTarget(player, tmpTarget);
    const dx = tmpTarget.x - this.pos.x;
    const dz = tmpTarget.z - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // A threatened dog holds its ground, but never lets the player get far away.
    const stay = this.state === 'alert' && !(this.fromThreat && dist > 5);
    let desired = 0;
    if (!stay && dist > 0.2) desired = Math.min(dist * 2.4, 6.5);
    this.speed += (desired - this.speed) * Math.min(1, dt * 5);

    if (this.speed > 0.01 && dist > 1e-4) {
      this.pos.x += (dx / dist) * this.speed * dt;
      this.pos.z += (dz / dist) * this.speed * dt;
    }
    if (dist > 30) this.pos.copy(tmpTarget); // fell hopelessly behind

    forest.collide(this.pos, 0.35);
    // Keep out of the camera.
    const px = this.pos.x - player.pos.x;
    const pz = this.pos.z - player.pos.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.9 && pd > 1e-4) {
      this.pos.x = player.pos.x + (px / pd) * 0.9;
      this.pos.z = player.pos.z + (pz / pd) * 0.9;
    }

    // --- heading ---
    let targetHeading: number;
    let turnRate: number;
    if (stay) {
      targetHeading = this.lookHeading;
      turnRate = 4;
    } else if (this.speed > 0.4) {
      targetHeading = Math.atan2(dx, dz);
      turnRate = 7;
    } else {
      targetHeading = player.yaw + Math.PI;
      turnRate = 2;
    }
    this.heading += angleDiff(targetHeading, this.heading) * Math.min(1, dt * turnRate);
    this.group.rotation.y = this.heading;

    this.animate(dt);
  }

  private animate(dt: number): void {
    const t = this.time;
    const alert = this.state === 'alert';

    this.crouch += ((alert ? 1 : 0) - this.crouch) * Math.min(1, dt * 4);
    this.earBack += ((alert ? 1 : 0) - this.earBack) * Math.min(1, dt * 6);

    // Gait: diagonal pairs swing together.
    this.phase += dt * this.speed * 5.6;
    const amp = Math.min(1, this.speed * 0.6) * Math.min(0.85, 0.42 + this.speed * 0.07);
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * amp;
    this.legs[3].rotation.x = s * amp;
    this.legs[1].rotation.x = -s * amp;
    this.legs[2].rotation.x = -s * amp;

    const stepIdx = Math.floor(this.phase / Math.PI);
    if (stepIdx !== this.lastStepIdx) {
      this.lastStepIdx = stepIdx;
      if (this.speed > 0.6) this.onStep?.();
    }

    // Body bob, crouch, and a subtle shiver while alert.
    const shiver = alert ? Math.sin(t * 38) * 0.004 : 0;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.025 * amp - this.crouch * 0.07 + shiver;
    this.body.rotation.x = this.crouch * 0.1;

    // Head: lowered and fixed while alert, loosely wandering otherwise.
    this.head.rotation.x = this.crouch * 0.3 + Math.sin(this.phase * 2) * 0.04 * amp;
    this.head.rotation.y = alert ? Math.sin(t * 0.9) * 0.05 : Math.sin(t * 0.6) * 0.18 * (1 - amp);

    // Pin the ears back when something is wrong.
    for (let i = 0; i < this.ears.length; i++) {
      this.ears[i].rotation.x = -0.15 - this.earBack * 0.85;
    }

    // Tail wags when relaxed, hangs low when alert.
    this.tail.rotation.x = -0.35 - this.crouch * 0.8;
    this.tail.rotation.y = alert ? 0 : Math.sin(t * 3.2) * 0.3;
  }
}

const tmpTarget = new THREE.Vector3();
