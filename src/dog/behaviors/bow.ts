import { DOG } from '../tuning';
import type { DogPose } from '../model';
import { Behavior, type Frame } from './behavior';

/** A play bow: front end down, rear up, tail going. It means "come on". */
export class Bow extends Behavior {
  readonly alarmable = false;
  readonly watching = true;
  /** What she does next: stay by the player, or bolt off to invite a chase. */
  after: 'heel' | 'dash' = 'heel';

  update({ player }: Frame): void {
    const dog = this.dog;
    dog.steer.stay = true;
    if (dog.stateTime < DOG.bow.duration) return;
    if (this.after === 'dash') dog.dash(player);
    else dog.heel(dog.heelFor(DOG.heelAfterCall));
  }

  face({ toX, toZ }: Frame): { toward: number; rate: number } | null {
    return { toward: Math.atan2(toX, toZ), rate: 6 };
  }

  pose(p: DogPose): void {
    p.bow = true;
    p.happy = true;
  }
}
