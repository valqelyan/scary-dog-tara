import type { Player } from '../player';
import { approach } from '../util';

/** Follows the player's velocity (smoothed), so the dog can aim where they are going rather than where they are. */
export class PlayerTracker {
  vx = 0;
  vz = 0;
  private lastX = 0;
  private lastZ = 0;

  reset(player: Player): void {
    this.lastX = player.pos.x;
    this.lastZ = player.pos.z;
    this.vx = this.vz = 0;
  }

  update(dt: number, player: Player): void {
    if (dt > 0) {
      this.vx = approach(this.vx, (player.pos.x - this.lastX) / dt, 3, dt);
      this.vz = approach(this.vz, (player.pos.z - this.lastZ) / dt, 3, dt);
    }
    this.lastX = player.pos.x;
    this.lastZ = player.pos.z;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }
}
