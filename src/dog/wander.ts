import * as THREE from 'three';
import { DOG } from './tuning';
import type { Forest, Poi } from '../forest';
import type { Player } from '../player';
import type { PlayerTracker } from './tracker';
import { rand } from '../util';

export interface Target {
  kind: 'tree' | 'puddle';
  x: number;
  z: number;
}

/** Where the dog is heading while she explores: somewhere around the player, or a tree or puddle worth a look. */
export class Wander {
  x = 0;
  z = 0;
  gait: number = DOG.trot;
  /** Set when the destination is something to investigate, so she can face it on arrival. */
  target: Target | null = null;

  private lastTarget: Target | null = null;
  private stuckT = 0;
  private stuckX = 0;
  private stuckZ = 0;

  reset(): void {
    this.target = null;
    this.lastTarget = null;
  }

  distanceFrom(pos: THREE.Vector3): number {
    return Math.hypot(this.x - pos.x, this.z - pos.z);
  }

  /** The destination is out of range of the player, who has walked on. */
  isTooFar(player: Player, roam: number): boolean {
    return Math.hypot(this.x - player.pos.x, this.z - player.pos.z) > roam;
  }

  hasArrived(pos: THREE.Vector3): boolean {
    return this.distanceFrom(pos) < (this.target ? DOG.targetArrive : 1.1);
  }

  /** Remember where she has been, so she does not go straight back. */
  markVisited(): void {
    this.lastTarget = this.target;
  }

  /** True about once a second if she has barely moved: wedged against a trunk or rock. */
  isStuck(dt: number, pos: THREE.Vector3): boolean {
    this.stuckT += dt;
    if (this.stuckT < 1) return false;
    const stuck = Math.hypot(pos.x - this.stuckX, pos.z - this.stuckZ) < 0.3;
    this.stuckT = 0;
    this.stuckX = pos.x;
    this.stuckZ = pos.z;
    return stuck;
  }

  /** Somewhere new: usually around the player, sometimes a tree to sniff or a puddle to drink from. */
  pick(pos: THREE.Vector3, player: Player, motion: PlayerTracker, forest: Forest | undefined, detour: boolean, roam: number, runChance: number): void {
    this.target = null;
    if (forest && detour && this.pickTarget(pos, player, motion, forest, roam)) return;

    // Walking: favour ahead and the sides, since anything directly behind is left further behind every second.
    const a = player.yaw + (Math.random() * 2 - 1) * Math.PI * (motion.speed > 0.8 ? 0.7 : 1);
    const d = rand(4, Math.max(5, roam * 0.95));
    this.x = player.pos.x + motion.vx * 3.5 - Math.sin(a) * d;
    this.z = player.pos.z + motion.vz * 3.5 - Math.cos(a) * d;
    this.gait = Math.random() < runChance ? DOG.run : DOG.trot;
  }

  /** Head for a spot just off a trunk, or at the water's edge, on the side she is coming from. */
  goTo(pos: THREE.Vector3, p: Poi): void {
    let ax = pos.x - p.x;
    let az = pos.z - p.z;
    const len = Math.hypot(ax, az) || 1;
    ax /= len;
    az /= len;
    const off = p.r + (p.kind === 'tree' ? DOG.treeStandOff : DOG.puddleStandOff);
    this.x = p.x + ax * off;
    this.z = p.z + az * off;
    this.gait = DOG.trot;
    this.target = { kind: p.kind, x: p.x, z: p.z };
  }

  private pickTarget(pos: THREE.Vector3, player: Player, motion: PlayerTracker, forest: Forest, roam: number): boolean {
    const found = forest.pointsOfInterest(player.pos.x + motion.vx * 2, player.pos.z + motion.vz * 2, roam - 2);
    const last = this.lastTarget;
    const options = found.filter((p) => Math.hypot(p.x - pos.x, p.z - pos.z) > 2.5 && !(last && Math.hypot(p.x - last.x, p.z - last.z) < 0.5));
    if (options.length === 0) return false;
    // Puddles are rarer than trees but worth a visit when there is one.
    const puddles = options.filter((p) => p.kind === 'puddle');
    const list = puddles.length > 0 && Math.random() < 0.3 ? puddles : options;
    this.goTo(pos, list[Math.floor(Math.random() * list.length)]);
    return true;
  }
}
