import * as THREE from 'three';
import type { Forest } from '../forest';
import type { Player } from '../player';
import { angleDiff, approach, rand } from '../util';
import { Alert } from './behaviors/alert';
import { Behavior, type Frame } from './behaviors/behavior';
import { Bow } from './behaviors/bow';
import { Come } from './behaviors/come';
import { Dash } from './behaviors/dash';
import { Explore } from './behaviors/explore';
import { Heel } from './behaviors/heel';
import { KeepUp } from './behaviors/keepup';
import { Linger, type LingerKind } from './behaviors/linger';
import { Listen } from './behaviors/listen';
import { Trail } from './behaviors/trail';
import { Wait } from './behaviors/wait';
import { Zoom } from './behaviors/zoom';
import { Distraction } from './distraction';
import { EyeContact } from './eyecontact';
import type { DogPose } from './model';
import { Playfulness } from './playfulness';
import { PlayerTracker } from './tracker';
import { DOG } from './tuning';
import { Wander } from './wander';

export type DogState = 'explore' | 'sniff' | 'inspect' | 'drink' | 'come' | 'heel' | 'keepup' | 'alert' | 'dash' | 'wait' | 'bow' | 'zoom' | 'trail' | 'listen';

/** Where she wants to go this frame, and how. The current behavior fills it in; `move` does the rest. */
export interface Steer {
  goalX: number;
  goalZ: number;
  maxSpeed: number;
  /** Slow down on the way in, rather than arriving at full speed. */
  ease: boolean;
  /** Hold still. */
  stay: boolean;
}

const range = (r: readonly [number, number]) => rand(r[0], r[1]);

/**
 * Decides what the dog does. It runs whichever behavior is current, walks her where that behavior wants,
 * and handles what cuts across all of them: threats, false alarms, a whistle, a running player, a tree catching her eye.
 */
export class DogBrain {
  state: DogState = 'heel';
  heading = 0;
  speed = 0;
  /** World yaw toward a real threat. While set, the dog stares that way and stops random false alarms. */
  threatHeading: number | null = null;
  /** Where the dog walks when at heel, as an angle to the right of the player's view direction. */
  followAngle = 0.5;
  followDist = 2.0;
  /** False alarms: now and then the dog stares at nothing. Off for a calm walk. */
  alarms = true;
  /** Set while a real threat is in view, so an alert holds her ground. */
  fromThreat = false;
  lookHeading = 0;

  onAlertStart?: (heading: number) => void;
  onAlertEnd?: () => void;

  readonly pose: DogPose = { speed: 0, alert: false, sniffGround: false, sniffTree: false, drink: false, perk: false, happy: false, bow: false, listen: false, headTurn: 0, eyeGlow: 0, viewDist: 0 };
  readonly steer: Steer = { goalX: 0, goalZ: 0, maxSpeed: 0, ease: true, stay: false };
  readonly wander = new Wander();
  readonly pull = new Distraction();
  readonly play = new Playfulness();
  readonly motion = new PlayerTracker();
  /** A scratch vector for behaviors to use without allocating. */
  readonly scratch = new THREE.Vector3();

  private readonly eyeContact = new EyeContact();
  private readonly heelBehavior = new Heel(this);
  private readonly comeBehavior = new Come(this);
  private readonly keepUpBehavior = new KeepUp(this);
  private readonly dashBehavior = new Dash(this);
  private readonly waitBehavior = new Wait(this);
  private readonly bowBehavior = new Bow(this);
  private readonly zoomBehavior = new Zoom(this);
  private readonly trailBehavior = new Trail(this);
  private readonly listenBehavior = new Listen(this);
  private readonly lingers: Record<LingerKind, Linger> = {
    sniff: new Linger(this, 'sniff'),
    inspect: new Linger(this, 'inspect'),
    drink: new Linger(this, 'drink'),
  };
  private readonly behaviors: Record<DogState, Behavior> = {
    explore: new Explore(this),
    sniff: this.lingers.sniff,
    inspect: this.lingers.inspect,
    drink: this.lingers.drink,
    come: this.comeBehavior,
    heel: this.heelBehavior,
    keepup: this.keepUpBehavior,
    alert: new Alert(this),
    dash: this.dashBehavior,
    wait: this.waitBehavior,
    bow: this.bowBehavior,
    zoom: this.zoomBehavior,
    trail: this.trailBehavior,
    listen: this.listenBehavior,
  };
  private readonly frame = {} as Frame;
  private elapsed = 0;
  private nextAlert = range(DOG.firstAlert);
  private playCooldown = 0;

  constructor(readonly pos: THREE.Vector3) {}

  /** Seconds in the current state. */
  get stateTime(): number {
    return this.elapsed;
  }

  /** 0 to 1: how easily she gets sidetracked. Scales every detour, and how often a tree gets its hooks in. 0.5 is the baseline. */
  get distraction(): number {
    return this.pull.level;
  }

  set distraction(level: number) {
    this.pull.level = level;
  }

  /** Absorbed in a tree: she stays until whistled back, or until the player is very far away. */
  get hooked(): boolean {
    return this.pull.hooked;
  }

  /** 0 to 1: a low level sticks close to its owner; a high one runs off and does her own thing. */
  get playfulness(): number {
    return this.play.level;
  }

  set playfulness(level: number) {
    this.play.level = level;
  }

  /** How far from the player she will wander before turning back. */
  get roamMax(): number {
    return this.play.at(DOG.play.roam);
  }

  /** How long she stays at heel for, scaled by how playful she is. */
  heelFor(seconds: readonly [number, number]): number {
    return range(seconds) * this.play.at(DOG.play.heelFactor);
  }

  reset(player: Player): void {
    this.followTarget(player, this.scratch);
    this.pos.copy(this.scratch);
    this.heading = player.yaw + Math.PI;
    this.heel(range(DOG.heelAtStart));
    this.speed = 0;
    this.wander.reset();
    this.pull.reset();
    this.eyeContact.reset();
    this.playCooldown = range(DOG.play.cooldown);
    this.motion.reset(player);
  }

  /** The player whistles: the dog looks up, then runs back to heel. Ignored while she is facing a threat. */
  call(delay?: number): void {
    if (this.state === 'alert') return;
    this.enter('come');
    this.comeBehavior.begin(delay);
  }

  update(dt: number, player: Player, forest: Forest): void {
    this.elapsed += dt;
    this.playCooldown -= dt;
    this.motion.update(dt, player);
    this.updateAlert(dt, player);
    this.checkDistraction(dt, forest);

    const f = this.frame;
    f.dt = dt;
    f.player = player;
    f.forest = forest;
    f.toX = player.pos.x - this.pos.x;
    f.toZ = player.pos.z - this.pos.z;
    f.playerDist = Math.hypot(f.toX, f.toZ);
    this.noticeRunning(f);
    this.checkEyeContact(f);

    const s = this.steer;
    s.goalX = this.pos.x;
    s.goalZ = this.pos.z;
    s.maxSpeed = 0;
    s.ease = true;
    s.stay = false;
    this.behaviors[this.state].update(f);

    this.move(f);
    this.updatePose();
  }

  enter(state: DogState): void {
    this.state = state;
    this.elapsed = 0;
    this.pull.release();
  }

  /** Stay close beside the player for a while. */
  heel(seconds: number): void {
    this.enter('heel');
    this.heelBehavior.timeLeft = seconds;
  }

  /** Stand and sniff the ground, sniff a tree, or drink, for a while. */
  linger(kind: LingerKind, seconds: number): void {
    this.enter(kind);
    this.lingers[kind].timeLeft = seconds;
  }

  /** Somewhere new to go. Without a forest to look at she just heads off around the player. */
  pickWaypoint(player: Player, forest?: Forest): void {
    const detour = !!forest && this.pull.chance(DOG.detourChance);
    this.wander.pick(this.pos, player, this.motion, forest, detour, this.roamMax, this.play.at(DOG.play.runChance));
  }

  /** What next: now and then something playful, otherwise wander on. */
  pickNext(player: Player, forest: Forest): void {
    if (this.playCooldown <= 0) {
      const r = Math.random();
      let c = this.play.at(DOG.play.dash);
      if (r < c) return this.dash(player);
      c += this.play.at(DOG.play.zoom);
      if (r < c) return this.zoom(player);
      c += this.play.at(DOG.play.trail);
      if (r < c) return this.trail();
      c += this.play.at(DOG.play.listen);
      if (r < c) return this.listen();
    }
    this.enter('explore');
    this.pickWaypoint(player, forest);
  }

  /** Run flat out to somewhere ahead or to the side. */
  dash(player: Player): void {
    this.startPlaying('dash');
    this.dashBehavior.begin(player);
  }

  /** Stand looking back at the player, waiting for them. */
  wait(seconds: number): void {
    this.enter('wait');
    this.waitBehavior.timeLeft = seconds;
  }

  /** A play bow, then either stay by the player or bolt off. */
  bow(after: 'heel' | 'dash'): void {
    this.enter('bow');
    this.bowBehavior.after = after;
  }

  private zoom(player: Player): void {
    this.startPlaying('zoom');
    this.zoomBehavior.begin(player);
  }

  private trail(): void {
    this.startPlaying('trail');
    this.trailBehavior.begin();
  }

  private listen(): void {
    this.startPlaying('listen');
    this.listenBehavior.begin();
  }

  private startPlaying(state: DogState): void {
    this.enter(state);
    this.playCooldown = range(DOG.play.cooldown);
  }

  followTarget(player: Player, out: THREE.Vector3): void {
    const a = player.yaw - this.followAngle;
    out.set(player.pos.x - Math.sin(a) * this.followDist, 0, player.pos.z - Math.cos(a) * this.followDist);
  }

  /** Walk toward the goal, turning first, then ease the speed and face the right way. */
  private move(f: Frame): void {
    const { dt, player, forest } = f;
    const s = this.steer;
    const b = this.behaviors[this.state];
    const dx = s.goalX - this.pos.x;
    const dz = s.goalZ - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const goalHeading = Math.atan2(dx, dz);

    let desired = 0;
    if (!s.stay && dist > 0.2) {
      desired = s.ease || b.following ? Math.min(dist * 2.4, s.maxSpeed) : s.maxSpeed;
      // Turn before setting off: a dog pivots toward where she is going, she doesn't slide sideways.
      desired *= 0.15 + 0.85 * Math.max(0, Math.cos(Math.min(Math.abs(angleDiff(goalHeading, this.heading)), Math.PI / 2)));
    }
    this.speed = approach(this.speed, desired, desired > this.speed ? b.accel : DOG.slowDown, dt);

    if (this.speed > 0.01 && dist > 1e-4) {
      this.pos.x += (dx / dist) * this.speed * dt;
      this.pos.z += (dz / dist) * this.speed * dt;
    }
    if (f.playerDist > 30) {
      this.followTarget(player, this.scratch);
      this.pos.copy(this.scratch);
    }

    forest.collide(this.pos, 0.35);
    const px = this.pos.x - player.pos.x;
    const pz = this.pos.z - player.pos.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.9 && pd > 1e-4) {
      this.pos.x = player.pos.x + (px / pd) * 0.9;
      this.pos.z = player.pos.z + (pz / pd) * 0.9;
    }

    // Read after the behavior may have changed state this frame, so she turns for what she has just started.
    const nb = this.behaviors[this.state];
    const focus = nb.face(f);
    let toward = goalHeading;
    let rate: number;
    if (focus) {
      toward = focus.toward;
      rate = focus.rate;
    } else if (this.speed > 0.4 || (!s.stay && dist > 0.6)) {
      // Pivot quickly when slow, take wider turns at a run.
      rate = this.speed > 5 ? DOG.turnRun : DOG.turnWalk;
    } else {
      toward = player.yaw + Math.PI;
      rate = 2;
    }
    this.heading += angleDiff(toward, this.heading) * Math.min(1, dt * rate);
  }

  private updateAlert(dt: number, player: Player): void {
    if (this.threatHeading !== null) {
      if (this.state !== 'alert') this.enter('alert');
      this.fromThreat = true;
      this.lookHeading = this.threatHeading;
    } else if (this.fromThreat) {
      this.fromThreat = false;
      this.heel(range(DOG.heelAfterThreat));
      this.nextAlert = range(DOG.nextAlertAfterThreat);
    } else if (this.state === 'alert') {
      if (this.elapsed > 6) {
        this.enter('explore');
        this.pickWaypoint(player);
        this.nextAlert = range(DOG.nextAlertAfterAlarm);
        this.onAlertEnd?.();
      }
    } else if (this.alarms && this.behaviors[this.state].alarmable) {
      this.nextAlert -= dt;
      if (this.nextAlert <= 0) {
        this.enter('alert');
        const side = Math.random() < 0.5 ? -1 : 1;
        this.lookHeading = player.yaw + Math.PI + side * rand(0.9, 1.8);
        this.onAlertStart?.(this.lookHeading);
      }
    }
  }

  /** If the player is running and she is near and looking their way, she takes off after them. Otherwise she doesn't notice. */
  private noticeRunning(f: Frame): void {
    if (!this.behaviors[this.state].busy || !f.player.running || f.playerDist > DOG.noticeDist) return;
    const looking = Math.abs(angleDiff(Math.atan2(f.toX, f.toZ), this.heading)) < DOG.noticeAngle;
    if (looking || this.state === 'heel') {
      this.enter('keepup');
      this.keepUpBehavior.idleFor = 0;
    }
  }

  /** You look at her and she looks at you: she recognises you and runs over, as if called. */
  private checkEyeContact(f: Frame): void {
    const eligible = this.behaviors[this.state].greets;
    const bearingToDog = Math.atan2(-f.toX, -f.toZ);
    if (this.eyeContact.update(f.dt, eligible, bearingToDog, f.player.yaw, this.heading, f.playerDist)) {
      this.call(range(DOG.eyeContact.delay));
    }
  }

  /** Walking along with the player, now and then a tree she passes catches her interest and she goes to sniff it. */
  private checkDistraction(dt: number, forest: Forest): void {
    const calm = this.state === 'heel' || this.state === 'explore';
    const tree = this.pull.check(dt, this.pos, forest, calm && this.motion.speed >= 1);
    if (!tree) return;
    this.enter('explore');
    this.wander.goTo(this.pos, tree);
    this.pull.pending = true;
  }

  private updatePose(): void {
    const p = this.pose;
    p.speed = this.speed;
    p.alert = p.sniffGround = p.sniffTree = p.drink = p.perk = p.happy = p.bow = p.listen = false;
    const b = this.behaviors[this.state];
    b.pose(p);

    const f = this.frame;
    const bearing = Math.atan2(f.toX, f.toZ);
    p.headTurn = b.watching ? Math.max(-1, Math.min(1, angleDiff(bearing, this.heading))) : 0;
    // Eyeshine: strongest when she faces the player, and only once she is far enough away to need it.
    const facing = Math.cos(angleDiff(bearing, this.heading));
    p.eyeGlow = Math.max(0, Math.min(1, (facing - 0.2) / 0.6)) * Math.max(0, Math.min(1, (f.playerDist - 4) / 5));
    p.viewDist = f.playerDist;
  }
}
