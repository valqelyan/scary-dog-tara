import * as THREE from 'three';
import { canvasTexture, newCanvas, TAU } from '../gfx';
import { hash2 } from '../rng';
import { CoverType } from './covertype';

export const GRASS_PER_CELL = 40;

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

function makeGrassTexture(): THREE.CanvasTexture {
  const W = 64;
  const H = 128;
  const { canvas, ctx } = newCanvas(W, H);
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

  return canvasTexture(canvas, { srgb: true, anisotropy: 4 });
}

function makeGrassMaterial(clock: { value: number }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: makeGrassTexture(), vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
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

/** Tufts of tall dead grass that sway in a breeze. */
export class Grass extends CoverType {
  readonly perCell = GRASS_PER_CELL;
  readonly tinted = true;

  /** Shared by every tuft's shader. */
  private clock = { value: 0 };

  geometry(): THREE.BufferGeometry {
    return buildGrass();
  }

  material(): THREE.Material {
    return makeGrassMaterial(this.clock);
  }

  tick(time: number): void {
    this.clock.value = time;
  }
}
