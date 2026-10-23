/** How playful the dog is, 0 to 1. A low level sticks close to its owner; a high one goes off and does its own thing. */
export class Playfulness {
  level = 0.7;

  /** Blend between `low` (level 0) and `high` (level 1). */
  at(range: readonly [number, number]): number {
    return range[0] + (range[1] - range[0]) * this.level;
  }

  chance(range: readonly [number, number]): boolean {
    return Math.random() < this.at(range);
  }
}
