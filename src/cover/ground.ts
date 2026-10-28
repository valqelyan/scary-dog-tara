import * as THREE from 'three';

/** Metres of ground one tile of the texture covers. */
export const GROUND_TILE = 3;

export interface GroundMaterial {
  material: THREE.MeshLambertMaterial;
  maps: THREE.Texture[];
}

/** "Sparse Grass" by Amal Kumar, Poly Haven (CC0): dark soil with short grass and roots. */
function loadMaps(planeSize: number): { map: THREE.Texture; normalMap: THREE.Texture } {
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}ground/`;
  const load = (file: string, srgb: boolean) => {
    const tex = loader.load(base + file);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(planeSize / GROUND_TILE, planeSize / GROUND_TILE);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  return { map: load('ground_diff.jpg', true), normalMap: load('ground_nor.jpg', false) };
}

/** `tint` scales the texture's colour, so each lighting setup can brighten or darken the photo to suit. */
export function makeGroundMaterial(planeSize: number, tint: number): GroundMaterial {
  const { map, normalMap } = loadMaps(planeSize);
  const material = new THREE.MeshLambertMaterial({ map, normalMap, color: tint });

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
        // Blend in a second, rotated and rescaled sample so the tiling doesn't show, then darken patches into wet earth.
        `vec4 sampledDiffuseColor = texture2D( map, vMapUv );
        vec3 second = texture2D( map, mat2(0.8, 0.6, -0.6, 0.8) * vMapUv * 0.37 + 0.31 ).rgb;
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, second, 0.3);
        float mud = smoothstep(0.6, 0.78, gNoise(vGroundXZ * 0.07) * 0.65 + gNoise(vGroundXZ * 0.19) * 0.35);
        sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, sampledDiffuseColor.rgb * vec3(0.55, 0.48, 0.4), mud);
        sampledDiffuseColor.rgb *= 0.78 + 0.45 * gNoise(vGroundXZ * 0.23);
        diffuseColor *= sampledDiffuseColor;`,
      );
  };

  return { material, maps: [map, normalMap] };
}
