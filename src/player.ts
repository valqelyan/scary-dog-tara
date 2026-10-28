import * as THREE from 'three';
import type { Forest, TreeSpot } from './forest';

const EYE_HEIGHT = 1.7;
const STEP_LENGTH = 1.3;
const LOOK_MOUSE = 0.0022;
const LOOK_TOUCH = 0.0055;
const STICK_RADIUS = 55;
const GRAVITY = 12;
const JUMP_SPEED = 3.4;
const JUMP_STAMINA = 0.08;
const CLIMB_REACH = 1.2;
const CLIMB_MIN_HEIGHT = 6;
/** How far up the trunk the eyes can get, as a fraction of its height. */
const CLIMB_TOP = 0.8;
const CLIMB_UP = 1.5;
const CLIMB_DOWN = 2;
const CLIMB_CIRCLE = 1.2;
const CLIMB_GAP = 0.45;
const CLIMB_RUNG = 0.6;
const CLIMB_MIN_STAMINA = 0.15;
/** Stamina per second: pulling up, lowering, and just hanging on. */
const CLIMB_COST_UP = 0.1;
const CLIMB_COST_DOWN = 0.02;
const CLIMB_COST_HOLD = 0.03;
const PUSH_OFF = 1.8;
const TAP_MS = 250;
const TAP_SLOP = 14;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  speed = 0;
  stamina = 1;
  frozen = false;
  private exhausted = false;
  touchMode = false;
  onStep?: (sprinting: boolean) => void;
  onJump?: () => void;
  onLand?: () => void;
  onGrab?: () => void;
  onRung?: () => void;

  private lift = 0;
  private liftVel = 0;
  private jumpQueued = false;
  private climbQueued = false;
  private tree: TreeSpot | null = null;
  private angle = 0;
  private rung = 0;
  private tapT = 0;
  private tapX = 0;
  private tapY = 0;

  private keys = new Set<string>();
  private stickId = -1;
  private stickX0 = 0;
  private stickY0 = 0;
  private stickX = 0;
  private stickY = 0;
  private lookId = -1;
  private lookX = 0;
  private lookY = 0;
  private dist = 0;
  private lastStep = 0;
  private time = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private stickBase: HTMLElement,
    private stickKnob: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      // Only while the mouse is captured, so Space on a menu button does not queue a jump.
      if (e.code === 'Space' && !e.repeat && document.pointerLockElement === this.canvas) this.jumpQueued = true;
      if (e.code === 'KeyE' && !e.repeat && document.pointerLockElement === this.canvas) this.climbQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.look(-e.movementX * LOOK_MOUSE, -e.movementY * LOOK_MOUSE);
    });

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    // Stop iOS pinch / double-tap gestures from hijacking the game.
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(ev, (e) => e.preventDefault());
    }
  }

  private look(dyaw: number, dpitch: number): void {
    this.yaw += dyaw;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch + dpitch));
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    this.touchMode = true;
    this.canvas.setPointerCapture(e.pointerId);
    if (e.clientX < window.innerWidth / 2) {
      if (this.stickId !== -1) return;
      this.stickId = e.pointerId;
      this.stickX0 = e.clientX;
      this.stickY0 = e.clientY;
      this.stickX = this.stickY = 0;
      this.stickBase.style.display = 'block';
      this.stickBase.style.left = `${e.clientX}px`;
      this.stickBase.style.top = `${e.clientY}px`;
      this.stickKnob.style.transform = 'translate(0px, 0px)';
    } else if (this.lookId === -1) {
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      this.tapT = performance.now();
      this.tapX = e.clientX;
      this.tapY = e.clientY;
    }
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      let dx = (e.clientX - this.stickX0) / STICK_RADIUS;
      let dy = (e.clientY - this.stickY0) / STICK_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.stickX = dx;
      this.stickY = dy;
      this.stickKnob.style.transform = `translate(${dx * STICK_RADIUS}px, ${dy * STICK_RADIUS}px)`;
    } else if (e.pointerId === this.lookId) {
      this.look(-(e.clientX - this.lookX) * LOOK_TOUCH, -(e.clientY - this.lookY) * LOOK_TOUCH);
      this.lookX = e.clientX;
      this.lookY = e.clientY;
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.stickX = this.stickY = 0;
      this.stickBase.style.display = 'none';
    } else if (e.pointerId === this.lookId) {
      this.lookId = -1;
      const quick = performance.now() - this.tapT < TAP_MS;
      if (e.type === 'pointerup' && quick && Math.hypot(e.clientX - this.tapX, e.clientY - this.tapY) < TAP_SLOP) {
        this.jumpQueued = true;
      }
    }
  }

  releaseInput(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.climbQueued = false;
    this.stickId = this.lookId = -1;
    this.stickX = this.stickY = 0;
    this.stickBase.style.display = 'none';
  }

  /** Grab the trunk in front of you, or let go if you are already on one. */
  requestClimb(): void {
    this.climbQueued = true;
  }

  get climbing(): boolean {
    return this.tree !== null;
  }

  /** The trunk you are facing and could grab right now, if any. */
  climbTarget(forest: Forest): TreeSpot | null {
    if (this.tree || this.frozen || !this.grounded || this.exhausted || this.stamina < CLIMB_MIN_STAMINA) return null;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    let best: TreeSpot | null = null;
    let bestDot = 0.6;
    for (const t of forest.treesNear(this.pos.x, this.pos.z, CLIMB_REACH)) {
      if (t.height < CLIMB_MIN_HEIGHT) continue;
      const dx = t.x - this.pos.x;
      const dz = t.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > bestDot) {
        bestDot = dot;
        best = t;
      }
    }
    return best;
  }

  /** Drop off any trunk and stand on the ground. */
  dismount(): void {
    this.tree = null;
    this.lift = 0;
    this.liftVel = 0;
  }

  private grab(t: TreeSpot): void {
    this.tree = t;
    this.angle = Math.atan2(this.pos.x - t.x, this.pos.z - t.z);
    this.vel.set(0, 0, 0);
    this.speed = 0;
    this.rung = 0;
    this.placeOnTrunk();
    this.onGrab?.();
  }

  private placeOnTrunk(): void {
    const t = this.tree!;
    const d = t.r + CLIMB_GAP;
    this.pos.x = t.x + Math.sin(this.angle) * d;
    this.pos.z = t.z + Math.cos(this.angle) * d;
  }

  /** Let go. Falls from wherever you are; `push` kicks off the trunk first. */
  private letGo(push: boolean): void {
    const t = this.tree!;
    this.tree = null;
    if (!push || this.lift < 0.3) return;
    this.liftVel = 1.5;
    this.vel.set(Math.sin(this.angle) * PUSH_OFF, 0, Math.cos(this.angle) * PUSH_OFF);
    this.pos.x = t.x + Math.sin(this.angle) * (t.r + CLIMB_GAP);
    this.pos.z = t.z + Math.cos(this.angle) * (t.r + CLIMB_GAP);
  }

  private updateClimb(dt: number): void {
    const t = this.tree!;
    const k = this.keys;
    this.speed = 0;
    this.vel.set(0, 0, 0);

    if (this.climbQueued || this.jumpQueued) {
      this.letGo(this.jumpQueued);
      this.jumpQueued = this.climbQueued = false;
      return;
    }

    let up = 0;
    let around = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) up += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) up -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) around += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) around -= 1;
    if (this.stickId !== -1) {
      up -= this.stickY;
      around += this.stickX;
    }
    up = Math.max(-1, Math.min(1, up));
    around = Math.max(-1, Math.min(1, around));

    // Circling the trunk turns the view with you, so you keep facing the bark.
    const da = (around * CLIMB_CIRCLE * dt) / (t.r + CLIMB_GAP);
    this.angle += da;
    this.yaw += da;
    this.placeOnTrunk();

    const top = Math.max(0, t.height * CLIMB_TOP - EYE_HEIGHT);
    const before = this.lift;
    let cost = this.lift > 0.3 ? CLIMB_COST_HOLD : 0;
    if (up > 0 && this.lift < top) {
      this.lift = Math.min(top, this.lift + up * CLIMB_UP * dt);
      cost = CLIMB_COST_UP * up;
    } else if (up < 0) {
      this.lift = Math.max(0, this.lift + up * CLIMB_DOWN * dt);
      cost = CLIMB_COST_DOWN;
    }
    this.stamina = Math.max(0, this.stamina - cost * dt);

    const rung = Math.floor(this.lift / CLIMB_RUNG);
    if (rung !== this.rung && this.lift !== before) this.onRung?.();
    this.rung = rung;

    if (this.stamina <= 0) {
      this.exhausted = true;
      this.letGo(false);
    } else if (this.lift <= 0 && up < 0) {
      this.letGo(false);
    }
  }

  update(dt: number, forest: Forest): void {
    this.time += dt;
    if (this.frozen && this.tree) this.letGo(false);
    if (this.tree) {
      this.updateClimb(dt);
      return;
    }
    this.updateJump(dt);
    if (this.frozen) {
      this.climbQueued = false;
      this.vel.set(0, 0, 0);
      this.speed = 0;
      return;
    }
    if (this.climbQueued) {
      this.climbQueued = false;
      const t = this.climbTarget(forest);
      if (t) {
        this.grab(t);
        return;
      }
    }
    const k = this.keys;
    let ax = 0;
    let az = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) az += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) az -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) ax += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) ax -= 1;
    if (this.stickId !== -1) {
      ax += this.stickX;
      az -= this.stickY;
    }
    if (az < 0) az *= 0.55;
    const len = Math.hypot(ax, az);
    if (len > 1) {
      ax /= len;
      az /= len;
    }

    if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    const canSprint = !this.exhausted && this.stamina > 0.02;
    const wantSprint = this.stickId !== -1 ? len > 0.95 : k.has('ShiftLeft') || k.has('ShiftRight');
    const sprinting = wantSprint && canSprint && len > 0.1;
    const maxSpeed = sprinting ? 4.6 : this.stickId !== -1 ? 3.0 : 2.6;
    if (sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 0.2);
      if (this.stamina <= 0.02) this.exhausted = true;
    } else {
      this.stamina = Math.min(1, this.stamina + dt * (len > 0.1 ? 0.07 : 0.14));
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const tvx = (-sin * az + cos * ax) * maxSpeed;
    const tvz = (-cos * az - sin * ax) * maxSpeed;

    const f = 1 - Math.exp(-(this.grounded ? 10 : 2.5) * dt);
    this.vel.x += (tvx - this.vel.x) * f;
    this.vel.z += (tvz - this.vel.z) * f;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    forest.collide(this.pos, 0.4);

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.dist += this.speed * dt;
    const stepIdx = Math.floor(this.dist / STEP_LENGTH);
    if (stepIdx !== this.lastStep) {
      this.lastStep = stepIdx;
      if (this.speed > 0.4 && this.grounded) this.onStep?.(this.speed > 3.3);
    }
  }

  /** Moving fast enough to count as running. */
  get running(): boolean {
    return this.speed > 3.3;
  }

  get grounded(): boolean {
    return this.lift <= 0 && this.liftVel <= 0;
  }

  private updateJump(dt: number): void {
    if (this.jumpQueued && this.grounded && !this.frozen) {
      this.liftVel = JUMP_SPEED;
      this.stamina = Math.max(0, this.stamina - JUMP_STAMINA);
      this.onJump?.();
    }
    this.jumpQueued = false;
    if (this.grounded) return;
    this.liftVel -= GRAVITY * dt;
    this.lift += this.liftVel * dt;
    if (this.lift <= 0) {
      this.lift = 0;
      this.liftVel = 0;
      this.onLand?.();
    }
  }

  applyToCamera(camera: THREE.PerspectiveCamera): void {
    const phase = (this.dist / STEP_LENGTH) * Math.PI;
    const amp = this.grounded ? Math.min(1, this.speed / 2.6) : 0;
    const sway = this.tree ? Math.sin((this.lift / CLIMB_RUNG) * Math.PI) * 0.03 : 0;
    const bob = Math.abs(Math.sin(phase)) * 0.05 * amp + Math.sin(this.time * 1.4) * 0.004 + sway;
    camera.position.set(this.pos.x, EYE_HEIGHT + bob + this.lift, this.pos.z);
    camera.rotation.set(this.pitch, this.yaw, Math.sin(phase) * 0.006 * amp, 'YXZ');
  }
}
