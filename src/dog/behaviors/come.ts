import { DOG } from '../tuning';
import { rand } from '../../util';
import type { DogPose } from '../model';
import { Behavior, type Frame } from './behavior';

/** Called: she looks up for a moment, then races to the player. */
export class Come extends Behavior {
  readonly alarmable = false;
  readonly accel = DOG.speedUpCalled;
  /** The pause before she sets off, in seconds. */
  delay = 0;

  begin(delay: number = rand(DOG.whistleDelay[0], DOG.whistleDelay[1])): void {
    this.delay = delay;
  }

  update({ player, playerDist }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    if (dog.stateTime < this.delay) {
      s.stay = true;
      return;
    }
    s.goalX = player.pos.x;
    s.goalZ = player.pos.z;
    s.maxSpeed = DOG.comeSpeed;
    s.ease = false;
    if (playerDist < 2.4) {
      if (dog.play.chance(DOG.play.bow)) dog.bow('heel');
      else dog.heel(dog.heelFor(DOG.heelAfterCall));
    }
  }

  face({ toX, toZ }: Frame): { toward: number; rate: number } | null {
    return this.dog.steer.stay ? { toward: Math.atan2(toX, toZ), rate: 9 } : null;
  }

  pose(p: DogPose): void {
    p.perk = this.dog.speed < 1;
    p.happy = true;
  }
}
