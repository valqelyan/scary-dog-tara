import { rand } from '../../util';
import type { DogPose } from '../model';
import { DOG } from '../tuning';
import { Behavior, type Frame } from './behavior';

/** Stopping dead to listen to something in the forest: ears up, head sweeping. */
export class Listen extends Behavior {
  readonly busy = true;
  readonly greets = true;
  private timeLeft = 0;

  begin(): void {
    this.timeLeft = rand(DOG.listen.duration[0], DOG.listen.duration[1]);
  }

  update({ dt, player, forest }: Frame): void {
    const dog = this.dog;
    dog.steer.stay = true;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) dog.pickNext(player, forest);
  }

  face(): { toward: number; rate: number } | null {
    return { toward: this.dog.heading, rate: 0 };
  }

  pose(p: DogPose): void {
    p.listen = true;
  }
}
