import * as THREE from 'three';
import { canvasTexture, newCanvas, TAU } from '../gfx';
import { hash2 } from '../rng';
import { CoverType } from './covertype';

function buildPuddle(): THREE.BufferGeometry {
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
  const { canvas, ctx } = newCanvas(PUDDLE_PX);
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

  return canvasTexture(canvas, { srgb: true, anisotropy: 4 });
}

function makePuddleGloss(): THREE.CanvasTexture {
  const { canvas, ctx } = newCanvas(PUDDLE_PX);
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
  return canvasTexture(canvas);
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
  const { canvas, ctx } = newCanvas(N);
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
  const tex = canvasTexture(canvas, { wrap: true });
  tex.repeat.set(2, 2);
  return tex;
}

function makePuddleMaterial(normal: THREE.Texture): THREE.MeshPhongMaterial {
  return new THREE.MeshPhongMaterial({
    map: makePuddleTexture(),
    specularMap: makePuddleGloss(),
    normalMap: normal,
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

/** Standing water left by the rain. The surface's bumps drift a little so it is never quite still. */
export class Puddle extends CoverType {
  readonly perCell = 1;
  readonly tinted = false;

  private normal: THREE.Texture | null = null;

  geometry(): THREE.BufferGeometry {
    return buildPuddle();
  }

  material(): THREE.Material {
    this.normal = makeWaterNormal();
    return makePuddleMaterial(this.normal);
  }

  tick(time: number): void {
    this.normal?.offset.set(time * 0.012, time * 0.008);
  }
}
