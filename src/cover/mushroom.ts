import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL_PX, TextureAtlas, plain, planarUV, toCell, type Cell } from '../atlas';
import { TAU } from '../gfx';
import { hash2 } from '../rng';
import { CoverType } from './covertype';

const MUSHROOM_STEM: Cell = [0, 0];
const MUSHROOM_CAP: Cell = [64, 0];
const MUSHROOM_GILLS: Cell = [0, 64];

function makeMushroomTexture(): THREE.CanvasTexture {
  const atlas = new TextureAtlas();
  const { ctx } = atlas;
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

  return atlas.texture();
}

function makeMushroomMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: makeMushroomTexture(), vertexColors: true, side: THREE.DoubleSide });
}

function buildMushrooms(): THREE.BufferGeometry {
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

/** Small clusters of mushrooms. */
export class Mushroom extends CoverType {
  readonly perCell = 1;
  readonly tinted = false;

  geometry(): THREE.BufferGeometry {
    return buildMushrooms();
  }

  material(): THREE.Material {
    return makeMushroomMaterial();
  }
}
