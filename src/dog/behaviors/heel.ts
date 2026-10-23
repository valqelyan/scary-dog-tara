import { DOG } from '../tuning';
import type { DogPose } from '../model';
import { Behavior, type Frame } from './behavior';

/** Beside the player, for a while, before she wanders off again. */
export class Heel extends Behavior {
  readonly busy: boolean = true;
  readonly greets: boolean = true;
  readonly following = true;
  /** Seconds left at heel. */
  timeLeft = 0;

  update({ dt, player, forest }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    dog.followTarget(player, dog.scratch);
    s.goalX = dog.scratch.x;
    s.goalZ = dog.scratch.z;
    s.maxSpeed = DOG.heelSpeed;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      dog.pickNext(player, forest);
    }
  }

  pose(p: DogPose): void {
    p.happy = true;
  }
}
