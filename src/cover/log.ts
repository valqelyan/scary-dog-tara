import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shrinkTexture } from '../texsize';
import { CoverType } from './covertype';

function buildLog(): THREE.BufferGeometry {
  const body = new THREE.CylinderGeometry(0.17, 0.21, 3.2, 10);
  body.rotateZ(Math.PI / 2);
  body.translate(0, 0.18, 0);
  const stub = new THREE.CylinderGeometry(0.03, 0.055, 0.55, 5);
  stub.rotateZ(Math.PI / 2 - 0.9);
  stub.rotateY(0.6);
  stub.translate(0.5, 0.42, 0.12);
  return mergeGeometries([body, stub], false)!;
}

function makeBarkMaterial(): THREE.MeshStandardMaterial {
  const loader = new THREE.TextureLoader();
  const base = import.meta.env.BASE_URL + 'bark/';
  const load = (file: string, srgb: boolean) => {
    const t = loader.load(base + file);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 3);
    t.anisotropy = 8;
    shrinkTexture(t);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return new THREE.MeshStandardMaterial({
    map: load('log_diff.jpg', true),
    normalMap: load('log_nor.jpg', false),
    color: 0x45362b,
    roughness: 0.9,
    metalness: 0,
  });
}

/** Rotting fallen logs. */
export class Log extends CoverType {
  readonly perCell = 1;
  readonly tinted = false;

  geometry(): THREE.BufferGeometry {
    return buildLog();
  }

  material(): THREE.Material {
    return makeBarkMaterial();
  }
}
