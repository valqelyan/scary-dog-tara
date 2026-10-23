import type { Player } from '../../player';
import { rand } from '../../util';
import type { DogPose } from '../model';
import { DOG } from '../tuning';
import { Behavior, type Frame } from './behavior';

/** Running off flat out to somewhere ahead of the player, or off to the left or right, then stopping to see if they follow. */
export class Dash extends Behavior {
  readonly alarmable = false;
  private goalX = 0;
  private goalZ = 0;

  /** Pick a spot: usually ahead, sometimes off to either side. */
  begin(player: Player): void {
    const dog = this.dog;
    const r = Math.random();
    const side = r < 0.5 ? 0 : r < 0.75 ? Math.PI / 2 : -Math.PI / 2;
    const a = player.yaw + side + (Math.random() - 0.5) * 0.5;
    const d = rand(DOG.dash.distance[0], Math.max(DOG.dash.distance[0] + 1, Math.min(DOG.dash.distance[1], dog.roamMax)));
    this.goalX = player.pos.x + dog.motion.vx * 2 - Math.sin(a) * d;
    this.goalZ = player.pos.z + dog.motion.vz * 2 - Math.cos(a) * d;
  }

  update({ playerDist }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    s.goalX = this.goalX;
    s.goalZ = this.goalZ;
    s.maxSpeed = DOG.dash.speed;
    s.ease = false;
    const arrived = Math.hypot(this.goalX - dog.pos.x, this.goalZ - dog.pos.z) < 1.5;
    if (arrived || playerDist > dog.roamMax + 6) dog.wait(rand(DOG.dash.waitFor[0], DOG.dash.waitFor[1]));
  }

  pose(p: DogPose): void {
    p.happy = true;
  }
}
