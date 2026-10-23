import { DOG } from '../tuning';
import type { DogPose } from '../model';
import { Behavior, type Frame } from './behavior';

/** Stopped, looking back at the player, waiting for them to catch up. If they come close she play-bows and bolts. */
export class Wait extends Behavior {
  readonly busy = true;
  readonly greets = true;
  readonly watching = true;
  timeLeft = 0;

  update({ dt, player, forest, playerDist }: Frame): void {
    const dog = this.dog;
    dog.steer.stay = true;
    this.timeLeft -= dt;
    if (dog.stateTime > 1 && playerDist < DOG.dash.inviteDist && dog.play.chance(DOG.play.bow)) {
      dog.bow('dash');
    } else if (this.timeLeft <= 0) {
      dog.pickNext(player, forest);
    }
  }

  face({ toX, toZ }: Frame): { toward: number; rate: number } | null {
    return { toward: Math.atan2(toX, toZ), rate: 4 };
  }

  pose(p: DogPose): void {
    p.perk = true;
    p.happy = true;
  }
}
