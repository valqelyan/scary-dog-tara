import { DOG } from '../tuning';
import type { DogPose } from '../model';
import { Behavior, type Frame } from './behavior';

/** Running along with the player. */
export class KeepUp extends Behavior {
  readonly alarmable = false;
  readonly following = true;
  /** Seconds since the player stopped running. */
  idleFor = 0;

  update({ dt, player }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    dog.followTarget(player, dog.scratch);
    s.goalX = dog.scratch.x;
    s.goalZ = dog.scratch.z;
    s.maxSpeed = DOG.keepUpSpeed;
    this.idleFor = player.running ? 0 : this.idleFor + dt;
    if (this.idleFor > DOG.keepUpLinger) dog.heel(dog.heelFor(DOG.heelAfterRun));
  }

  pose(p: DogPose): void {
    p.happy = true;
  }
}
