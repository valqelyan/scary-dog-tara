import { DOG } from '../tuning';
import type { DogPose } from '../model';
import { Behavior, type Frame } from './behavior';

export type LingerKind = 'sniff' | 'inspect' | 'drink';

/** Standing still to sniff the ground, sniff a tree, or drink from a puddle. */
export class Linger extends Behavior {
  readonly busy = true;
  readonly greets = true;
  /** Seconds left. */
  timeLeft = 0;

  constructor(
    dog: Behavior['dog'],
    readonly kind: LingerKind,
  ) {
    super(dog);
  }

  update({ dt, player, forest, playerDist }: Frame): void {
    const dog = this.dog;
    dog.steer.stay = true;
    this.timeLeft -= dt;
    // The player is walking off: stop and catch up. A dog absorbed in a tree ignores that until they are far away.
    const gone = dog.pull.hooked ? playerDist > DOG.hookReleaseDist : playerDist > dog.roamMax - 3;
    if (this.timeLeft <= 0 || gone) {
      dog.pickNext(player, forest);
    }
  }

  face(): { toward: number; rate: number } | null {
    const dog = this.dog;
    const target = dog.wander.target;
    if (this.kind === 'sniff') return { toward: dog.heading, rate: 0 };
    if (target) return { toward: Math.atan2(target.x - dog.pos.x, target.z - dog.pos.z), rate: 5 };
    return null;
  }

  pose(p: DogPose): void {
    if (this.kind === 'sniff') p.sniffGround = true;
    else if (this.kind === 'inspect') p.sniffTree = true;
    else p.drink = true;
  }
}
