import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from './rng';

const TAU = Math.PI * 2;

export const AUTUMN_LEAVES = [0x8a4a22, 0x7a3a1c, 0x8a6a2c, 0x6a4624, 0x5a2a16, 0x4a3c1c];
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

export const AUTUMN_PALETTE = {
  burntOrange: 0xcc5500,
  rust: 0x9c3b1b,
  golden: 0xe8a14a,
  goldenBrown: 0x996515,
  coffee: 0x6f4e37,
  olive: 0x6b6b2e,
  walnut: 0x4a3b2a,
  straw: 0xd2b48c,
} as const;

export const GRASS_COLORS = [
  AUTUMN_PALETTE.straw,
  AUTUMN_PALETTE.golden,
  AUTUMN_PALETTE.goldenBrown,
  AUTUMN_PALETTE.olive,
  AUTUMN_PALETTE.coffee,
  AUTUMN_PALETTE.goldenBrown,
].map((hex) => new THREE.Color(hex).lerp(new THREE.Color(AUTUMN_PALETTE.walnut), 0.35).multiplyScalar(0.55).getHex());

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
  const up = new Float32Array(pos.length);
  for (let i = 1; i < up.length; i += 3) up[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(up, 3));
  return g;
}

/** Shared clock for the grass sway; the forest advances it every frame. */
export const grassTime = { value: 0 };

function makeGrassTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, W, H);

  for (let x = 0; x < W; x++) {
    const n = hash2(x, 0, 410);
    ctx.fillStyle = `rgba(${n < 0.5 ? '0,0,0' : '255,255,255'},${(0.04 + 0.16 * hash2(x, 1, 410)).toFixed(3)})`;
    ctx.fillRect(x, 0, 1 + Math.floor(hash2(x, 2, 410) * 2), H);
  }
  const edge = ctx.createLinearGradient(0, 0, W, 0);
  edge.addColorStop(0, 'rgba(0,0,0,0.35)');
  edge.addColorStop(0.28, 'rgba(0,0,0,0)');
  edge.addColorStop(0.72, 'rgba(0,0,0,0)');
  edge.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(W / 2 - 4, 0, 2, H);
  ctx.fillRect(W / 2 + 2, 0, 2, H);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(W / 2 - 1, 0, 2, H);
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

export function buildPuddle(): THREE.BufferGeometry {
  // The painted puddle fills about 0.7 of the quad, so oversize it to keep puddles the size they were.
  const g = new THREE.PlaneGeometry(2.5, 2.5);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.014, 0);
  return g;
}

const PUDDLE_PX = 256;

function puddleBlob(ctx: CanvasRenderingContext2D, scale: number): void {
  const c = PUDDLE_PX / 2;
  ctx.beginPath();
  for (let i = 0; i <= 72; i++) {
    const a = (i / 72) * TAU;
    const r =
      0.68 +
      0.06 * Math.sin(2 * a + 0.7) +
      0.05 * Math.sin(3 * a + 2.1) +
      0.035 * Math.sin(5 * a + 4.2) +
      0.02 * Math.sin(7 * a + 1.3);
    const x = c + Math.cos(a) * r * c * scale;
    const y = c + Math.sin(a) * r * c * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function makePuddleTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PUDDLE_PX;
  const ctx = canvas.getContext('2d')!;
  const c = PUDDLE_PX / 2;

  ctx.fillStyle = 'rgba(30,22,15,0.07)';
  for (let i = 0; i < 6; i++) {
    puddleBlob(ctx, 1.12 - i * 0.02);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(26,19,13,0.6)';
  puddleBlob(ctx, 1);
  ctx.fill();

  ctx.fillStyle = 'rgba(5,9,13,0.07)';
  for (let i = 0; i < 5; i++) {
    puddleBlob(ctx, 0.9 - i * 0.02);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(5,9,13,0.9)';
  puddleBlob(ctx, 0.82);
  ctx.fill();

  ctx.save();
  puddleBlob(ctx, 0.82);
  ctx.clip();
  const sheen = ctx.createRadialGradient(c * 0.8, c * 0.75, 4, c, c, c * 0.8);
  sheen.addColorStop(0, 'rgba(70,92,116,0.3)');
  sheen.addColorStop(1, 'rgba(70,92,116,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, PUDDLE_PX, PUDDLE_PX);

  for (let i = 0; i < 9; i++) {
    const a = hash2(i, 0, 530) * TAU;
    const d = Math.sqrt(hash2(i, 1, 530)) * c * 0.55;
    ctx.fillStyle = `rgba(${hash2(i, 2, 530) < 0.5 ? '96,58,28' : '58,40,22'},${(0.55 + 0.4 * hash2(i, 3, 530)).toFixed(2)})`;
    ctx.beginPath();
    ctx.ellipse(c + Math.cos(a) * d, c + Math.sin(a) * d, 2 + hash2(i, 4, 530) * 5, 1.2 + hash2(i, 5, 530) * 2.4, hash2(i, 6, 530) * Math.PI, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePuddleGloss(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PUDDLE_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, PUDDLE_PX, PUDDLE_PX);
  ctx.fillStyle = 'rgb(48,48,48)';
  puddleBlob(ctx, 1);
  ctx.fill();
  ctx.fillStyle = 'rgb(120,120,120)';
  puddleBlob(ctx, 0.9);
  ctx.fill();
  ctx.fillStyle = '#fff';
  puddleBlob(ctx, 0.82);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function makeWaterNormal(): THREE.CanvasTexture {
  const N = 128;
  const TILE = 16;
  const noise = (x: number, y: number, period: number, salt: number) => {
    const gx = (x / N) * period;
    const gy = (y / N) * period;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const v = (i: number, j: number) => hash2(((i % period) + period) % period, ((j % period) + period) % period, salt);
    return v(x0, y0) * (1 - sx) * (1 - sy) + v(x0 + 1, y0) * sx * (1 - sy) + v(x0, y0 + 1) * (1 - sx) * sy + v(x0 + 1, y0 + 1) * sx * sy;
  };
  const height = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      height[y * N + x] = noise(x, y, TILE / 2, 540) * 0.6 + noise(x, y, TILE, 541) * 0.3 + noise(x, y, TILE * 2, 542) * 0.1;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const at = (x: number, y: number) => height[((y + N) % N) * N + ((x + N) % N)];
  const strength = 6;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const ny = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

let puddleNormal: THREE.CanvasTexture | null = null;

export function tickPuddles(time: number): void {
  if (puddleNormal) puddleNormal.offset.set(time * 0.012, time * 0.008);
}

export function makePuddleMaterial(): THREE.MeshPhongMaterial {
  puddleNormal = makeWaterNormal();
  return new THREE.MeshPhongMaterial({
    map: makePuddleTexture(),
    specularMap: makePuddleGloss(),
    normalMap: puddleNormal,
    normalScale: new THREE.Vector2(0.3, 0.3),
    specular: 0xaabbcc,
    shininess: 140,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

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

export function makeBarkMaterial(): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL + 'bark/';
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(base + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
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

export const GROUND_TILE = 3;

export interface GroundMaterial {
  material: THREE.MeshLambertMaterial;
  maps: THREE.Texture[];
}

const GROUND_PX = 512;

function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = GROUND_PX;
  const ctx = canvas.getContext('2d')!;
  const P = AUTUMN_PALETTE;
  const rnd = (i: number, salt: number) => hash2(i, salt, 560);
  const css = (hex: number, k: number) => {
    const c = new THREE.Color(hex).lerp(new THREE.Color(P.walnut), 0.62);
    const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255 * k)));
    return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
  };
  /** Run `draw` at every wrapped offset the shape touches, so it tiles. */
  const wrapped = (x: number, y: number, r: number, draw: (x: number, y: number) => void) => {
    for (const ox of [-GROUND_PX, 0, GROUND_PX]) {
      for (const oy of [-GROUND_PX, 0, GROUND_PX]) {
        const wx = x + ox;
        const wy = y + oy;
        if (wx + r < 0 || wx - r > GROUND_PX || wy + r < 0 || wy - r > GROUND_PX) continue;
        draw(wx, wy);
      }
    }
  };

  ctx.fillStyle = css(P.walnut, 0.7);
  ctx.fillRect(0, 0, GROUND_PX, GROUND_PX);
  for (let i = 0; i < 40; i++) {
    const x = rnd(i, 1) * GROUND_PX;
    const y = rnd(i, 2) * GROUND_PX;
    const r = 40 + rnd(i, 3) * 70;
    const dark = rnd(i, 4) < 0.6;
    wrapped(x, y, r, (wx, wy) => {
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      grad.addColorStop(0, dark ? 'rgba(10,6,4,0.35)' : 'rgba(120,96,68,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(wx - r, wy - r, r * 2, r * 2);
    });
  }

  const mix: [number, number][] = [
    [P.burntOrange, 1.0],
    [P.rust, 1.0],
    [P.golden, 0.95],
    [P.goldenBrown, 1.1],
    [P.coffee, 1.25],
    [P.olive, 1.05],
    [P.straw, 0.8],
  ];
  const weights = [4, 6, 8, 30, 30, 12, 10];
  const total = weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 950; i++) {
    let pick = rnd(i, 10) * total;
    let k = 0;
    while (pick > weights[k]) pick -= weights[k++];
    const [hex, dim] = mix[k];
    const len = 14 + rnd(i, 11) * 16;
    const wid = len * (0.32 + 0.16 * rnd(i, 12));
    const ang = rnd(i, 13) * TAU;
    const x = rnd(i, 14) * GROUND_PX;
    const y = rnd(i, 15) * GROUND_PX;
    const fill = css(hex, dim * (0.7 + 0.6 * rnd(i, 16)));
    wrapped(x, y, len, (wx, wy) => {
      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(ang);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.quadraticCurveTo(0, -wid, len / 2, 0);
      ctx.quadraticCurveTo(0, wid, -len / 2, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,4,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, 0);
      ctx.stroke();
      ctx.restore();
    });
  }

  ctx.lineCap = 'round';
  for (let i = 0; i < 18; i++) {
    const len = 24 + rnd(i, 20) * 40;
    const ang = rnd(i, 21) * TAU;
    const x = rnd(i, 22) * GROUND_PX;
    const y = rnd(i, 23) * GROUND_PX;
    ctx.strokeStyle = `rgba(30,20,12,${(0.5 + 0.3 * rnd(i, 24)).toFixed(2)})`;
    ctx.lineWidth = 1.5 + rnd(i, 25) * 1.5;
    wrapped(x, y, len, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(ang) * len, wy + Math.sin(ang) * len);
      ctx.stroke();
    });
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeGroundMaterial(planeSize: number): GroundMaterial {
  const map = makeGroundTexture();
  map.repeat.set(planeSize / GROUND_TILE, planeSize / GROUND_TILE);
  const material = new THREE.MeshLambertMaterial({ map });

  material.onBeforeCompile = (shader) => {
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
        `vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec3 second = texture2D( map, mat2(0.8, 0.6, -0.6, 0.8) * vMapUv * 0.37 + 0.31 ).rgb;
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, second, 0.3);
        float mud = smoothstep(0.6, 0.78, gNoise(vGroundXZ * 0.07) * 0.65 + gNoise(vGroundXZ * 0.19) * 0.35);
        vec3 mudCol = sampledDiffuseColor.rgb * vec3(0.3, 0.26, 0.22) + vec3(0.006, 0.004, 0.003);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, mudCol, mud);
        sampledDiffuseColor.rgb *= 0.78 + 0.45 * gNoise(vGroundXZ * 0.23);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };

  return { material, maps: [map] };
}
