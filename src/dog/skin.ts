import * as THREE from 'three';
import { approach } from '../util';
import type { DogBody } from './body';
import { applyCoat } from './coat';
import { Gait, type LegSpec } from './gait';
import { eyeShine, type DogPose } from './model';

/** How long the dog is from nose to tail tip, in metres. */
const LENGTH = 1.65;

// Bone names in the Quaternius dog: hips, chest, head, and the four bones of the tail.
const HIPS = 'Bone';
const CHEST = 'Bone002';
const HEAD = 'Bone003';
const TAIL = ['Bone004', 'Bone005', 'Bone006', 'Bone007'];
// Each leg: the top of the leg, its middle joint, the foot, and the toe tip.
const LEG_BONES = [
  ['Bone017', 'Bone018', 'Bone019', 'Bone019_end', 'front'],
  ['Bone014', 'Bone015', 'Bone016', 'Bone016_end', 'front'],
  ['Bone008', 'Bone009', 'Bone010', 'Bone010_end', 'hind'],
  ['Bone011', 'Bone012', 'Bone013', 'Bone013_end', 'hind'],
] as const;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

interface Leg extends LegSpec {
  top: THREE.Bone;
  mid: THREE.Bone;
  foot: THREE.Bone;
  toe: THREE.Object3D;
  /** Where the foot stands when the leg is at the middle of its stride: straight under the hip, on the ground (dog space: x to her left, y up, z forward). */
  stand: THREE.Vector3;
  upper: number;
  lower: number;
  toeLength: number;
  /** How far the top of the leg is above the standing foot. */
  height: number;
  planted: boolean;
}

/** A smooth, never-repeating wobble from a few sines at unrelated speeds. Roughly -1 to 1. */
const drift = (t: number, a: number, b: number, c: number) => (Math.sin(t * a) * Math.sin(t * b + 1.3) + Math.sin(t * c + 0.4)) * 0.5;

/**
 * A rigged, 600-triangle dog with a procedural gait. Her feet are put on the ground where the stride says they should
 * be and a two-bone IK bends her legs to reach them, so they never skate. The rest of her moves on top of that: the
 * body bobs and flexes with each stride, leans into turns, the head leads, and she breathes and fidgets when still.
 */
export class DogSkin implements DogBody {
  readonly group = new THREE.Group();
  onStep?: () => void;

  private readonly holder = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly hips: THREE.Bone;
  private readonly chest: THREE.Bone;
  private readonly head: THREE.Bone;
  private readonly tail: THREE.Bone[];
  private readonly legs: Leg[] = [];
  private readonly eyes: THREE.Sprite[] = [];
  private readonly scale: number;
  private readonly gait = new Gait();

  /**
   * For each bone we move: its rotation as the animation left it (`clean`), and as we left it (`bent`). The mixer only
   * writes a bone when its animated value changes, so on a held pose it would leave our changes in place and we would
   * add to them every frame. Comparing the two tells us whether the mixer rewrote it.
   */
  private readonly bones = new Map<THREE.Bone, { clean: THREE.Quaternion; bent: THREE.Quaternion }>();

  private time = 0;
  private moving = 0;
  private crouch = 0;
  private sniffGround = 0;
  private sniffTree = 0;
  private drink = 0;
  private perk = 0;
  private bow = 0;
  private listen = 0;
  private headTurn = 0;
  private glow = 0;
  private lean = 0;
  private tailSwing = 0;

  private readonly qParent = new THREE.Quaternion();
  private readonly qGroup = new THREE.Quaternion();
  private readonly qRot = new THREE.Quaternion();
  private readonly qLocal = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly worldScale = new THREE.Vector3();
  private readonly hipAt = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly boneAt = new THREE.Vector3();
  private readonly childDir = new THREE.Vector3();
  private readonly wantDir = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly knee = new THREE.Vector3();
  private readonly pole = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly foot = { forward: 0, up: 0, planted: false };

  private constructor(root: THREE.Group, clips: THREE.AnimationClip[]) {
    const bone = (name: string) => root.getObjectByName(name) as THREE.Bone;
    this.hips = bone(HIPS);
    this.chest = bone(CHEST);
    this.head = bone(HEAD);
    this.tail = TAIL.map(bone);

    // Measure the rest pose, before anything is moved: the model's own units, facing +x, its midline at some z.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const headAt = this.head.getWorldPosition(new THREE.Vector3());
    const noseAt = bone('Bone003_end').getWorldPosition(new THREE.Vector3());

    // Eyeshine: two glow dots on the head, about 60% of the way to the nose, either side of the midline.
    for (const side of [-1, 1]) {
      const sprite = new THREE.Sprite(eyeShine);
      sprite.visible = false;
      const eye = headAt.clone().lerp(noseAt, 0.6);
      eye.y += 12;
      eye.z += side * 20;
      sprite.position.copy(this.head.worldToLocal(eye));
      this.head.add(sprite);
      this.eyes.push(sprite);
    }

    this.scale = LENGTH / (box.max.x - box.min.x);
    // A pointer's coat. It needs the rest pose and the bounds measured above, so it comes before anything is moved.
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.frustumCulled = false;
      const old = m.material as THREE.Material;
      m.material = applyCoat(m, box, headAt.z, this.scale);
      old.dispose();
    });

    // Place it: the dog stands on y = 0 and the group origin is her middle. The model faces +x; the game's dogs face +z.
    root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -headAt.z);
    this.holder.add(root);
    this.holder.rotation.y = -Math.PI / 2;
    this.holder.scale.setScalar(this.scale);
    this.group.add(this.holder);
    this.group.updateWorldMatrix(true, true);

    // The legs, measured at rest in the dog's own space. The model's rest pose is caught mid-stride, with some feet forward
    // and some back, so each stride is centred on the spot straight under that leg's hip instead.
    const local = (o: THREE.Object3D) => this.group.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
    const parts = LEG_BONES.map(([top, mid, foot, toe, kind]) => ({ t: bone(top), m: bone(mid), f: bone(foot), e: root.getObjectByName(toe)!, kind }));
    const ground = Math.min(...parts.map((l) => local(l.f).y));
    for (const { t, m, f, e, kind } of parts) {
      const hip = local(t);
      const restFoot = local(f);
      this.legs.push({
        front: kind === 'front',
        side: hip.x > 0 ? 1 : -1,
        top: t,
        mid: m,
        foot: f,
        toe: e,
        stand: new THREE.Vector3(hip.x, ground, hip.z),
        upper: hip.distanceTo(local(m)),
        lower: local(m).distanceTo(restFoot),
        toeLength: local(e).distanceTo(restFoot),
        height: hip.y - ground,
        planted: true,
      });
    }

    this.mixer = new THREE.AnimationMixer(root);
    this.idle = this.mixer.clipAction(clips.find((c) => c.name.toLowerCase().includes('idle'))!);
    this.idle.play();

    const moved = [this.hips, this.chest, this.head, ...this.tail, ...this.legs.flatMap((l) => [l.top, l.mid, l.foot])];
    for (const b of moved) this.bones.set(b, { clean: b.quaternion.clone(), bent: b.quaternion.clone() });
  }

  /** Fetch and prepare the model. The FBX loader is only pulled in when the dog is actually loaded. */
  static async load(url: string): Promise<DogSkin> {
    const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
    const root = await new FBXLoader().loadAsync(url);
    return new DogSkin(root, root.animations);
  }

  update(dt: number, pose: DogPose): void {
    this.time += dt;
    const t = this.time;
    const speed = pose.speed;

    this.mixer.update(dt);
    for (const [bone, q] of this.bones) {
      if (bone.quaternion.equals(q.bent)) bone.quaternion.copy(q.clean);
      else q.clean.copy(bone.quaternion);
    }

    this.moving = approach(this.moving, Math.min(1, speed / 0.6), 8, dt);
    this.crouch = approach(this.crouch, pose.alert ? 1 : 0, 4, dt);
    this.sniffGround = approach(this.sniffGround, pose.sniffGround ? 1 : 0, 4, dt);
    this.sniffTree = approach(this.sniffTree, pose.sniffTree ? 1 : 0, 4, dt);
    this.drink = approach(this.drink, pose.drink ? 1 : 0, 3, dt);
    this.perk = approach(this.perk, pose.perk ? 1 : 0, 10, dt);
    this.bow = approach(this.bow, pose.bow ? 1 : 0, 6, dt);
    this.listen = approach(this.listen, pose.listen ? 1 : 0, 6, dt);
    this.headTurn = approach(this.headTurn, pose.headTurn, 6, dt);
    this.glow = approach(this.glow, pose.eyeGlow, 5, dt);
    this.lean = approach(this.lean, pose.turn, 6, dt);
    // The tail swings out the opposite way to a turn, and takes a moment to settle after it.
    this.tailSwing = approach(this.tailSwing, -pose.turn, 3, dt);

    this.gait.update(dt, speed);
    const phi = this.gait.phase * Math.PI * 2;
    const m = this.moving;
    const w = this.gait.blend(speed);

    // How far the body drops so the legs can reach their stride: the longer the stride, the lower she sits.
    const travel = this.gait.stanceTravel(speed) * m;
    let drop = 0;
    for (const leg of this.legs) {
      const reach = 0.97 * (leg.upper + leg.lower);
      drop = Math.max(drop, leg.height - Math.sqrt(Math.max(0, reach * reach - (travel / 2) ** 2)));
    }
    const bob = Math.cos(phi * 2) * 0.012 * m * (1 - w.gallop);
    const shiver = pose.alert ? Math.sin(t * 38) * 0.004 : 0;
    this.holder.position.y = -Math.min(0.14, drop) - this.crouch * 0.05 - this.drink * 0.04 - this.bow * 0.05 - this.moving * 0.01 + bob + shiver;
    this.group.updateWorldMatrix(true, true);

    // The body. A stride flexes the spine; a gallop stretches and gathers it. A turn leans her in and bends her toward it.
    const flex = Math.sin(phi + 0.6) * 0.1 * w.gallop * m;
    const sway = Math.sin(phi) * 0.06 * w.walk * m;
    const roll = -Math.max(-0.16, Math.min(0.16, this.lean * speed * 0.012));
    this.bend(this.hips, Z, roll);
    this.bend(this.hips, X, this.crouch * 0.1 + this.bow * 0.42 + this.drink * 0.2 + this.sniffGround * 0.08 + flex);
    this.bend(this.chest, X, this.crouch * 0.15 + this.sniffGround * 0.6 + this.drink * 0.8 + this.bow * 0.12 - flex * 0.7 + Math.sin(t * 1.9) * 0.012 * (1 - m));
    this.bend(this.chest, Y, this.headTurn * 0.3 + sway + Math.max(-0.5, Math.min(0.5, this.lean)) * 0.1);

    // Head: leads her turns, then looks around on its own when she stands still, with a bob in time with each stride.
    const idleLook = (1 - m) * (1 - this.sniffGround - this.sniffTree - this.drink - this.listen > 0 ? 1 : 0);
    const look = pose.alert ? Math.sin(t * 0.9) * 0.05 : drift(t, 0.37, 0.23, 0.11) * 0.45 * idleLook + Math.sin(t * 2.3) * 0.22 * this.sniffTree + Math.sin(t * 1.4) * 0.6 * this.listen;
    const bobHead = Math.sin(phi * 2 + 0.8) * 0.04 * m;
    this.bend(
      this.head,
      X,
      this.crouch * 0.25 +
        this.sniffGround * (0.9 + Math.sin(t * 9) * 0.06) +
        this.sniffTree * (0.05 + Math.sin(t * 7) * 0.08) +
        this.drink * (1.0 + Math.sin(t * 5.5) * 0.05) +
        this.bow * 0.2 -
        this.perk * 0.25 -
        this.listen * 0.12 +
        bobHead +
        drift(t, 0.29, 0.17, 0.13) * 0.05 * idleLook,
    );
    this.bend(this.head, Y, look + this.headTurn * 0.7 + pose.lookAhead * 0.5 * m + this.lean * 0.08);

    // Tail: down when she is scared, up for a play bow, and wagging unevenly, harder the happier she is.
    const eager = pose.happy ? 1 : 0;
    const wag = pose.alert ? 0 : (Math.sin(t * (4.2 + 3 * eager)) * 0.6 + Math.sin(t * (1.7 + eager) + 0.9) * 0.4) * (pose.happy ? 0.38 : 0.2) * (0.7 + 0.3 * Math.sin(t * 0.8));
    const lift = -this.crouch * 0.7 + this.bow * 0.7 + w.gallop * m * 0.25;
    this.tail.forEach((b, i) => {
      this.bend(b, Y, (wag + this.tailSwing * 0.1) * (0.5 + i * 0.25));
      this.bend(b, X, lift * 0.4);
    });

    // The legs: reach each foot to where the stride says it should be.
    this.group.getWorldQuaternion(this.qGroup);
    this.forward.copy(Z).applyQuaternion(this.qGroup);
    const liftHeight = Math.min(0.12, 0.06 + 0.012 * speed);
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      this.gait.foot(leg, speed, liftHeight, this.foot);
      this.target.set(leg.stand.x, leg.stand.y + this.foot.up, leg.stand.z + this.foot.forward);
      this.group.localToWorld(this.target);
      this.reach(leg);
      // A footfall, from two of the legs so the sound is not busier than a stride needs.
      if (this.foot.planted && !leg.planted && speed > 0.6 && (i === 0 || i === 3)) this.onStep?.();
      leg.planted = this.foot.planted;
    }

    for (const [bone, q] of this.bones) q.bent.copy(bone.quaternion);

    // Eyeshine, sized to stay visible at a distance. The sprites sit inside a scaled skeleton, so divide by the head's real scale.
    const on = this.glow > 0.02;
    const size = (0.14 + pose.viewDist * 0.02) / this.head.getWorldScale(this.worldScale).x;
    for (const e of this.eyes) {
      e.visible = on;
      e.scale.setScalar(size);
    }
    eyeShine.opacity = Math.min(1, this.glow * 1.1);
  }

  /** Two-bone IK: bend a leg so its foot reaches `this.target`, with the knee pointing forward, and the paw flat. */
  private reach(leg: Leg): void {
    leg.top.getWorldPosition(this.hipAt);
    this.dir.subVectors(this.target, this.hipAt);
    const full = leg.upper + leg.lower;
    const distance = Math.min(Math.max(this.dir.length(), Math.abs(leg.upper - leg.lower) + 1e-3), full * 0.999);
    this.dir.normalize();

    // The knee sits off the hip-to-foot line, toward the front of the dog (law of cosines for how far off).
    this.pole.copy(this.forward).addScaledVector(this.dir, -this.forward.dot(this.dir)).normalize();
    const cos = (leg.upper * leg.upper + distance * distance - leg.lower * leg.lower) / (2 * leg.upper * distance);
    const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
    this.knee.copy(this.hipAt).addScaledVector(this.dir, Math.cos(angle) * leg.upper).addScaledVector(this.pole, Math.sin(angle) * leg.upper);
    this.aim(leg.top, leg.mid, this.knee);

    // Then the foot: the target itself, or the nearest point the leg can stretch to.
    this.goal.copy(this.hipAt).addScaledVector(this.dir, distance);
    this.aim(leg.mid, leg.foot, this.goal);

    // Keep the paw level, pointing the way she faces.
    leg.foot.getWorldPosition(this.goal).addScaledVector(this.forward, leg.toeLength);
    this.aim(leg.foot, leg.toe, this.goal);
  }

  /** Turn a bone so the line from it to `child` points at `target`. */
  private aim(bone: THREE.Bone, child: THREE.Object3D, target: THREE.Vector3): void {
    bone.getWorldPosition(this.boneAt);
    this.childDir.copy(child.getWorldPosition(this.wantDir)).sub(this.boneAt).normalize();
    this.wantDir.subVectors(target, this.boneAt).normalize();
    this.qRot.setFromUnitVectors(this.childDir, this.wantDir);
    this.rotate(bone, this.qRot);
  }

  /** Rotate a bone about an axis given in the dog's own space, on top of whatever the animation did. */
  private bend(bone: THREE.Bone, axis: THREE.Vector3, angle: number): void {
    if (Math.abs(angle) < 1e-4) return;
    this.group.getWorldQuaternion(this.qGroup);
    this.axis.copy(axis).applyQuaternion(this.qGroup);
    this.qRot.setFromAxisAngle(this.axis, angle);
    this.rotate(bone, this.qRot);
  }

  /** Apply a rotation given in world space to a bone's local rotation. */
  private rotate(bone: THREE.Bone, world: THREE.Quaternion): void {
    bone.parent!.getWorldQuaternion(this.qParent);
    // New local rotation = parent^-1 * rotation * parent * local, so the turn happens in world terms.
    this.qLocal.copy(this.qParent).invert().multiply(world).multiply(this.qParent);
    bone.quaternion.premultiply(this.qLocal);
    bone.updateMatrixWorld(true);
  }
}
