import type * as THREE from 'three';
import type { DogPose } from './model';

/** Something that draws the dog and moves its body to match a pose. The blocky dog and the pointer both are one. */
export interface DogBody {
  readonly group: THREE.Group;
  /** Called on each footfall. */
  onStep?: () => void;
  update(dt: number, pose: DogPose): void;
}
