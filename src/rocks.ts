import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { simplify, simplifierReady } from './simplify';
import { shrinkTexture } from './texsize';

export interface RockVariant {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  gain: number;
}

const MODELS: { id: string; gain: number }[] = [
  { id: 'rock_07', gain: 2.4 },
  { id: 'rock_09', gain: 2.4 },
  { id: 'rock_moss_set_01', gain: 1 },
];

/**
 * Triangles each rock is reduced to. The scans have 5k to 16k, and the normal map already holds the fine detail;
 * dozens are on screen at once, so this is the biggest single saving on the frame.
 */
const ROCK_TRIANGLES = 1500;

/**
 * Loads the scanned rocks and bakes each mesh into a standalone geometry: centred on x/z, sitting
 * just under y = 0, and scaled so its widest horizontal side is 1 unit. That lets the forest scatter
 * them with the same instancing code as everything else.
 */
export async function loadRocks(): Promise<RockVariant[]> {
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;
  const [loaded] = await Promise.all([Promise.all(MODELS.map(({ id }) => loader.loadAsync(`${base}rocks/${id}/${id}.gltf`))), simplifierReady]);

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
      geo.translate(0, -0.04, 0);
      simplify(geo, ROCK_TRIANGLES);
      geo.computeBoundingSphere();

      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.side = THREE.FrontSide;
      // The packed roughness/metal map is a full-size texture for a surface that is uniformly rough stone.
      mat.roughness = 0.7;
      mat.roughnessMap = null;
      mat.metalnessMap = null;
      mat.metalness = 0;
      for (const tex of [mat.map, mat.normalMap]) {
        if (!tex) continue;
        tex.anisotropy = 8;
        shrinkTexture(tex);
      }
      out.push({ geo, mat, gain });
    });
  }
  return out;
}
