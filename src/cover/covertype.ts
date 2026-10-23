import type * as THREE from 'three';

/**
 * A kind of ground cover the forest scatters as instances: its mesh, its look, and how many fit in a cell.
 * Subclasses fill in the shape and material; the forest only ever deals with this interface.
 */
export abstract class CoverType {
  /** The most instances one forest cell can hold. */
  abstract readonly perCell: number;
  /** Whether each instance takes its own tint colour. */
  abstract readonly tinted: boolean;

  abstract geometry(): THREE.BufferGeometry;
  abstract material(): THREE.Material;

  /** Called every frame with the clock in seconds, for anything that moves (sway, shimmer). */
  tick(_time: number): void {}
}
