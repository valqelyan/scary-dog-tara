import * as THREE from 'three';
import { hash2 } from './rng';

const TEX = 256;

/** A pale disc with dark maria, a few craters and darker edges, painted once on a small canvas. */
function moonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d')!;
  const mid = TEX / 2;

  g.save();
  g.beginPath();
  g.arc(mid, mid, mid - 2, 0, Math.PI * 2);
  g.clip();

  // Body, darker towards the limb.
  const body = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
  body.addColorStop(0, '#e4e8ef');
  body.addColorStop(0.7, '#c3c9d6');
  body.addColorStop(1, '#8c94a6');
  g.fillStyle = body;
  g.fillRect(0, 0, TEX, TEX);

  // Maria: big soft dark patches.
  for (let i = 0; i < 9; i++) {
    const x = TEX * (0.2 + 0.6 * hash2(i, 0, 91));
    const y = TEX * (0.2 + 0.6 * hash2(i, 1, 91));
    const r = TEX * (0.08 + 0.14 * hash2(i, 2, 91));
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, 'rgba(78, 88, 108, 0.55)');
    m.addColorStop(1, 'rgba(78, 88, 108, 0)');
    g.fillStyle = m;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Craters: a dark floor with a bright rim.
  for (let i = 0; i < 38; i++) {
    const a = hash2(i, 0, 92) * Math.PI * 2;
    const d = Math.sqrt(hash2(i, 1, 92)) * mid * 0.92;
    const x = mid + Math.cos(a) * d;
    const y = mid + Math.sin(a) * d;
    const r = 2 + hash2(i, 2, 92) * hash2(i, 3, 92) * 14;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(70, 78, 96, 0.3)';
    g.fill();
    g.lineWidth = Math.max(1, r * 0.18);
    g.strokeStyle = 'rgba(240, 244, 250, 0.35)';
    g.stroke();
  }
  g.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round falloff for the halo. */
function glowTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(170, 190, 230, 0.55)');
  grad.addColorStop(0.25, 'rgba(120, 145, 200, 0.22)');
  grad.addColorStop(1, 'rgba(80, 105, 160, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** Textured moon plus a halo: two camera-facing sprites, so it costs next to nothing. */
export function buildMoon(): THREE.Group {
  const group = new THREE.Group();

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }),
  );
  glow.scale.setScalar(150);

  const disc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: moonTexture(),
      depthWrite: false,
      fog: false,
      toneMapped: false,
      // Keep it dim: it should read as a cold night moon, not a lamp.
      color: 0xb4bccc,
    }),
  );
  disc.scale.setScalar(30);

  group.add(glow, disc);
  group.position.set(-150, 190, -210);
  return group;
}
