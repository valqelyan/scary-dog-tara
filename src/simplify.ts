import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Resolves when the simplifier's WebAssembly is ready; await it before calling `simplify`. */
export const simplifierReady = MeshoptSimplifier.ready;

/**
 * Drops triangles from an indexed mesh while keeping its silhouette, normals and UV seams (so the textures don't smear).
 * It stops at `triangles` or when removing more would move the surface by `maxError` (a fraction of the mesh's size), whichever comes first.
 */
export function simplify(geo: THREE.BufferGeometry, triangles: number, maxError = 0.1): void {
  const index = geo.index;
  if (!index || index.count / 3 <= triangles) return;
  const position = geo.attributes.position;
  const normal = geo.attributes.normal;
  const uv = geo.attributes.uv;
  const positions = new Float32Array(position.count * 3);
  const attributes = new Float32Array(position.count * 5);
  for (let i = 0; i < position.count; i++) {
    positions.set([position.getX(i), position.getY(i), position.getZ(i)], i * 3);
    attributes.set([normal.getX(i), normal.getY(i), normal.getZ(i), uv.getX(i), uv.getY(i)], i * 5);
  }
  const [simplified] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(index.array),
    positions,
    3,
    attributes,
    5,
    [0.5, 0.5, 0.5, 1, 1],
    null,
    triangles * 3,
    maxError,
  );
  geo.setIndex(new THREE.BufferAttribute(simplified, 1));
}
