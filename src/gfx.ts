import * as THREE from 'three';

export const TAU = Math.PI * 2;

export function paint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

export function newCanvas(width: number, height = width): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, ctx: canvas.getContext('2d')! };
}

export interface TextureOptions {
  /** The pixels are colours (not data like normals or gloss). */
  srgb?: boolean;
  anisotropy?: number;
  /** Repeat when tiled. */
  wrap?: boolean;
}

export function canvasTexture(canvas: HTMLCanvasElement, { srgb = false, anisotropy, wrap = false }: TextureOptions = {}): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (anisotropy) tex.anisotropy = anisotropy;
  return tex;
}

const blockMaterials = new Map<string, THREE.MeshLambertMaterial>();

/** Flat-shaded block material. `glow` is how much of its own colour it gives off, so it never goes fully black. */
export function blockMaterial(hex: number, glow = 0.12): THREE.MeshLambertMaterial {
  const key = `${hex}:${glow}`;
  let m = blockMaterials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, flatShading: true, emissive: new THREE.Color(hex).multiplyScalar(glow) });
    blockMaterials.set(key, m);
  }
  return m;
}

export function box(w: number, h: number, d: number, hex: number, x = 0, y = 0, z = 0, glow = 0.12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMaterial(hex, glow));
  m.position.set(x, y, z);
  return m;
}
