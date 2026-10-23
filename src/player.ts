import * as THREE from 'three';
import type { Forest } from './forest';

const EYE_HEIGHT = 1.7;
const STEP_LENGTH = 1.3;
const LOOK_MOUSE = 0.0022;
const LOOK_TOUCH = 0.0055;
const STICK_RADIUS = 55;
const GRAVITY = 12;
/** Takeoff speed: about 0.5 m of air, enough to hop a log, not enough to feel safe. */
const JUMP_SPEED = 3.4;
const JUMP_STAMINA = 0.08;
/** A touch that ends this quickly and barely moved is a tap, which jumps. */
const TAP_MS = 250;
const TAP_SLOP = 14;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  speed = 0;
  /** 0..1. Sprinting drains it; resting refills it. */
  stamina = 1;
  frozen = false;
  private exhausted = false;
  /** Set when a touch is used; switches movement to analog-stick speeds. */
  touchMode = false;
  onStep?: (sprinting: boolean) => void;
  onJump?: () => void;
  onLand?: () => void;

  /** Eye height above the ground-level eye position; 0 while standing. */
  private lift = 0;
  private liftVel = 0;
  private jumpQueued = false;
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

  /** Release every held input (used when pausing). */
  releaseInput(): void {
    this.keys.clear();
    this.jumpQueued = false;
    this.stickId = this.lookId = -1;
    this.stickX = this.stickY = 0;
    this.stickBase.style.display = 'none';
  }

  update(dt: number, forest: Forest): void {
    this.time += dt;
    this.updateJump(dt);
    if (this.frozen) {
      this.vel.set(0, 0, 0);
      this.speed = 0;
      return;
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
    if (az < 0) az *= 0.55; // backing away is slow
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

    // Little steering once your feet are off the ground.
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
    const bob = Math.abs(Math.sin(phase)) * 0.05 * amp + Math.sin(this.time * 1.4) * 0.004;
    camera.position.set(this.pos.x, EYE_HEIGHT + bob + this.lift, this.pos.z);
    camera.rotation.set(this.pitch, this.yaw, Math.sin(phase) * 0.006 * amp, 'YXZ');
  }
}
