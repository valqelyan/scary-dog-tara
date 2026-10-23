import type { Forest } from '../../forest';
import type { Player } from '../../player';
import type { DogBrain } from '../brain';
import type { DogPose } from '../model';
import { DOG } from '../tuning';

/** What the world looks like to the dog this frame. */
export interface Frame {
  dt: number;
  player: Player;
  forest: Forest;
  /** From the dog to the player. */
  toX: number;
  toZ: number;
  playerDist: number;
}

/**
 * One thing the dog can be doing. Each frame it says where she wants to go (by filling in `dog.steer`),
 * which way to face, and how her body should look. The brain does the walking.
 */
export abstract class Behavior {
  /** Can notice the player running, and take off after them. */
  readonly busy: boolean = false;
  /** Can recognise eye contact with the player and run to them. */
  readonly greets: boolean = false;
  /** Her head follows the player while she does this. */
  readonly watching: boolean = false;
  /** Can be interrupted by a false alarm. */
  readonly alarmable: boolean = true;
  /** Always eases in toward its goal, instead of arriving at full speed. */
  readonly following: boolean = false;
  /** How quickly her speed builds. */
  readonly accel: number = DOG.speedUp;

  constructor(protected readonly dog: DogBrain) {}

  /** Fill in `dog.steer` for this frame. */
  abstract update(f: Frame): void;

  /** Where to face and how fast to turn, or null to face where she is going. */
  face(_f: Frame): { toward: number; rate: number } | null {
    return null;
  }

  /** Switch on the body flags that go with this behavior. */
  pose(_p: DogPose): void {}
}
