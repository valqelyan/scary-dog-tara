/** Deterministic hash of an integer cell + salt, returns [0, 1). */
export function hash2(x: number, z: number, salt = 0): number {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(z | 0, 668265263) ^
    Math.imul((salt | 0) + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
