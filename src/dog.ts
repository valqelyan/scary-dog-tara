import * as THREE from 'three';
import type { Forest } from './forest';
import type { Player } from './player';
import { DogBrain } from './dogbrain';
import { DogModel } from './dogmodel';

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
