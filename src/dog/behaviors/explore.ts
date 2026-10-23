import { DOG } from '../tuning';
import { rand } from '../../util';
import { Behavior, type Frame } from './behavior';

/** Wandering around the player, or heading for a tree or puddle that caught her eye. */
export class Explore extends Behavior {
  readonly busy = true;
  readonly greets = true;

  update({ dt, player, forest, playerDist }: Frame): void {
    const dog = this.dog;
    const s = dog.steer;
    const w = dog.wander;
    const roam = dog.roamMax;
    if (w.isTooFar(player, roam) || playerDist > roam + 3) dog.pickWaypoint(player, forest);
    s.goalX = w.x;
    s.goalZ = w.z;
    s.maxSpeed = playerDist > roam ? DOG.run : w.gait;
    s.ease = w.gait === DOG.trot || w.target !== null;
    if (w.hasArrived(dog.pos)) this.arrive(player, forest);
    if (w.isStuck(dt, dog.pos)) dog.pickWaypoint(player, forest);
  }

  /** She got where she was going: investigate it, or sniff the ground, or move on. */
  private arrive(player: Frame['player'], forest: Frame['forest']): void {
    const dog = this.dog;
    const w = dog.wander;
    const target = w.target;
    if (!target) {
      if (dog.pull.chance(DOG.sniffChance)) dog.linger('sniff', rand(DOG.sniffGround[0], DOG.sniffGround[1]));
      else dog.pickNext(player, forest);
      return;
    }
    w.markVisited();
    if (target.kind === 'puddle') {
      dog.linger('drink', rand(DOG.drink[0], DOG.drink[1]));
      return;
    }
    const hooked = dog.pull.pending;
    const seconds = hooked ? rand(DOG.hookFor[0], DOG.hookFor[1]) : rand(DOG.sniffTree[0], DOG.sniffTree[1]) * dog.pull.lingerFactor();
    dog.linger('inspect', seconds);
    if (hooked) dog.pull.hook();
  }
}
