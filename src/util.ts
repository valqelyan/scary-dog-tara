/** A random number in [min, max). */
export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/** Ease `value` toward `target`, frame-rate independent enough for gameplay smoothing. */
export const approach = (value: number, target: number, rate: number, dt: number): number => value + (target - value) * Math.min(1, dt * rate);

/** Signed shortest turn from `current` to `target`, in radians. */
export function angleDiff(target: number, current: number): number {
  let d = (target - current) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
