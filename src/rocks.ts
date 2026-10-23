import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface RockVariant {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  /** Brightness multiplier, to even out how dark each scan's albedo is. */
  gain: number;
}

/** Photo-scanned rocks (Poly Haven, CC0) in public/rocks. The moss set holds six separate rocks. */
const MODELS: { id: string; gain: number }[] = [
  { id: 'rock_07', gain: 2.4 },
  { id: 'rock_09', gain: 2.4 },
  { id: 'rock_moss_set_01', gain: 1 },
];

/**
 * Loads the scanned rocks and bakes each mesh into a standalone geometry: centred on x/z, sitting
 * just under y = 0, and scaled so its widest horizontal side is 1 unit. That lets the forest scatter
 * them with the same instancing code as everything else.
 */
export async function loadRocks(): Promise<RockVariant[]> {
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;
  const loaded = await Promise.all(MODELS.map(({ id }) => loader.loadAsync(`${base}rocks/${id}/${id}.gltf`)));

  const out: RockVariant[] = [];
  const size = new THREE.Vector3();
  for (const [i, gltf] of loaded.entries()) {
    const { gain } = MODELS[i];
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;

      const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      bb.getSize(size);
      const k = 1 / Math.max(size.x, size.z);
      geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
      geo.scale(k, k, k);
      // Sink it a little so it sits in the mud rather than on top of it.
      geo.translate(0, -0.04, 0);
      geo.computeBoundingSphere();

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.side = THREE.FrontSide;
      // Rained on: glossier than the dry scan, so the flashlight glints off it.
      mat.roughness = 0.7;
      for (const tex of [mat.map, mat.normalMap, mat.roughnessMap]) if (tex) tex.anisotropy = 8;
      out.push({ geo, mat, gain });
    });
  }
  return out;
}
