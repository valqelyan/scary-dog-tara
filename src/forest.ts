import * as THREE from 'three';
import { hash2 } from './rng';
import { generateTreeVariants, type TreeVariant } from './eztrees';
import type { RockVariant } from './rocks';
import {
  FLOWER_COLORS,
  GRASS_COLORS,
  GROUND_TILE,
  buildFlower,
  buildGrass,
  buildLog,
  buildMushrooms,
  buildPuddle,
  grassTime,
  tickPuddles,
  makeBarkMaterial,
  makeFlowerMaterial,
  makeGrassMaterial,
  makeGroundMaterial,
  makeMushroomMaterial,
  makePuddleMaterial,
} from './groundcover';

type Kind = 'tree' | 'rock' | 'grass' | 'puddle' | 'mushroom' | 'flower' | 'log';

interface Prop {
  kind: Kind;
  /** Index into the generated tree variants, or a random number to pick a rock model (taken modulo). */
  variant: number;
  x: number;
  z: number;
  ry: number;
  sx: number;
  sy: number;
  sz: number;
  shade: number;
  /** Instance tint (hex), 0 = none. Leaves, flowers, and leafy trees use it. */
  tint: number;
  /** Collision radius, 0 = walk-through. */
  r: number;
  /** Trees only: false hides this one's leaves so it stands bare. */
  leafy: boolean;
}

const CELL = 4.5;
/** Cells streamed in every direction around the player. */
const RADIUS = 8;
const START_CLEAR = 4;
const TAU = Math.PI * 2;
const GROUND_SIZE = 180;
const GRASS_PER_CELL = 40;

type CoverKind = Exclude<Kind, 'tree' | 'rock'>;

/** Everything except trees and rocks: geometry, material, and the most one cell can hold. */
const COVER: Record<CoverKind, { geo: () => THREE.BufferGeometry; mat: () => THREE.Material; perCell: number; tinted: boolean }> = {
  grass: { geo: buildGrass, mat: makeGrassMaterial, perCell: GRASS_PER_CELL, tinted: true },
  puddle: { geo: buildPuddle, mat: makePuddleMaterial, perCell: 1, tinted: false },
  mushroom: { geo: buildMushrooms, mat: makeMushroomMaterial, perCell: 1, tinted: false },
  flower: { geo: buildFlower, mat: makeFlowerMaterial, perCell: 3, tinted: true },
  log: { geo: buildLog, mat: makeBarkMaterial, perCell: 1, tinted: false },
};
const COVER_KINDS = Object.keys(COVER) as CoverKind[];

function cellKey(ix: number, iz: number): number {
  return (ix + 32768) * 65536 + (iz + 32768);
}

function pickVariant(variants: TreeVariant[], total: number, r: number): number {
  let acc = r * total;
  for (let i = 0; i < variants.length; i++) {
    acc -= variants[i].weight;
    if (acc <= 0) return i;
  }
  return variants.length - 1;
}

function pick<T>(list: T[], r: number): T {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))];
}

/** Smooth value noise over cell coordinates, [0, 1). Used for patches of grass. */
function patchNoise(ix: number, iz: number, scale: number, salt: number): number {
  const x = ix * scale;
  const z = iz * scale;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, salt);
  const b = hash2(x0 + 1, z0, salt);
  const c = hash2(x0, z0 + 1, salt);
  const d = hash2(x0 + 1, z0 + 1, salt);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

interface RockSpot {
  x: number;
  z: number;
  variant: number;
  ry: number;
  sx: number;
  sy: number;
  shade: number;
}

/** The rocks a cell owns: one large and one small at most. Deterministic, so neighbours can ask too. */
function cellRocks(ix: number, iz: number): RockSpot[] {
  const ox = ix * CELL;
  const oz = iz * CELL;
  const h = (salt: number) => hash2(ix, iz, salt);
  const out: RockSpot[] = [];
  if (h(50) < 0.17) {
    const x = ox + h(51) * CELL;
    const z = oz + h(52) * CELL;
    const s = 0.5 + h(53) * h(57) * 2.2;
    out.push({ x, z, variant: Math.floor(h(58) * 1000), ry: h(54) * TAU, sx: s, sy: s * (0.75 + 0.25 * h(55)), shade: 0.05 + 0.05 * h(56) });
  }
  // Smaller rocks fill in where the bushes used to be.
  if (h(60) < 0.3) {
    const x = ox + h(62) * CELL;
    const z = oz + h(63) * CELL;
    const s = 0.4 + h(61) * 0.9;
    out.push({ x, z, variant: Math.floor(h(67) * 1000), ry: h(64) * TAU, sx: s, sy: s * (0.6 + 0.4 * h(65)), shade: 0.05 + 0.05 * h(66) });
  }
  return out.filter((r) => r.x * r.x + r.z * r.z >= START_CLEAR * START_CLEAR);
}

/** Rock models are scaled so their widest side is 1 unit; grass keeps this much clear beyond that. */
const ROCK_GRASS_MARGIN = 0.2;

interface PuddleSpot {
  x: number;
  z: number;
  ry: number;
  sx: number;
  sz: number;
}

/** The puddle a cell owns, if any. Deterministic, so neighbours can ask too. */
function cellPuddle(ix: number, iz: number): PuddleSpot | null {
  const h = (salt: number) => hash2(ix, iz, salt);
  if (h(200) >= 0.17) return null;
  const r = 0.7 + h(201) * 1.5;
  return { x: ix * CELL + h(202) * CELL, z: iz * CELL + h(203) * CELL, ry: h(204) * TAU, sx: r * (1 + 0.5 * h(205)), sz: r * (0.6 + 0.4 * h(206)) };
}

/** The painted puddle fills a bit more than one unit of its scale; plants keep this much clear beyond it. */
const PUDDLE_REACH = 1.05;
const PUDDLE_MARGIN = 0.25;

function inPuddle(p: PuddleSpot, x: number, z: number): boolean {
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.ry);
  const s = Math.sin(p.ry);
  const lx = (c * dx - s * dz) / (p.sx * PUDDLE_REACH + PUDDLE_MARGIN);
  const lz = (s * dx + c * dz) / (p.sz * PUDDLE_REACH + PUDDLE_MARGIN);
  return lx * lx + lz * lz < 1;
}

function makeCell(ix: number, iz: number, variants: TreeVariant[], total: number): Prop[] {
  const out: Prop[] = [];
  const ox = ix * CELL;
  const oz = iz * CELL;
  const h = (salt: number) => hash2(ix, iz, salt);
  const nearStart = (x: number, z: number) => x * x + z * z < START_CLEAR * START_CLEAR;
  // Puddles in this cell and its neighbours (the biggest reaches ~3.5 m, under one cell). Rocks may sit
  // beside or in water, but nothing that grows or stands upright can.
  const puddles: PuddleSpot[] = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const p = cellPuddle(ix + dx, iz + dz);
      if (p) puddles.push(p);
    }
  }
  const inWater = (x: number, z: number) => puddles.some((p) => inPuddle(p, x, z));
  const add = (p: Partial<Prop> & Pick<Prop, 'kind' | 'x' | 'z'>) =>
    out.push({
      variant: 0,
      ry: 0,
      sx: 1,
      sy: 1,
      sz: p.sx ?? 1,
      shade: 1,
      tint: 0,
      r: 0,
      leafy: true,
      ...p,
    });

  for (let slot = 0; slot < 2; slot++) {
    const s0 = slot * 10;
    if (h(s0 + 1) > (slot === 0 ? 0.56 : 0.22)) continue;
    const x = ox + (0.1 + 0.8 * h(s0 + 2)) * CELL;
    const z = oz + (0.1 + 0.8 * h(s0 + 3)) * CELL;
    if (nearStart(x, z) || inWater(x, z)) continue;
    const variant = pickVariant(variants, total, h(s0 + 4));
    const v = variants[variant];
    const s = 0.8 + h(s0 + 5) * 0.4;
    const sx = s * (0.92 + 0.16 * h(s0 + 7));
    add({
      kind: 'tree',
      variant,
      x,
      z,
      ry: h(s0 + 6) * TAU,
      sx,
      sy: s * (0.92 + 0.2 * h(s0 + 8)),
      sz: sx,
      shade: 0.7 + 0.4 * h(s0 + 9),
      tint: v.leafPalette ? pick(v.leafPalette, h(s0 + 11)) : 0,
      r: v.trunkRadius * s,
      leafy: h(300 + slot) < v.leafChance,
    });
  }

  const rocks = cellRocks(ix, iz);
  for (const r of rocks) add({ kind: 'rock', ...r, r: 0.42 * r.sx });

  // Dead grass: thick in some stretches of forest, nearly absent in others.
  const lush = Math.max(0, Math.min(1, (patchNoise(ix, iz, 0.18, 400) * 0.7 + patchNoise(ix, iz, 0.55, 401) * 0.3 - 0.32) * 2.2));
  const tufts = Math.min(GRASS_PER_CELL, 2 + Math.round(lush * 34 * (0.7 + 0.6 * h(70))));
  // Nothing grows through a rock; a big one can reach over a cell edge, so check the neighbours' rocks too.
  const nearbyRocks: RockSpot[] = [];
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) nearbyRocks.push(...cellRocks(ix + dx, iz + dz));
  for (let i = 0; i < tufts; i++) {
    const k = 1000 + i * 6;
    const s = 0.8 + h(k) * 0.9;
    const gx = ox + h(k + 1) * CELL;
    const gz = oz + h(k + 2) * CELL;
    if (inWater(gx, gz)) continue;
    if (nearbyRocks.some((r) => (gx - r.x) ** 2 + (gz - r.z) ** 2 < (0.5 * r.sx + ROCK_GRASS_MARGIN) ** 2)) continue;
    add({ kind: 'grass', x: gx, z: gz, ry: h(k + 3) * TAU, sx: s, sy: 0.6 + h(k + 4) * 1.0, shade: 0.7 + 0.5 * h(k + 5), tint: pick(GRASS_COLORS, h(k + 6)) });
  }

  // Standing water left behind by the rain.
  const ownPuddle = cellPuddle(ix, iz);
  if (ownPuddle) add({ kind: 'puddle', ...ownPuddle, shade: 1 });

  if (h(210) < 0.1) {
    const x = ox + h(211) * CELL;
    const z = oz + h(212) * CELL;
    if (!inWater(x, z)) add({ kind: 'mushroom', x, z, ry: h(213) * TAU, sx: 0.8 + h(214) * 0.8, sy: 0.8 + h(215) * 0.8, shade: 0.8 + 0.4 * h(216) });
  }

  if (h(220) < 0.12) {
    const n = 1 + Math.floor(h(221) * 3);
    const cx = ox + h(222) * CELL;
    const cz = oz + h(223) * CELL;
    const tint = pick(FLOWER_COLORS, h(224));
    for (let i = 0; i < n; i++) {
      const fx = cx + (h(225 + i) - 0.5) * 0.6;
      const fz = cz + (h(230 + i) - 0.5) * 0.6;
      if (inWater(fx, fz)) continue;
      add({ kind: 'flower', x: fx, z: fz, ry: h(235 + i) * TAU, sx: 0.8 + h(240 + i) * 0.6, sy: 0.7 + h(245 + i) * 0.7, shade: 0.9, tint });
    }
  }

  if (h(250) < 0.07) {
    const x = ox + h(251) * CELL;
    const z = oz + h(252) * CELL;
    const ry = h(253) * TAU;
    const sx = 0.7 + h(254) * 0.7;
    // The log runs along its local x axis and is 3.2 m long at scale 1: keep both ends and the middle dry.
    const ex = Math.cos(ry) * 1.6 * sx;
    const ez = -Math.sin(ry) * 1.6 * sx;
    const dry = !inWater(x, z) && !inWater(x + ex, z + ez) && !inWater(x - ex, z - ez);
    if (!nearStart(x, z) && dry) add({ kind: 'log', x, z, ry, sx, sy: 0.8 + h(255) * 0.5, shade: 0.8 + 0.4 * h(256) });
  }

  return out;
}

/** One instanced mesh per drawable part. Parts of one batch share instance data. */
interface Batch {
  meshes: THREE.InstancedMesh[];
  /** Which mesh takes the per-instance tint colour, or -1 for none. Others get a plain grey shade. */
  tintMesh: number;
  /** Brightness applied to the tint, to keep autumn colours dull and dirty. */
  tintScale: number;
  /** Multiplier on the plain grey shade of untinted meshes. */
  gain?: number;
  /** meshes[1] is a leaf mesh that individual instances can hide (see Prop.leafy). */
  hideableLeaves?: boolean;
}

export class Forest {
  readonly group = new THREE.Group();

  private cells = new Map<number, Prop[]>();
  private variants: TreeVariant[];
  private totalWeight: number;
  private trees: Batch[] = [];
  private rocks: Batch[] = [];
  private cover = {} as Record<CoverKind, Batch>;
  private ground: THREE.Mesh;
  private groundMaps: THREE.Texture[];
  private readonly cellCount = (RADIUS * 2 + 1) ** 2;
  private cx = Number.NaN;
  private cz = Number.NaN;

  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly hidden = new THREE.Matrix4().makeScale(1e-4, 1e-4, 1e-4);

  constructor() {
    // Trees are generated once up front, then scattered randomly as instances.
    this.variants = generateTreeVariants();
    this.totalWeight = this.variants.reduce((sum, v) => sum + v.weight, 0);

    const { cellCount } = this;
    for (const v of this.variants) {
      const meshes = [this.makeMesh(v.branchGeo, v.branchMat, cellCount * 2)];
      if (v.leafGeo && v.leafMat) meshes.push(this.makeMesh(v.leafGeo, v.leafMat, cellCount * 2));
      this.trees.push({ meshes, tintMesh: v.leafPalette && meshes.length > 1 ? 1 : -1, tintScale: 0.45, hideableLeaves: meshes.length > 1 });
    }
    for (const kind of COVER_KINDS) {
      const c = COVER[kind];
      this.cover[kind] = { meshes: [this.makeMesh(c.geo(), c.mat(), cellCount * c.perCell)], tintMesh: c.tinted ? 0 : -1, tintScale: kind === 'grass' ? 0.5 : 0.75 };
    }

    const gGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    gGeo.rotateX(-Math.PI / 2);
    const ground = makeGroundMaterial(GROUND_SIZE);
    this.groundMaps = ground.maps;
    this.ground = new THREE.Mesh(gGeo, ground.material);
    this.group.add(this.ground);
  }

  private makeMesh(geo: THREE.BufferGeometry, mat: THREE.Material, cap: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.count = 0;
    // Everything is within ~RADIUS cells of the camera; skip bounding-sphere culling.
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }

  /** Scanned rock models arrive after startup; once they do, the next frame scatters them. */
  setRocks(variants: RockVariant[]): void {
    for (const v of variants) {
      this.rocks.push({ meshes: [this.makeMesh(v.geo, v.mat, this.cellCount * 2)], tintMesh: -1, tintScale: 1, gain: v.gain });
    }
    this.cx = Number.NaN;
  }

  private getCell(ix: number, iz: number): Prop[] {
    const key = cellKey(ix, iz);
    let c = this.cells.get(key);
    if (!c) {
      c = makeCell(ix, iz, this.variants, this.totalWeight);
      this.cells.set(key, c);
    }
    return c;
  }

  /** Re-centre the streamed world and the ground on the player. */
  update(px: number, pz: number): void {
    this.ground.position.set(px, 0, pz);
    // Keep the ground textures pinned to world space while the plane follows the player.
    for (const t of this.groundMaps) t.offset.set(px / GROUND_TILE, -pz / GROUND_TILE);
    grassTime.value = performance.now() / 1000;
    tickPuddles(grassTime.value);

    const cx = Math.floor(px / CELL);
    const cz = Math.floor(pz / CELL);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;
    this.rebuild();
  }

  private rebuild(): void {
    const next = new Map<number, Prop[]>();
    const treeCounts = this.trees.map(() => 0);
    const rockCounts = this.rocks.map(() => 0);
    const coverCounts = {} as Record<CoverKind, number>;
    for (const k of COVER_KINDS) coverCounts[k] = 0;
    const { dummy, color } = this;

    const place = (batch: Batch, i: number, p: Prop) => {
      dummy.position.set(p.x, 0, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.updateMatrix();
      batch.meshes.forEach((mesh, m) => {
        if (m === batch.tintMesh && p.tint !== 0) color.set(p.tint).multiplyScalar(p.shade * batch.tintScale);
        else color.setScalar(p.shade * (batch.gain ?? 1));
        // A bare tree keeps its leaf instance but squashed to a point, so nothing is drawn.
        mesh.setMatrixAt(i, batch.hideableLeaves && m === 1 && !p.leafy ? this.hidden : dummy.matrix);
        mesh.setColorAt(i, color);
      });
    };

    for (let dx = -RADIUS; dx <= RADIUS; dx++) {
      for (let dz = -RADIUS; dz <= RADIUS; dz++) {
        const ix = this.cx + dx;
        const iz = this.cz + dz;
        const props = this.getCell(ix, iz);
        next.set(cellKey(ix, iz), props);
        if (dx * dx + dz * dz > RADIUS * RADIUS) continue;

        for (const p of props) {
          if (p.kind === 'tree') place(this.trees[p.variant], treeCounts[p.variant]++, p);
          else if (p.kind === 'rock') {
            if (this.rocks.length === 0) continue;
            const v = p.variant % this.rocks.length;
            place(this.rocks[v], rockCounts[v]++, p);
          } else place(this.cover[p.kind], coverCounts[p.kind]++, p);
        }
      }
    }
    this.cells = next;

    const commit = (batch: Batch, count: number) => {
      for (const mesh of batch.meshes) {
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    };
    this.trees.forEach((b, i) => commit(b, treeCounts[i]));
    this.rocks.forEach((b, i) => commit(b, rockCounts[i]));
    for (const k of COVER_KINDS) commit(this.cover[k], coverCounts[k]);
  }

  /** Push a position (x/z only) out of any trunk or rock it overlaps. */
  collide(p: THREE.Vector3, radius: number): void {
    const ix = Math.floor(p.x / CELL);
    const iz = Math.floor(p.z / CELL);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const pr of this.getCell(ix + dx, iz + dz)) {
          if (pr.r <= 0) continue;
          const ddx = p.x - pr.x;
          const ddz = p.z - pr.z;
          const min = pr.r + radius;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < min * min && d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = pr.x + (ddx / d) * min;
            p.z = pr.z + (ddz / d) * min;
          }
        }
      }
    }
  }
}
