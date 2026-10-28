import * as THREE from 'three';
import { canvasTexture, newCanvas, TAU } from '../gfx';
import { hash2 } from '../rng';
import { DAY } from '../mode';
import { AUTUMN_PALETTE } from './palette';

export const GROUND_TILE = 3;

export interface GroundMaterial {
  material: THREE.MeshLambertMaterial;
  maps: THREE.Texture[];
}

const GROUND_PX = 512;

/** Daytime forest floor: mossy grass with some earth and a few fallen leaves, in place of the autumn litter. */
const DAY_FLOOR = 0x4f7a32;
const DAY_MIX: [number, number][] = [
  [0x5c8f38, 1.0],
  [0x6fa244, 1.0],
  [0x4a7a2e, 1.0],
  [0x7a8a3a, 1.0],
  [0x8a6a3c, 0.9],
  [0x6a5230, 0.9],
  [0x9aa84e, 0.9],
];

function makeGroundTexture(): THREE.CanvasTexture {
  const { canvas, ctx } = newCanvas(GROUND_PX);
  const P = AUTUMN_PALETTE;
  const rnd = (i: number, salt: number) => hash2(i, salt, 560);
  const css = (hex: number, k: number) => {
    const c = new THREE.Color(hex).lerp(new THREE.Color(P.walnut), DAY ? 0.08 : 0.62);
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

  ctx.fillStyle = css(DAY ? DAY_FLOOR : P.walnut, DAY ? 1 : 0.7);
  ctx.fillRect(0, 0, GROUND_PX, GROUND_PX);
  for (let i = 0; i < 40; i++) {
    const x = rnd(i, 1) * GROUND_PX;
    const y = rnd(i, 2) * GROUND_PX;
    const r = 40 + rnd(i, 3) * 70;
    const dark = rnd(i, 4) < 0.6;
    wrapped(x, y, r, (wx, wy) => {
      const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, r);
      grad.addColorStop(0, dark ? (DAY ? 'rgba(20,40,10,0.25)' : 'rgba(10,6,4,0.35)') : DAY ? 'rgba(150,190,90,0.2)' : 'rgba(120,96,68,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(wx - r, wy - r, r * 2, r * 2);
    });
  }

  const mix: [number, number][] = DAY ? DAY_MIX : [
    [P.burntOrange, 1.0],
    [P.rust, 1.0],
    [P.golden, 0.95],
    [P.goldenBrown, 1.1],
    [P.coffee, 1.25],
    [P.olive, 1.05],
    [P.straw, 0.8],
  ];
  const weights = DAY ? [30, 30, 24, 12, 6, 6, 12] : [4, 6, 8, 30, 30, 12, 10];
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
    ctx.strokeStyle = `rgba(${DAY ? '70,50,30' : '30,20,12'},${(0.5 + 0.3 * rnd(i, 24)).toFixed(2)})`;
    ctx.lineWidth = 1.5 + rnd(i, 25) * 1.5;
    wrapped(x, y, len, (wx, wy) => {
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(ang) * len, wy + Math.sin(ang) * len);
      ctx.stroke();
    });
  }

  return canvasTexture(canvas, { wrap: true, srgb: true, anisotropy: 4 });
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
        vec3 mudCol = sampledDiffuseColor.rgb * vec3(${DAY ? '0.62, 0.52, 0.4' : '0.3, 0.26, 0.22'}) + vec3(0.006, 0.004, 0.003);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, mudCol, mud);
        sampledDiffuseColor.rgb *= 0.78 + 0.45 * gNoise(vGroundXZ * 0.23);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };

  return { material, maps: [map] };
}
