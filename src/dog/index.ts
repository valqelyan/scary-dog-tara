import * as THREE from 'three';
import type { Forest } from '../forest';
import type { Player } from '../player';
import { DogBrain } from './brain';
import { DogModel } from './model';

/** The dog: a brain that decides what to do, and a model that shows it. This is what the rest of the game talks to. */
export class Dog {
  readonly group = new THREE.Group();
  readonly pos = this.group.position;

  onAlertStart?: (heading: number) => void;
  onAlertEnd?: () => void;
  onStep?: () => void;

  private brain = new DogBrain(this.pos);
  private model = new DogModel();

  constructor() {
    this.group.add(this.model.group);
    this.brain.onAlertStart = (heading) => this.onAlertStart?.(heading);
    this.brain.onAlertEnd = () => this.onAlertEnd?.();
    this.model.onStep = () => this.onStep?.();
  }

  get followAngle(): number {
    return this.brain.followAngle;
  }

  set followAngle(angle: number) {
    this.brain.followAngle = angle;
  }

  get alarms(): boolean {
    return this.brain.alarms;
  }

  set alarms(on: boolean) {
    this.brain.alarms = on;
  }

  get playfulness(): number {
    return this.brain.playfulness;
  }

  set playfulness(level: number) {
    this.brain.playfulness = Math.min(1, Math.max(0, level));
  }

  get distraction(): number {
    return this.brain.distraction;
  }

  set distraction(level: number) {
    this.brain.distraction = Math.min(1, Math.max(0, level));
  }

  get threatHeading(): number | null {
    return this.brain.threatHeading;
  }

  set threatHeading(heading: number | null) {
    this.brain.threatHeading = heading;
  }

  reset(player: Player): void {
    this.brain.reset(player);
    this.group.rotation.y = this.brain.heading;
  }

  /** The player whistled. */
  call(): void {
    this.brain.call();
  }

  update(dt: number, player: Player, forest: Forest): void {
    this.brain.update(dt, player, forest);
    this.group.rotation.y = this.brain.heading;
    this.model.update(dt, this.brain.pose);
  }
}
