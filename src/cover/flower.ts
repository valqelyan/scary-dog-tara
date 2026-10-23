import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL_PX, TextureAtlas, plain, toCell, type Cell } from '../atlas';
import { TAU } from '../gfx';
import { hash2 } from '../rng';
import { CoverType } from './covertype';

const FLOWER_PETALS: Cell = [0, 0];
const FLOWER_LEAF: Cell = [64, 0];
const FLOWER_STEM: Cell = [0, 64];

function makeFlowerTexture(): THREE.CanvasTexture {
  const atlas = new TextureAtlas();
  const { ctx } = atlas;
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

  return atlas.texture();
}

function makeFlowerMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ map: makeFlowerTexture(), vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
}

function buildFlower(): THREE.BufferGeometry {
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

/** Wilted flowers, tinted per patch. */
export class Flower extends CoverType {
  readonly perCell = 3;
  readonly tinted = true;

  geometry(): THREE.BufferGeometry {
    return buildFlower();
  }

  material(): THREE.Material {
    return makeFlowerMaterial();
  }
}
