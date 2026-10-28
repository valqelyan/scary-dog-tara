import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { simplify, simplifierReady } from './simplify';

export interface PlantVariant {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

const pixels = (img: HTMLImageElement) => {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
};

/** The model ships its colour and its cutout as separate images; fold them into one RGBA texture (raw data, so no premultiplied-alpha fringes). */
async function loadCutout(name: string): Promise<THREE.DataTexture> {
  const base = `${import.meta.env.BASE_URL}plants/${name}/textures/${name}`;
  const [diff, cut] = await Promise.all([loadImage(`${base}_diff_1k.jpg`), loadImage(`${base}_alpha_1k.jpg`)]);
  const color = pixels(diff);
  const alpha = pixels(cut);
  const d = color.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = alpha.data[i];
    if (a < 128) {
      // Outside the cutout the photo is black; use leaf green so mipmaps don't darken the edges.
      d[i] = 105;
      d[i + 1] = 125;
      d[i + 2] = 65;
    }
    d[i + 3] = a;
  }
  const tex = new THREE.DataTexture(d, color.width, color.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export interface PlantSpec {
  /** Poly Haven asset id: the files are in public/plants/<name>/. */
  name: string;
  /** Multiplies the model, which is tens of centimetres across; roots end up at y = 0. */
  scale: [number, number, number];
  /** Triangles each variant is reduced to; they are scattered by the thousand. */
  triangles: number;
  /** How far simplifying may move the surface, as a fraction of its size. Thin blades need it tight or they vanish. */
  maxError: number;
}

/**
 * Loads a scanned Poly Haven plant (CC0) and bakes each of its variants into a standalone geometry, centred
 * on x/z with its roots at y = 0, so the forest can scatter it like everything else.
 */
export async function loadPlants({ name, scale, triangles, maxError }: PlantSpec): Promise<PlantVariant[]> {
  const base = `${import.meta.env.BASE_URL}plants/${name}/`;
  const [gltf, map] = await Promise.all([new GLTFLoader().loadAsync(`${base}${name}.gltf`), loadCutout(name), simplifierReady]);

  const out: PlantVariant[] = [];
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    simplify(geo, triangles, maxError);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.scale(...scale);
    geo.computeBoundingSphere();

    const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
    mat.map = map;
    // Matte: the packed roughness map makes the leaves shiny under the sun, which washes them out pale.
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.roughness = 1;
    mat.metalness = 0;
    mat.color.setScalar(0.75);
    mat.alphaTest = 0.5;
    mat.transparent = false;
    mat.depthWrite = true;
    mat.side = THREE.DoubleSide;
    out.push({ geo, mat });
  });
  return out;
}
