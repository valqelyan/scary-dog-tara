import * as THREE from 'three';
import { canvasTexture, newCanvas, paint } from './gfx';

export const ATLAS = 128;
export const CELL_PX = 64;

/** A cell's top-left corner, in pixels. */
export type Cell = readonly [x: number, y: number];

/** A small hand-painted sheet of 64px cells, so one material and one draw call can cover several different parts. */
export class TextureAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;

  constructor() {
    ({ canvas: this.canvas, ctx: this.ctx } = newCanvas(ATLAS));
  }

  texture(): THREE.CanvasTexture {
    return canvasTexture(this.canvas, { srgb: true, anisotropy: 4 });
  }
}

/** Squeeze a geometry's 0..1 UVs into one atlas cell, a little inset so mipmaps don't bleed neighbours in. */
export function toCell(g: THREE.BufferGeometry, [cx, cy]: Cell): THREE.BufferGeometry {
  const uv = g.attributes.uv;
  const pad = 2;
  const size = (CELL_PX - pad * 2) / ATLAS;
  const u0 = (cx + pad) / ATLAS;
  const v0 = 1 - (cy + CELL_PX - pad) / ATLAS;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * size, v0 + uv.getY(i) * size);
  return g;
}

/** Top-down UVs for a dome or disc of the given radius: the centre of the texture sits on the axis. */
export function planarUV(g: THREE.BufferGeometry, radius: number): THREE.BufferGeometry {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * radius), 0.5 + p.getZ(i) / (2 * radius));
  return g;
}

/** Same attributes on every part, so they merge: non-indexed, white vertex colour. */
export function plain(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return paint(g.index ? g.toNonIndexed() : g, 0xffffff);
}
