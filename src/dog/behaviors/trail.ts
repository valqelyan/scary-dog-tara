import { rand } from '../../util';
import type { DogPose } from '../model';
import { DOG } from '../tuning';
import { Behavior, type Frame } from './behavior';

/** Following a scent: walking slowly in a zigzag with her nose down. */
export class Trail extends Behavior {
  readonly busy = true;
  readonly greets = true;
  private dirX = 0;
  private dirZ = 1;
  private timeLeft = 0;
  private clock = 0;

  begin(): void {
    // Roughly the way she is already facing, drifting toward the player's side of the forest.
    const a = this.dog.heading + (Math.random() - 0.5) * 1.2;
    this.dirX = Math.sin(a);
    this.dirZ = Math.cos(a);
    this.timeLeft = rand(DOG.trail.duration[0], DOG.trail.duration[1]);
    this.clock = Math.random() * 6;
  }

  update({ dt, player, forest, playerDist }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    this.clock += dt;
    const sway = Math.sin(this.clock * 2.6) * 1.1;
    s.goalX = dog.pos.x + this.dirX * 2 - this.dirZ * sway;
    s.goalZ = dog.pos.z + this.dirZ * 2 + this.dirX * sway;
    s.maxSpeed = DOG.trail.speed;
    s.ease = false;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0 || playerDist > dog.roamMax) dog.pickNext(player, forest);
  }

  pose(p: DogPose): void {
    p.sniffGround = true;
  }
}
