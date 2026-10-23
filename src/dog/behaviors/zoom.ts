import type { Player } from '../../player';
import { rand } from '../../util';
import type { DogPose } from '../model';
import { DOG } from '../tuning';
import { Behavior, type Frame } from './behavior';

/** Zoomies: tearing a lap or two around the player, just for the joy of it. */
export class Zoom extends Behavior {
  readonly alarmable = false;
  private radius = 5;
  private angle = 0;
  private direction = 1;
  private timeLeft = 0;

  begin(player: Player): void {
    const dog = this.dog;
    this.radius = rand(DOG.zoom.radius[0], DOG.zoom.radius[1]);
    // Start from where she already is, around the player.
    this.angle = Math.atan2(dog.pos.x - player.pos.x, dog.pos.z - player.pos.z);
    this.direction = Math.random() < 0.5 ? -1 : 1;
    this.timeLeft = rand(DOG.zoom.duration[0], DOG.zoom.duration[1]);
  }

  update({ dt, player, forest }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    // Chase a point that runs round the circle just ahead of her.
    this.angle += this.direction * (DOG.zoom.speed / this.radius) * dt;
    const lead = this.angle + this.direction * 0.6;
    s.goalX = player.pos.x + Math.sin(lead) * this.radius;
    s.goalZ = player.pos.z + Math.cos(lead) * this.radius;
    s.maxSpeed = DOG.zoom.speed;
    s.ease = false;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) dog.pickNext(player, forest);
  }

  pose(p: DogPose): void {
    p.happy = true;
  }
}
