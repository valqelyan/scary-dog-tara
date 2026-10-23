import * as THREE from 'three';

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

/** What the dog is doing right now, as far as its body is concerned. The brain fills this in each frame. */
export interface DogPose {
  speed: number;
  /** Frozen and staring at a threat: crouched, ears back, shivering. */
  alert: boolean;
  /** Nose down, sniffing the ground. */
  sniffGround: boolean;
  /** Nose up against a trunk. */
  sniffTree: boolean;
  /** Head right down at water. */
  drink: boolean;
  /** Head up, listening. */
  perk: boolean;
  /** Excited: tail going fast. */
  happy: boolean;
}

const approach = (value: number, target: number, rate: number, dt: number) => value + (target - value) * Math.min(1, dt * rate);

/** The dog's blocky body and how it moves: gait, head, ears, tail. It knows nothing about where to go. */
export class DogModel {
  readonly group = new THREE.Group();
  onStep?: () => void;

  private model = new THREE.Group();
  private body = new THREE.Group();
  private head = new THREE.Group();
  private tail = new THREE.Group();
  private ears: THREE.Mesh[] = [];
  private legs: THREE.Group[] = [];

  private time = 0;
  private phase = 0;
  private lastStepIdx = 0;
  private crouch = 0;
  private earBack = 0;
  private sniffGround = 0;
  private sniffTree = 0;
  private drink = 0;
  private perk = 0;

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
    b.add(box(0.34, 0.34, 0.62, COAT, 0, 0.62, -0.06));
    b.add(box(0.38, 0.42, 0.38, COAT, 0, 0.65, 0.22));
    b.add(box(0.3, 0.1, 0.4, COAT_LIGHT, 0, 0.44, 0.12));
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


  update(dt: number, pose: DogPose): void {
    this.time += dt;
    const t = this.time;
    const speed = pose.speed;

    this.crouch = approach(this.crouch, pose.alert ? 1 : 0, 4, dt);
    this.earBack = approach(this.earBack, pose.alert ? 1 : 0, 6, dt);
    this.sniffGround = approach(this.sniffGround, pose.sniffGround ? 1 : 0, 4, dt);
    this.sniffTree = approach(this.sniffTree, pose.sniffTree ? 1 : 0, 4, dt);
    this.drink = approach(this.drink, pose.drink ? 1 : 0, 3, dt);
    this.perk = approach(this.perk, pose.perk ? 1 : 0, 10, dt);

    this.phase += dt * speed * 5.6;
    const amp = Math.min(1, speed * 0.6) * Math.min(0.85, 0.42 + speed * 0.07);
    const s = Math.sin(this.phase);
    this.legs[0].rotation.x = s * amp;
    this.legs[3].rotation.x = s * amp;
    this.legs[1].rotation.x = -s * amp;
    this.legs[2].rotation.x = -s * amp;

    const stepIdx = Math.floor(this.phase / Math.PI);
    if (stepIdx !== this.lastStepIdx) {
      this.lastStepIdx = stepIdx;
      if (speed > 0.6) this.onStep?.();
    }

    const shiver = pose.alert ? Math.sin(t * 38) * 0.004 : 0;
    this.body.position.y = Math.abs(Math.sin(this.phase)) * 0.025 * amp - this.crouch * 0.07 - this.drink * 0.05 + shiver;
    this.body.rotation.x = this.crouch * 0.1 + this.drink * 0.14;

    this.head.rotation.x =
      this.crouch * 0.3 +
      Math.sin(this.phase * 2) * 0.04 * amp +
      this.sniffGround * (0.65 + Math.sin(t * 9) * 0.06) +
      this.sniffTree * (0.05 + Math.sin(t * 7) * 0.08) +
      this.drink * (0.85 + Math.sin(t * 5.5) * 0.05) -
      this.perk * 0.25;
    this.head.rotation.y = pose.alert ? Math.sin(t * 0.9) * 0.05 : Math.sin(t * 0.6) * 0.18 * (1 - amp) + Math.sin(t * 2.3) * 0.22 * this.sniffTree;

    for (let i = 0; i < this.ears.length; i++) {
      this.ears[i].rotation.x = -0.15 - this.earBack * 0.85;
    }

    this.tail.rotation.x = -0.35 - this.crouch * 0.8;
    this.tail.rotation.y = pose.alert ? 0 : Math.sin(t * (pose.happy ? 7 : 3.2)) * (pose.happy ? 0.45 : 0.3);
  }
}
