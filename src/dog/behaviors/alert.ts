import { DOG } from '../tuning';
import type { DogPose } from '../model';
import type { Frame } from './behavior';
import { Heel } from './heel';

/** Frozen, staring at something out in the dark. A threatened dog holds her ground, but never lets the player get far away. */
export class Alert extends Heel {
  readonly busy = false;
  readonly greets = false;

  update(_f: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    dog.followTarget(_f.player, dog.scratch);
    s.goalX = dog.scratch.x;
    s.goalZ = dog.scratch.z;
    s.maxSpeed = DOG.heelSpeed;
    s.stay = !(dog.fromThreat && Math.hypot(s.goalX - dog.pos.x, s.goalZ - dog.pos.z) > 5);
  }

  face(): { toward: number; rate: number } | null {
    const dog = this.dog;
    return dog.steer.stay ? { toward: dog.lookHeading, rate: 4 } : null;
  }

  pose(p: DogPose): void {
    p.alert = true;
  }
}
