import * as THREE from 'three';
import { canvasTexture, newCanvas } from '../gfx';
import { hash2 } from '../rng';

/** Liver (dark brown) head and patches, a lighter roan body, and white socks and chest: a German shorthaired pointer. */
const LIVER = 0x2a160c;
const ROAN = 0x4a3526;
const WHITE = 0x7a7060;
/** Overall brightness of the coat: it is lit by a strong flashlight in the dark, so keep it low. */
const GAIN = 0.55;
/** How many times the speckle tile repeats per metre. */
const SPECKLE_PER_METRE = 2.4;

/** Smooth value noise in 3D, [0, 1). */
function noise3(x: number, y: number, z: number, salt: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const h = (i: number, j: number, k: number) => hash2(i + j * 57, k, salt);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const sx = s(fx), sy = s(fy), sz = s(fz);
  const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), sx);
  const x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), sx);
  const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), sx);
  const x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), sx);
  return lerp(lerp(x00, x10, sy), lerp(x01, x11, sy), sz);
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A small tileable tile of fine light and dark flecks: the ticking in a pointer's coat. Mid-grey on average. */
function speckleTexture(): THREE.CanvasTexture {
  const N = 128;
  const { canvas, ctx } = newCanvas(N);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) {
    const x = hash2(i, 1, 700) * N;
    const y = hash2(i, 2, 700) * N;
    const r = 0.8 + hash2(i, 3, 700) * 1.8;
    const light = hash2(i, 4, 700) < 0.45;
    ctx.fillStyle = light ? `rgba(235,235,235,${(0.35 + 0.4 * hash2(i, 5, 700)).toFixed(2)})` : `rgba(20,20,20,${(0.4 + 0.5 * hash2(i, 5, 700)).toFixed(2)})`;
    // Drawn at every wrapped offset so the tile repeats without a seam.
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvasTexture(canvas, { wrap: true });
}

/**
 * Give a UV-less skinned mesh a pointer's coat. The big pattern is painted into vertex colours from where each vertex
 * sits in the rest pose; the fine ticking is a small texture projected from three sides in the shader.
 * @param bounds  the rest-pose bounds of the whole dog, in the model's own units
 * @param midZ    where the dog's midline sits along the model's z axis
 * @param metres  metres per model unit, so the speckle is the right size
 */
export function applyCoat(mesh: THREE.SkinnedMesh, bounds: THREE.Box3, midZ: number, metres: number): THREE.Material {
  const geo = mesh.geometry;
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const coatPos = new Float32Array(count * 3);
  const coatNormal = new Float32Array(count * 3);

  const size = bounds.getSize(new THREE.Vector3());
  const half = size.z / 2;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  const liver = new THREE.Color(LIVER);
  const roan = new THREE.Color(ROAN);
  const white = new THREE.Color(WHITE);

  for (let i = 0; i < count; i++) {
    // Where this vertex is in the rest pose, in the dog's own space.
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    n.fromBufferAttribute(geo.attributes.normal, i).applyMatrix3(normalMatrix).normalize();
    const along = (v.x - bounds.min.x) / size.x; // 0 at the tail, 1 at the nose
    const up = (v.y - bounds.min.y) / size.y; // 0 at the paws, 1 at the top of the head
    const across = Math.abs(v.z - midZ) / half; // 0 on the midline, 1 at the flank

    // Roan body with liver patches on the back and flanks.
    const blotch = smooth(0.42, 0.56, noise3(v.x * 0.022, v.y * 0.022, v.z * 0.022, 11));
    c.copy(roan).lerp(liver, blotch * smooth(0.35, 0.6, up));
    // Dark head, a pale blaze down the middle of the face, and a dark tail.
    c.lerp(liver, smooth(0.8, 0.9, along) * 0.9);
    c.lerp(white, smooth(0.8, 0.9, along) * smooth(0.15, 0.0, across) * smooth(0.55, 0.7, up) * 0.55);
    c.lerp(liver, smooth(0.16, 0.06, along) * 0.8);
    // White chest and belly, and white socks on the lower legs.
    c.lerp(white, smooth(0.5, 0.2, up) * smooth(0.45, 0.2, across) * 0.4);
    c.lerp(white, smooth(0.26, 0.1, up) * 0.7);
    c.multiplyScalar(GAIN);

    colors.set([c.r, c.g, c.b], i * 3);
    coatPos.set([(v.x - bounds.min.x) * metres, (v.y - bounds.min.y) * metres, (v.z - midZ) * metres], i * 3);
    coatNormal.set([n.x, n.y, n.z], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('coatPos', new THREE.BufferAttribute(coatPos, 3));
  geo.setAttribute('coatNormal', new THREE.BufferAttribute(coatNormal, 3));

  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x0a0604 });
  const speckle = speckleTexture();
  material.onBeforeCompile = (shader) => {
    shader.uniforms.speckleMap = { value: speckle };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 coatPos;\nattribute vec3 coatNormal;\nvarying vec3 vCoatPos;\nvarying vec3 vCoatNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoatPos = coatPos;\nvCoatNormal = coatNormal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D speckleMap;\nvarying vec3 vCoatPos;\nvarying vec3 vCoatNormal;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Triplanar: sample the speckle from the three sides and blend by which way the surface faces, so no UVs are needed.
        vec3 tw = pow(abs(normalize(vCoatNormal)), vec3(4.0));
        tw /= tw.x + tw.y + tw.z;
        float flecks = texture2D(speckleMap, vCoatPos.yz * ${SPECKLE_PER_METRE.toFixed(1)}).r * tw.x
                     + texture2D(speckleMap, vCoatPos.xz * ${SPECKLE_PER_METRE.toFixed(1)}).r * tw.y
                     + texture2D(speckleMap, vCoatPos.xy * ${SPECKLE_PER_METRE.toFixed(1)}).r * tw.z;
        diffuseColor.rgb *= 0.35 + 1.3 * flecks;`,
      );
  };
  return material;
}
