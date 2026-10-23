import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from './rng';

const TAU = Math.PI * 2;

/** Dull, dirty autumn colours: burnt orange, rust, ochre, brown. Multiplied into the leaf texture. */
export const AUTUMN_LEAVES = [0x8a4a22, 0x7a3a1c, 0x8a6a2c, 0x6a4624, 0x5a2a16, 0x4a3c1c];
/** Fallen leaves on the ground; same idea, a little browner as they rot. */
export const LITTER_COLORS = [0x7a4220, 0x5a2c14, 0x806a2a, 0x40281a, 0x6a2a16, 0x34261a, 0x504420];
/** Faded flowers: nothing bright survives here. */
export const FLOWER_COLORS = [0x7a6a8f, 0x9a8a3a, 0xa8a49a, 0x8a4a3a, 0x6a7a9a];

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

export function buildRock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.55, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.85 + 0.3 * hash2(Math.round(p.getX(i) * 100), Math.round(p.getZ(i) * 100), 7);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.translate(0, 0.15, 0);
  return paint(g, 0x1b1e20);
}

/** Dull, dead autumn grass: straw, olive, rust. Multiplied into the grey blade gradient. */
export const GRASS_COLORS = [0x5a4f26, 0x4a4a24, 0x65532a, 0x3c4222, 0x5a4024, 0x4a3c20];

/**
 * A tuft of tall, bent grass: a dozen tapered blades, each three segments long so it curves over.
 * Vertex colours are a grey gradient (dark root, pale tip); the per-instance tint adds the hue.
 */
export function buildGrass(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const blades = 11;
  const rows = 4;
  for (let i = 0; i < blades; i++) {
    const a = hash2(i, 0, 300) * TAU;
    const r = hash2(i, 1, 300) * 0.16;
    const h = 0.38 + hash2(i, 2, 300) * 0.5;
    const bend = 0.05 + hash2(i, 3, 300) * 0.22;
    const w = 0.03 + hash2(i, 4, 300) * 0.025;
    const face = hash2(i, 5, 300) * Math.PI;
    const dirX = Math.cos(a);
    const dirZ = Math.sin(a);
    const px = Math.cos(face);
    const pz = Math.sin(face);
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;

    // One ring per row; the last ring is the single tip vertex.
    const ring: [number, number, number, number, number, number, number, number][] = [];
    for (let k = 0; k < rows; k++) {
      const t = k / (rows - 1);
      const y = h * t;
      const off = bend * t * t;
      const cx = bx + dirX * off;
      const cz = bz + dirZ * off;
      const hw = k === rows - 1 ? 0 : w * (1 - t * 0.75);
      const shade = 0.22 + 0.78 * t;
      ring.push([cx - px * hw, y, cz - pz * hw, cx + px * hw, y, cz + pz * hw, shade, t]);
    }
    // u runs across the blade (left 0, right 1, the tip is a point at 0.5), v from root to tip.
    const v = (x: number, y: number, z: number, shade: number, u: number, t: number) => {
      pos.push(x, y, z);
      col.push(shade, shade, shade);
      uv.push(u, t);
    };
    for (let k = 0; k < rows - 1; k++) {
      const lo = ring[k];
      const hi = ring[k + 1];
      const hiL = k + 1 === rows - 1 ? 0.5 : 0;
      const hiR = k + 1 === rows - 1 ? 0.5 : 1;
      v(lo[0], lo[1], lo[2], lo[6], 0, lo[7]);
      v(lo[3], lo[4], lo[5], lo[6], 1, lo[7]);
      v(hi[3], hi[4], hi[5], hi[6], hiR, hi[7]);
      if (k < rows - 2) {
        v(lo[0], lo[1], lo[2], lo[6], 0, lo[7]);
        v(hi[3], hi[4], hi[5], hi[6], hiR, hi[7]);
        v(hi[0], hi[1], hi[2], hi[6], hiL, hi[7]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Light every blade as if it faced up, so both sides catch the flashlight the same way.
  const up = new Float32Array(pos.length);
  for (let i = 1; i < up.length; i += 3) up[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(up, 3));
  return g;
}

/** Shared clock for the grass sway; the forest advances it every frame. */
export const grassTime = { value: 0 };

/**
 * A plain blade texture drawn on a canvas: pale centre vein, fine lengthwise streaks, darker edges.
 * It averages a bit under white so it multiplies into the tint without dimming the grass much.
 */
function makeGrassTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, W, H);

  // Fine veins running root to tip.
  for (let x = 0; x < W; x++) {
    const n = hash2(x, 0, 410);
    ctx.fillStyle = `rgba(${n < 0.5 ? '0,0,0' : '255,255,255'},${(0.04 + 0.16 * hash2(x, 1, 410)).toFixed(3)})`;
    ctx.fillRect(x, 0, 1 + Math.floor(hash2(x, 2, 410) * 2), H);
  }
  // Slightly darker towards both edges.
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.35)');
  edge.addColorStop(0.28, 'rgba(0,0,0,0)');
  edge.addColorStop(0.72, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  // The midrib: a pale line down the middle with a darker groove either side.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(W / 2 - 4, 0, 2, H);
  ctx.fillRect(W / 2 + 2, 0, 2, H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(W / 2 - 1, 0, 2, H);
  // A few short cross-flecks so it isn't perfectly striped.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(0,0,0,${(0.05 + 0.1 * hash2(i, 3, 410)).toFixed(3)})`;
    ctx.fillRect(hash2(i, 4, 410) * W, hash2(i, 5, 410) * H, 1, 3 + hash2(i, 6, 410) * 8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeGrassMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: makeGrassTexture(), vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = grassTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // Blades bend more towards the tip, and each tuft sways on its own phase.
        float bendAmt = position.y * position.y;
        vec3 ip = instanceMatrix[3].xyz;
        transformed.x += sin(uTime * 1.7 + ip.x * 0.65 + ip.z * 0.41) * bendAmt * 0.16;
        transformed.z += cos(uTime * 1.3 + ip.z * 0.57 + ip.x * 0.23) * bendAmt * 0.11;`,
      );
    // Blades are two-sided but already lit as if facing up; don't flip the normal on the back face.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
    );
  };
  return mat;
}

/** A single flat fallen leaf. Tinted per-instance. */
export function buildLeaf(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0.02, -0.11, 0.07, 0.025, 0, 0, 0.02, 0.11, -0.07, 0.025, 0], 3),
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

/** A flat disc of standing water, slightly above the ground. */
export function buildPuddle(): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(1, 12);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.014, 0);
  return g;
}

/** A 128x128 canvas split into four 64x64 cells, for the small hand-painted atlases below. */
const ATLAS = 128;
const CELL_PX = 64;

type Cell = readonly [x: number, y: number];

function newAtlas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  return { canvas, ctx: canvas.getContext('2d')! };
}

function atlasTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Squeeze a geometry's 0..1 UVs into one atlas cell, a little inset so mipmaps don't bleed neighbours in. */
function toCell(g: THREE.BufferGeometry, [cx, cy]: Cell): THREE.BufferGeometry {
  const uv = g.attributes.uv;
  const pad = 2;
  const size = (CELL_PX - pad * 2) / ATLAS;
  const u0 = (cx + pad) / ATLAS;
  const v0 = 1 - (cy + CELL_PX - pad) / ATLAS;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * size, v0 + uv.getY(i) * size);
  return g;
}

/** Top-down UVs for a dome or disc of the given radius: the centre of the texture sits on the axis. */
function planarUV(g: THREE.BufferGeometry, radius: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * radius), 0.5 + p.getZ(i) / (2 * radius));
  return g;
}

/** Same attributes on every part, so they merge: non-indexed, white vertex colour. */
function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return paint(g.index ? g.toNonIndexed() : g, 0xffffff);
}

const MUSHROOM_STEM: Cell = [0, 0];
const MUSHROOM_CAP: Cell = [64, 0];
const MUSHROOM_GILLS: Cell = [0, 64];

function makeMushroomTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = newAtlas();
  const rnd = (i: number, salt: number) => hash2(i, salt, 510);
  const c = CELL_PX / 2;

  // Stem: pale and fibrous, going to dirt at the root (the bottom of the cell).
  {
    const [x0, y0] = MUSHROOM_STEM;
    ctx.fillStyle = '#cdc4ae';
    ctx.fillRect(x0, y0, CELL_PX, CELL_PX);
    for (let i = 0; i < 36; i++) {
      ctx.fillStyle = `rgba(${rnd(i, 1) < 0.5 ? '70,58,44' : '255,250,235'},${(0.08 + 0.2 * rnd(i, 2)).toFixed(2)})`;
      ctx.fillRect(x0 + rnd(i, 3) * CELL_PX, y0, 1 + rnd(i, 4) * 2, CELL_PX);
    }
    const dirt = ctx.createLinearGradient(0, y0 + CELL_PX, 0, y0 + CELL_PX * 0.55);
    dirt.addColorStop(0, 'rgba(48,34,22,0.85)');
    dirt.addColorStop(1, 'rgba(48,34,22,0)');
    ctx.fillStyle = dirt;
    ctx.fillRect(x0, y0, CELL_PX, CELL_PX);
  }

  // Cap seen from above: dark leathery brown, paler towards the rim, with fine radial fibres and a few veil flecks.
  {
    const [x0, y0] = MUSHROOM_CAP;
    const g = ctx.createRadialGradient(x0 + c, y0 + c, 2, x0 + c, y0 + c, c);
    g.addColorStop(0, '#3e2416');
    g.addColorStop(0.7, '#6a4630');
    g.addColorStop(1, '#8a6a4c');
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, CELL_PX, CELL_PX);
    for (let i = 0; i < 70; i++) {
      const a = rnd(i, 5) * TAU;
      const r0 = 3 + rnd(i, 6) * c * 0.5;
      ctx.strokeStyle = `rgba(${rnd(i, 7) < 0.5 ? '30,16,8' : '190,160,120'},${(0.1 + 0.2 * rnd(i, 8)).toFixed(2)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + c + Math.cos(a) * r0, y0 + c + Math.sin(a) * r0);
      ctx.lineTo(x0 + c + Math.cos(a) * c, y0 + c + Math.sin(a) * c);
      ctx.stroke();
    }
    for (let i = 0; i < 14; i++) {
      const a = rnd(i, 9) * TAU;
      const r = Math.sqrt(rnd(i, 10)) * c * 0.8;
      ctx.fillStyle = `rgba(214,200,172,${(0.45 + 0.4 * rnd(i, 11)).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x0 + c + Math.cos(a) * r, y0 + c + Math.sin(a) * r, 1 + rnd(i, 12) * 2, 0, TAU);
      ctx.fill();
    }
  }

  // Underside: pale radial gills round a darker stem scar.
  {
    const [x0, y0] = MUSHROOM_GILLS;
    ctx.fillStyle = '#a89878';
    ctx.fillRect(x0, y0, CELL_PX, CELL_PX);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * TAU;
      ctx.strokeStyle = i % 2 ? 'rgba(70,52,36,0.7)' : 'rgba(220,206,176,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + c + Math.cos(a) * 5, y0 + c + Math.sin(a) * 5);
      ctx.lineTo(x0 + c + Math.cos(a) * c, y0 + c + Math.sin(a) * c);
      ctx.stroke();
    }
    ctx.fillStyle = '#4a3a2a';
    ctx.beginPath();
    ctx.arc(x0 + c, y0 + c, 5, 0, TAU);
    ctx.fill();
  }

  return atlasTexture(canvas);
}

export function makeMushroomMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: makeMushroomTexture(), vertexColors: true, side: THREE.DoubleSide });
}

/** A small cluster of mushrooms: textured stems, domed caps, and gills underneath. */
export function buildMushrooms(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const spots: [number, number, number][] = [
    [0, 0, 1],
    [0.1, 0.05, 0.7],
    [-0.06, 0.09, 0.85],
  ];
  for (const [x, z, s] of spots) {
    const stemH = 0.09 * s;
    const stem = new THREE.CylinderGeometry(0.018 * s, 0.026 * s, stemH, 7, 1);
    stem.translate(x, stemH / 2, z);
    parts.push(plain(toCell(stem, MUSHROOM_STEM)));

    const R = 0.07 * s;
    const cap = new THREE.SphereGeometry(R, 9, 3, 0, TAU, 0, Math.PI / 2);
    cap.scale(1, 0.6, 1);
    planarUV(cap, R);
    toCell(cap, MUSHROOM_CAP);
    cap.translate(x, stemH - 0.004, z);
    parts.push(plain(cap));

    const gills = new THREE.CircleGeometry(R * 0.97, 9);
    gills.rotateX(Math.PI / 2);
    planarUV(gills, R * 0.97);
    toCell(gills, MUSHROOM_GILLS);
    gills.translate(x, stemH - 0.004, z);
    parts.push(plain(gills));
  }
  return mergeGeometries(parts, false)!;
}

const FLOWER_PETALS: Cell = [0, 0];
const FLOWER_LEAF: Cell = [64, 0];
const FLOWER_STEM: Cell = [0, 64];

function makeFlowerTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = newAtlas();
  const rnd = (i: number, salt: number) => hash2(i, salt, 520);
  const c = CELL_PX / 2;

  // Petals: near-white so the per-flower tint colours them. Transparent between petals (alpha-tested).
  {
    const [x0, y0] = FLOWER_PETALS;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rnd(i, 1) - 0.5) * 0.15;
      const len = 24 + rnd(i, 2) * 6;
      ctx.save();
      ctx.translate(x0 + c, y0 + c);
      ctx.rotate(a);
      ctx.fillStyle = `rgb(${215 + Math.floor(rnd(i, 3) * 40)},${215 + Math.floor(rnd(i, 3) * 40)},${215 + Math.floor(rnd(i, 3) * 40)})`;
      ctx.beginPath();
      ctx.ellipse(len / 2 + 5, 0, len / 2, 4.2, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,120,120,0.55)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(len + 3, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#4a3c1c';
    ctx.beginPath();
    ctx.arc(x0 + c, y0 + c, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(x0 + c + 1.5, y0 + c + 1.5, 3.5, 0, TAU);
    ctx.fill();
  }

  // Leaf: lanceolate, pointing up the cell, with a pale midrib.
  {
    const [x0, y0] = FLOWER_LEAF;
    ctx.fillStyle = '#2a3a1e';
    ctx.beginPath();
    ctx.moveTo(x0 + c, y0 + CELL_PX - 1);
    ctx.quadraticCurveTo(x0 + c + 20, y0 + CELL_PX * 0.55, x0 + c, y0 + 1);
    ctx.quadraticCurveTo(x0 + c - 20, y0 + CELL_PX * 0.55, x0 + c, y0 + CELL_PX - 1);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,160,100,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + c, y0 + CELL_PX - 2);
    ctx.lineTo(x0 + c, y0 + 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10,20,6,0.4)';
    for (let i = 0; i < 6; i++) {
      const y = y0 + 12 + i * 8;
      ctx.beginPath();
      ctx.moveTo(x0 + c, y + 4);
      ctx.lineTo(x0 + c - 9 + i, y);
      ctx.moveTo(x0 + c, y + 4);
      ctx.lineTo(x0 + c + 9 - i, y);
      ctx.stroke();
    }
  }

  // Stem: dark green with fibres, fully opaque.
  {
    const [x0, y0] = FLOWER_STEM;
    ctx.fillStyle = '#243219';
    ctx.fillRect(x0, y0, CELL_PX, CELL_PX);
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(${rnd(i, 4) < 0.5 ? '10,18,6' : '110,130,80'},${(0.1 + 0.2 * rnd(i, 5)).toFixed(2)})`;
      ctx.fillRect(x0 + rnd(i, 6) * CELL_PX, y0, 1 + rnd(i, 7) * 2, CELL_PX);
    }
  }

  return atlasTexture(canvas);
}

export function makeFlowerMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: makeFlowerTexture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
}

/** A wilted flower: textured stem, two basal leaves, and a drooping petal head that takes the instance tint. */
export function buildFlower(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.006, 0.009, 0.3, 4, 1, true);
  stem.translate(0, 0.15, 0);
  parts.push(plain(toCell(stem, FLOWER_STEM)));

  for (const [lean, turn] of [[0.8, 0.4], [-0.7, 2.4]] as const) {
    const leaf = new THREE.PlaneGeometry(0.05, 0.13);
    leaf.translate(0, 0.065, 0);
    leaf.rotateZ(lean);
    leaf.rotateY(turn);
    leaf.translate(0, 0.02, 0);
    parts.push(plain(toCell(leaf, FLOWER_LEAF)));
  }

  const head = new THREE.PlaneGeometry(0.11, 0.11);
  head.rotateX(-Math.PI / 2 + 0.5);
  head.translate(0.05, 0.28, 0);
  parts.push(plain(toCell(head, FLOWER_PETALS)));
  return mergeGeometries(parts, false)!;
}

/** A rotting fallen log. UVs run around the trunk (u) and along it (v), ready for a bark texture. */
export function buildLog(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.17, 0.21, 3.2, 10);
  body.rotateZ(Math.PI / 2);
  body.translate(0, 0.18, 0);
  const stub = new THREE.CylinderGeometry(0.03, 0.055, 0.55, 5);
  stub.rotateZ(Math.PI / 2 - 0.9);
  stub.rotateY(0.6);
  stub.translate(0.5, 0.42, 0.12);
  return mergeGeometries([body, stub], false)!;
}

/** Wet, dark bark for the fallen logs (ez-tree's oak bark, MIT). Tinted down so it stays gloomy. */
export function makeBarkMaterial(): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL + 'bark/';
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(base + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    // About one wrap around the trunk and a few along its length.
    t.repeat.set(1, 3);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load('log_diff.jpg', true),
    normalMap: load('log_nor.jpg', false),
    roughnessMap: load('log_rough.jpg', false),
    color: 0x45362b,
    roughness: 0.9,
    metalness: 0,
  });
}

/** World size of one ground texture tile, in metres. */
export const GROUND_TILE = 2.5;

export interface GroundMaterial {
  material: THREE.MeshStandardMaterial;
  /** Textures that must be re-offset as the ground plane follows the player. */
  maps: THREE.Texture[];
}

/**
 * Wet autumn forest floor from photo-scanned textures (Poly Haven, CC0): leaf litter, blended with
 * a muddier, glossier texture over large noisy patches, and dimmed/brightened slowly so the tiling
 * doesn't read.
 */
export function makeGroundMaterial(planeSize: number): GroundMaterial {
  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL + 'ground/';
  const repeat = planeSize / GROUND_TILE;
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(base + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const map = load('leaves_diff.jpg', true);
  const normalMap = load('leaves_nor_gl.jpg', false);
  const roughnessMap = load('leaves_rough.jpg', false);
  const aoMap = load('leaves_ao.jpg', false);

  const mudMap = loader.load(base + 'mud_diff.jpg');
  mudMap.wrapS = mudMap.wrapT = THREE.RepeatWrapping;
  mudMap.colorSpace = THREE.SRGBColorSpace;
  mudMap.anisotropy = 8;
  const mudRough = loader.load(base + 'mud_rough.jpg');
  mudRough.wrapS = mudRough.wrapT = THREE.RepeatWrapping;
  mudRough.anisotropy = 8;

  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughnessMap,
    aoMap,
    color: 0x6a5c52,
    roughness: 1,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.mudMap = { value: mudMap };
    shader.uniforms.mudRough = { value: mudRough };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D mudMap;
        uniform sampler2D mudRough;
        varying vec2 vGroundXZ;
        float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x),
                     mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `float mud = smoothstep(0.5, 0.7, gNoise(vGroundXZ * 0.07) * 0.65 + gNoise(vGroundXZ * 0.19) * 0.35);
        vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec3 mudCol = texture2D( mudMap, vMapUv * 0.8 ).rgb;
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, mudCol * 0.8, mud);
        // Slow brightness drift hides the repeat.
        sampledDiffuseColor.rgb *= 0.7 + 0.6 * gNoise(vGroundXZ * 0.23);
        diffuseColor *= sampledDiffuseColor;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness * texture2D( roughnessMap, vRoughnessMapUv ).g;
        float mudGloss = texture2D( mudRough, vMapUv * 0.8 ).g;
        // Wet ground is glossier, and mud glossiest of all, so the flashlight glints off it.
        roughnessFactor = mix(roughnessFactor * 0.8, mudGloss * 0.55, mud);`,
      );
  };

  return { material, maps: [map, normalMap, roughnessMap, aoMap] };
}
