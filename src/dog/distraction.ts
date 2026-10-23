import type * as THREE from 'three';
import { DOG } from './tuning';
import type { Forest, Poi } from '../forest';

/**
 * How easily the dog is drawn off: it scales the odds of every little detour, and it decides when a tree
 * she passes while walking with the player gets its hooks in, so she has to be whistled back.
 */
export class Distraction {
  /** 0 to 1; 0.5 is the baseline. */
  level = 0.5;
  /** Absorbed in a tree: she stays until whistled, or until the player is very far away. */
  hooked = false;
  /** On her way to a tree that will hook her. */
  pending = false;

  private cooldown = 20;
  private checkT = 0;
  private lastTree: { x: number; z: number } | null = null;

  /** 0 to 2: the multiplier applied to each baseline chance. */
  private get scale(): number {
    return Math.min(2, this.level * 2);
  }

  /** Roll a baseline chance, scaled by how distractible she is. */
  chance(base: number): boolean {
    return Math.random() < Math.min(0.95, base * this.scale);
  }

  /** Scale a lingering time by distraction: half as long at 0, the baseline at 0.5, one and a half times at 1. */
  lingerFactor(): number {
    return 0.5 + this.level;
  }

  reset(): void {
    this.release();
    this.cooldown = 20;
  }

  /** Back to normal: a whistle, a new job, anything that breaks the spell. */
  release(): void {
    this.hooked = false;
    this.pending = false;
  }

  /** She reached the tree she was drawn to. */
  hook(): void {
    this.pending = false;
    this.hooked = true;
  }

  /** While walking with the player, now and then a tree she passes catches her interest. Returns it, or null. */
  check(dt: number, pos: THREE.Vector3, forest: Forest, walkingWithPlayer: boolean): Poi | null {
    this.cooldown -= dt;
    this.checkT -= dt;
    if (this.checkT > 0 || this.cooldown > 0 || this.level <= 0) return null;
    this.checkT = 0.25;
    if (!walkingWithPlayer) return null;

    const last = this.lastTree;
    const tree = forest.pointsOfInterest(pos.x, pos.z, 3).find((p) => p.kind === 'tree' && !(last && Math.hypot(p.x - last.x, p.z - last.z) < 0.5));
    if (!tree) return null;
    // Each tree gets one roll as she passes it.
    this.lastTree = { x: tree.x, z: tree.z };
    if (!this.chance(DOG.hookChance)) return null;
    this.cooldown = 40 - 30 * this.level;
    return tree;
  }
}
