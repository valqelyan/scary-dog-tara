import * as THREE from 'three';
import type { Forest } from './forest';
import type { Player } from './player';
import type { DogPose } from './dogmodel';

export type DogState = 'explore' | 'sniff' | 'inspect' | 'drink' | 'come' | 'heel' | 'keepup' | 'alert';

const TROT = 3.2;
const RUN = 6.6;
/** How far from the player the dog will wander before it turns back, in metres. */
const ROAM_MAX = 11;
/** The dog only reacts to the player running if it is this close and roughly facing them. */
const NOTICE_DIST = 9;
const NOTICE_ANGLE = 1.15;

function angleDiff(target: number, current: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const tmpTarget = new THREE.Vector3();

/**
 * Decides what the dog does: wander and investigate, come when whistled, keep up when you run, and
 * freeze when something is wrong. It moves `pos` and `heading`; the model turns that into a pose.
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

  onAlertStart?: (heading: number) => void;
  onAlertEnd?: () => void;

  readonly pose: DogPose = { speed: 0, alert: false, sniffGround: false, sniffTree: false, drink: false, perk: false, happy: false };

  private stateT = 0;
  private nextAlert = rand(20, 30);
  private lookHeading = 0;
  private fromThreat = false;

  private waypointX = 0;
  private waypointZ = 0;
  private gait = TROT;
  private waitT = 0;
  private heelT = 0;
  private callDelay = 0;
  private keepUpT = 0;
  /** Set when the waypoint is something to investigate: where to face once it arrives. */
  private poi: { kind: 'tree' | 'puddle'; x: number; z: number } | null = null;
  private lastPoi: { x: number; z: number } | null = null;

  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;
  private lastPX = 0;
  private lastPZ = 0;
  private pvx = 0;
  private pvz = 0;

  constructor(readonly pos: THREE.Vector3) {}

  reset(player: Player): void {
    this.computeTarget(player, tmpTarget);
    this.pos.copy(tmpTarget);
    this.heading = player.yaw + Math.PI;
    this.enter('heel');
    this.heelT = rand(5, 8);
    this.speed = 0;
    this.poi = null;
    this.lastPX = player.pos.x;
    this.lastPZ = player.pos.z;
    this.pvx = this.pvz = 0;
  }

  /** The player whistles: the dog looks up, then runs back to heel. Ignored while it is facing a threat. */
  call(): void {
    if (this.state === 'alert') return;
    this.enter('come');
    this.callDelay = rand(0.35, 0.7);
  }

  update(dt: number, player: Player, forest: Forest): void {
    this.stateT += dt;
    this.trackPlayer(dt, player);
    this.updateAlert(dt, player);

    const toPlayerX = player.pos.x - this.pos.x;
    const toPlayerZ = player.pos.z - this.pos.z;
    const playerDist = Math.hypot(toPlayerX, toPlayerZ);
    this.noticeRunning(dt, player, toPlayerX, toPlayerZ, playerDist);

    let goalX = this.pos.x;
    let goalZ = this.pos.z;
    let maxSpeed = 0;
    let easeIn = true;
    let stay = false;

    switch (this.state) {
      case 'explore': {
        if (Math.hypot(this.waypointX - player.pos.x, this.waypointZ - player.pos.z) > ROAM_MAX || playerDist > ROAM_MAX + 3) {
          this.pickWaypoint(player, forest);
        }
        goalX = this.waypointX;
        goalZ = this.waypointZ;
        maxSpeed = playerDist > ROAM_MAX ? RUN : this.gait;
        easeIn = this.gait === TROT || this.poi !== null;
        this.checkArrival(player, forest);
        this.checkStuck(dt, player, forest);
        break;
      }
      case 'sniff':
      case 'inspect':
      case 'drink':
        stay = true;
        this.waitT -= dt;
        // The player is walking off: stop and catch up.
        if (this.waitT <= 0 || playerDist > ROAM_MAX - 3) {
          this.enter('explore');
          this.pickWaypoint(player, forest);
        }
        break;
      case 'come':
        if (this.stateT < this.callDelay) {
          stay = true;
        } else {
          goalX = player.pos.x;
          goalZ = player.pos.z;
          maxSpeed = RUN + 0.6;
          easeIn = false;
          if (playerDist < 2.4) {
            this.enter('heel');
            this.heelT = rand(10, 18);
          }
        }
        break;
      case 'keepup':
        this.computeTarget(player, tmpTarget);
        goalX = tmpTarget.x;
        goalZ = tmpTarget.z;
        maxSpeed = RUN + 0.4;
        this.keepUpT = player.running ? 0 : this.keepUpT + dt;
        if (this.keepUpT > 2.5) {
          this.enter('heel');
          this.heelT = rand(4, 8);
        }
        break;
      case 'heel':
      case 'alert': {
        this.computeTarget(player, tmpTarget);
        goalX = tmpTarget.x;
        goalZ = tmpTarget.z;
        maxSpeed = 6.5;
        if (this.state === 'alert') {
          // A threatened dog holds its ground, but never lets the player get far away.
          stay = !(this.fromThreat && Math.hypot(goalX - this.pos.x, goalZ - this.pos.z) > 5);
        } else {
          this.heelT -= dt;
          if (this.heelT <= 0) {
            this.enter('explore');
            this.pickWaypoint(player, forest);
          }
        }
        break;
      }
    }

    this.move(dt, goalX, goalZ, maxSpeed, easeIn, stay, player, forest, toPlayerX, toPlayerZ, playerDist);
    this.updatePose();
  }

  private move(
    dt: number,
    goalX: number,
    goalZ: number,
    maxSpeed: number,
    easeIn: boolean,
    stay: boolean,
    player: Player,
    forest: Forest,
    toPlayerX: number,
    toPlayerZ: number,
    playerDist: number,
  ): void {
    const dx = goalX - this.pos.x;
    const dz = goalZ - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const goalHeading = Math.atan2(dx, dz);

    let desired = 0;
    if (!stay && dist > 0.2) {
      const follows = this.state === 'heel' || this.state === 'alert' || this.state === 'keepup';
      desired = easeIn || follows ? Math.min(dist * 2.4, maxSpeed) : maxSpeed;
      // Turn before setting off: a dog pivots toward where it is going, it doesn't slide sideways.
      desired *= 0.15 + 0.85 * Math.max(0, Math.cos(Math.min(Math.abs(angleDiff(goalHeading, this.heading)), Math.PI / 2)));
    }
    const rate = desired > this.speed ? (this.state === 'come' ? 7 : 4) : 7;
    this.speed += (desired - this.speed) * Math.min(1, dt * rate);

    if (this.speed > 0.01 && dist > 1e-4) {
      this.pos.x += (dx / dist) * this.speed * dt;
      this.pos.z += (dz / dist) * this.speed * dt;
    }
    if (playerDist > 30) {
      this.computeTarget(player, tmpTarget);
      this.pos.copy(tmpTarget);
    }

    forest.collide(this.pos, 0.35);
    const px = this.pos.x - player.pos.x;
    const pz = this.pos.z - player.pos.z;
    const pd = Math.hypot(px, pz);
    if (pd < 0.9 && pd > 1e-4) {
      this.pos.x = player.pos.x + (px / pd) * 0.9;
      this.pos.z = player.pos.z + (pz / pd) * 0.9;
    }

    let targetHeading: number;
    let turnRate: number;
    if (this.state === 'alert' && stay) {
      targetHeading = this.lookHeading;
      turnRate = 4;
    } else if (this.state === 'come' && stay) {
      targetHeading = Math.atan2(toPlayerX, toPlayerZ);
      turnRate = 9;
    } else if ((this.state === 'inspect' || this.state === 'drink') && this.poi) {
      targetHeading = Math.atan2(this.poi.x - this.pos.x, this.poi.z - this.pos.z);
      turnRate = 5;
    } else if (this.state === 'sniff') {
      targetHeading = this.heading;
      turnRate = 0;
    } else if (this.speed > 0.4 || (!stay && dist > 0.6)) {
      targetHeading = goalHeading;
      // Pivot quickly when slow, take wider turns at a run.
      turnRate = this.speed > 5 ? 4.5 : 8;
    } else {
      targetHeading = player.yaw + Math.PI;
      turnRate = 2;
    }
    this.heading += angleDiff(targetHeading, this.heading) * Math.min(1, dt * turnRate);
  }

  /** Smoothed player velocity, so the dog can aim where the player is going rather than where they are. */
  private trackPlayer(dt: number, player: Player): void {
    if (dt > 0) {
      const k = Math.min(1, dt * 3);
      this.pvx += ((player.pos.x - this.lastPX) / dt - this.pvx) * k;
      this.pvz += ((player.pos.z - this.lastPZ) / dt - this.pvz) * k;
    }
    this.lastPX = player.pos.x;
    this.lastPZ = player.pos.z;
  }

  private updateAlert(dt: number, player: Player): void {
    if (this.threatHeading !== null) {
      if (this.state !== 'alert') this.enter('alert');
      this.fromThreat = true;
      this.lookHeading = this.threatHeading;
    } else if (this.fromThreat) {
      this.fromThreat = false;
      this.enter('heel');
      this.heelT = rand(12, 20);
      this.nextAlert = rand(20, 40);
    } else if (this.state === 'alert') {
      if (this.stateT > 6) {
        this.enter('explore');
        this.pickWaypoint(player);
        this.nextAlert = rand(28, 58);
        this.onAlertEnd?.();
      }
    } else if (this.state !== 'come' && this.state !== 'keepup') {
      this.nextAlert -= dt;
      if (this.nextAlert <= 0) {
        this.enter('alert');
        const side = Math.random() < 0.5 ? -1 : 1;
        this.lookHeading = player.yaw + Math.PI + side * rand(0.9, 1.8);
        this.onAlertStart?.(this.lookHeading);
      }
    }
  }

  /** If the player is running and the dog is near and looking their way, it takes off after them. Otherwise it doesn't notice. */
  private noticeRunning(dt: number, player: Player, toX: number, toZ: number, dist: number): void {
    const busy = this.state === 'explore' || this.state === 'sniff' || this.state === 'inspect' || this.state === 'drink' || this.state === 'heel';
    if (!busy || !player.running || dist > NOTICE_DIST) return;
    const looking = Math.abs(angleDiff(Math.atan2(toX, toZ), this.heading)) < NOTICE_ANGLE;
    if (looking || this.state === 'heel') {
      this.enter('keepup');
      this.keepUpT = 0;
    }
  }

  private checkArrival(player: Player, forest: Forest): void {
    const near = Math.hypot(this.waypointX - this.pos.x, this.waypointZ - this.pos.z) < (this.poi ? 0.5 : 1.1);
    if (!near) return;
    if (this.poi) {
      this.lastPoi = { x: this.poi.x, z: this.poi.z };
      if (this.poi.kind === 'tree') {
        this.enter('inspect');
        this.waitT = rand(2.5, 5.5);
      } else {
        this.enter('drink');
        this.waitT = rand(2.5, 5);
      }
    } else if (Math.random() < 0.45) {
      this.enter('sniff');
      this.waitT = rand(1.2, 4);
    } else {
      this.pickWaypoint(player, forest);
    }
  }

  /** Wedged against a trunk or rock: choose again. */
  private checkStuck(dt: number, player: Player, forest: Forest): void {
    this.stuckT += dt;
    if (this.stuckT < 1) return;
    if (Math.hypot(this.pos.x - this.stuckX, this.pos.z - this.stuckZ) < 0.3) this.pickWaypoint(player, forest);
    this.stuckT = 0;
    this.stuckX = this.pos.x;
    this.stuckZ = this.pos.z;
  }

  /** Something new to do: usually somewhere around the player, sometimes a tree to sniff or a puddle to drink from. */
  private pickWaypoint(player: Player, forest?: Forest): void {
    this.poi = null;
    if (forest && Math.random() < 0.45 && this.pickInterest(player, forest)) return;

    // Walking: favour ahead and the sides, since anything directly behind is left further behind every second.
    const moving = Math.hypot(this.pvx, this.pvz) > 0.8;
    const a = player.yaw + (Math.random() * 2 - 1) * Math.PI * (moving ? 0.7 : 1);
    const d = rand(4, 11);
    this.waypointX = player.pos.x + this.pvx * 3.5 - Math.sin(a) * d;
    this.waypointZ = player.pos.z + this.pvz * 3.5 - Math.cos(a) * d;
    this.gait = Math.random() < 0.4 ? RUN : TROT;
  }

  private pickInterest(player: Player, forest: Forest): boolean {
    const found = forest.pointsOfInterest(player.pos.x + this.pvx * 2, player.pos.z + this.pvz * 2, ROAM_MAX - 2);
    const options = found.filter(
      (p) => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 2.5 && !(this.lastPoi && Math.hypot(p.x - this.lastPoi.x, p.z - this.lastPoi.z) < 0.5),
    );
    if (options.length === 0) return false;
    // Puddles are rarer than trees but worth a visit when there is one.
    const puddles = options.filter((p) => p.kind === 'puddle');
    const p = puddles.length > 0 && Math.random() < 0.3 ? puddles[Math.floor(Math.random() * puddles.length)] : options[Math.floor(Math.random() * options.length)];

    // Stand on the side it is coming from: just off the trunk, or at the water's edge.
    let ax = this.pos.x - p.x;
    let az = this.pos.z - p.z;
    const len = Math.hypot(ax, az) || 1;
    ax /= len;
    az /= len;
    const off = p.r + (p.kind === 'tree' ? 0.55 : 0.3);
    this.waypointX = p.x + ax * off;
    this.waypointZ = p.z + az * off;
    this.gait = TROT;
    this.poi = { kind: p.kind, x: p.x, z: p.z };
    return true;
  }

  private computeTarget(player: Player, out: THREE.Vector3): void {
    const a = player.yaw - this.followAngle;
    out.set(player.pos.x - Math.sin(a) * this.followDist, 0, player.pos.z - Math.cos(a) * this.followDist);
  }

  private enter(state: DogState): void {
    this.state = state;
    this.stateT = 0;
  }

  private updatePose(): void {
    const p = this.pose;
    const s = this.state;
    p.speed = this.speed;
    p.alert = s === 'alert';
    p.sniffGround = s === 'sniff';
    p.sniffTree = s === 'inspect';
    p.drink = s === 'drink';
    p.perk = s === 'come' && this.speed < 1;
    p.happy = s === 'come' || s === 'heel' || s === 'keepup';
  }
}
