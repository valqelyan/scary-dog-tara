import { angleDiff } from '../util';
import { DOG } from './tuning';

/** Spots the moment the player and the dog look straight at each other. */
export class EyeContact {
  private held = 0;
  private cooldown = 0;

  reset(): void {
    this.held = 0;
    this.cooldown = DOG.eyeContact.cooldown;
  }

  /**
   * @param bearingToDog   world yaw from the player to the dog
   * @param playerYaw      which way the player is looking (camera yaw)
   * @param dogHeading     which way the dog is facing
   * @param dist           metres between them
   * @returns true the moment eye contact is made
   */
  update(dt: number, eligible: boolean, bearingToDog: number, playerYaw: number, dogHeading: number, dist: number): boolean {
    const c = DOG.eyeContact;
    this.cooldown -= dt;
    // The player's forward is (-sin yaw, -cos yaw), which is a bearing of yaw + PI.
    const playerLooksAtDog = Math.abs(angleDiff(bearingToDog, playerYaw + Math.PI)) < c.lookAngle;
    // The dog faces the player when its heading points back along that line.
    const dogLooksAtPlayer = Math.abs(angleDiff(bearingToDog + Math.PI, dogHeading)) < c.faceAngle;
    const mutual = eligible && playerLooksAtDog && dogLooksAtPlayer && dist > c.minDist && dist < c.maxDist;
    this.held = mutual ? this.held + dt : 0;
    if (this.held < c.hold || this.cooldown > 0) return false;
    this.held = 0;
    this.cooldown = c.cooldown;
    return true;
  }
}
