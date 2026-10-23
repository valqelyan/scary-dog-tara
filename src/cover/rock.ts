import * as THREE from 'three';
import { paint } from '../gfx';
import { hash2 } from '../rng';

export function buildRock(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.55, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 0.85 + 0.3 * hash2(Math.round(p.getX(i) * 100), Math.round(p.getZ(i) * 100), 7);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.translate(0, 0.15, 0);
  return paint(g, 0x1b1e20);
}
