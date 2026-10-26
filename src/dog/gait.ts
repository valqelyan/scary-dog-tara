/** Which leg: front or hind, and which side of the body (+1 is her left, -1 is her right). */
export interface LegSpec {
  front: boolean;
  side: 1 | -1;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The farthest a foot travels back while planted, in metres. Her legs are short, so a longer stance would mean crouching to the ground. */
export const MAX_STANCE_TRAVEL = 0.5;

/** Where one foot should be relative to its resting spot, in the dog's own space: forward, up, and whether it is on the ground. */
export interface FootTarget {
  forward: number;
  up: number;
  planted: boolean;
}

/**
 * A four-legged gait that shifts from walk to trot to gallop with speed. It only does the maths: how fast the legs cycle,
 * how long each stride is, and where each foot should be at each moment. Feet on the ground move backward at exactly the
 * body's speed, so they never slide.
 */
export class Gait {
  /** Position in the cycle, 0 to 1. */
  phase = 0;

  /** How much of a walk and how much of a gallop she is doing at this speed, 0 to 1 each (a trot is neither). */
  blend(v: number): { walk: number; gallop: number } {
    return { walk: this.walk(v), gallop: this.gallop(v) };
  }

  /** Walk, trot and gallop blend smoothly with speed. */
  private walk(v: number): number {
    return 1 - smooth(1.6, 2.4, v);
  }

  private gallop(v: number): number {
    return smooth(4.2, 5.4, v);
  }

  /** Cycles per second. A bigger stride, not just quicker legs, is what makes a faster gait. */
  frequency(v: number): number {
    return v <= 3.2 ? 0.9 + 0.42 * v : 2.24 + 0.2 * (v - 3.2);
  }

  /** The share of the cycle a foot spends on the ground: less as she goes faster, until there is a moment of flight. */
  duty(v: number): number {
    const base = mix(0.45, 0.65, this.walk(v));
    return Math.min(base, (MAX_STANCE_TRAVEL * this.frequency(v)) / Math.max(v, 0.01));
  }

  /** How far the body moves while one foot is on the ground, in metres. Feet travel back this far during stance. */
  stanceTravel(v: number): number {
    return (v / this.frequency(v)) * this.duty(v);
  }

  /** Walks in a lateral sequence, trots in diagonal pairs, and gallops with the hind feet landing together-ish, then the front. */
  offset(leg: LegSpec, v: number): number {
    const left = leg.side > 0;
    const walk = leg.front ? (left ? 0 : 0.5) : left ? 0.75 : 0.25;
    const trot = leg.front ? (left ? 0 : 0.5) : left ? 0.5 : 0;
    const gallop = leg.front ? (left ? 0.5 : 0.42) : left ? 0.08 : 0;
    const w = this.walk(v);
    return mix(mix(trot, walk, w), gallop, this.gallop(v));
  }

  update(dt: number, v: number): void {
    this.phase = (this.phase + this.frequency(v) * dt) % 1;
  }

  /** Where a foot is right now, as an offset from standing still. `liftHeight` is how high it comes off the ground in swing. */
  foot(leg: LegSpec, v: number, liftHeight: number, out: FootTarget): FootTarget {
    // Barely moving: stay put, rather than shuffling in tiny steps.
    const amount = smooth(0.08, 0.6, v);
    const travel = this.stanceTravel(v) * amount;
    const duty = this.duty(v);
    const p = (((this.phase + this.offset(leg, v)) % 1) + 1) % 1;
    if (p < duty) {
      // On the ground: slides from in front of the rest spot to behind it, at the body's speed.
      out.forward = travel * (0.5 - p / duty);
      out.up = 0;
      out.planted = true;
    } else {
      // In the air: swings back to the front, lifting and setting down.
      const u = (p - duty) / (1 - duty);
      const ease = u * u * (3 - 2 * u);
      out.forward = travel * (-0.5 + ease);
      out.up = liftHeight * amount * Math.pow(Math.sin(Math.PI * u), 0.75);
      out.planted = false;
    }
    return out;
  }
}
