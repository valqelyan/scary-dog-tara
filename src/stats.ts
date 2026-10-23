import * as THREE from 'three';

/** Estimated GPU bytes for every distinct texture reachable from the scene's materials (RGBA8 plus mips). */
function textureBytes(scene: THREE.Scene): { count: number; bytes: number } {
  const seen = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const mat of Array.isArray(mats) ? mats : [mats]) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) seen.add(v);
    }
  });
  let bytes = 0;
  for (const t of seen) {
    const img = t.image as { width?: number; height?: number } | null;
    if (!img?.width || !img.height) continue;
    bytes += img.width * img.height * 4 * (t.generateMipmaps ? 4 / 3 : 1);
  }
  return { count: seen.size, bytes };
}

/**
 * Debug overlay: FPS (also shown in the tab title), frame time, draw calls, triangles and an estimate of texture memory.
 * Toggle with F3, or open the page with ?stats. Browsers do not expose real VRAM use,
 * so the texture figure is computed from texture sizes.
 */
export function createStats(renderer: THREE.WebGLRenderer, scene: THREE.Scene): { update: () => void } {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;top:6px;left:6px;margin:0;padding:6px 8px;z-index:50;pointer-events:none;' +
    'font:11px/1.35 ui-monospace,monospace;color:#9f9;background:rgba(0,0,0,.6);display:none;white-space:pre';
  document.body.appendChild(el);

  let visible = new URLSearchParams(location.search).has('stats');
  el.style.display = visible ? 'block' : 'none';
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'F3') return;
    e.preventDefault();
    visible = !visible;
    el.style.display = visible ? 'block' : 'none';
  });

  let frames = 0;
  let worst = 0;
  let last = performance.now();
  let lastFrame = last;

  return {
    /** Call once per frame, right after renderer.render. */
    update() {
      const now = performance.now();
      worst = Math.max(worst, now - lastFrame);
      lastFrame = now;
      frames++;
      if (now - last < 500) return;
      const fps = (frames * 1000) / (now - last);
      frames = 0;
      last = now;
      const w = worst;
      worst = 0;
      document.title = `${fps.toFixed(0)} fps`;
      if (!visible) return;
      const { render, memory } = renderer.info;
      const tex = textureBytes(scene);
      el.textContent =
        `${fps.toFixed(0)} fps  (worst frame ${w.toFixed(0)} ms)\n` +
        `draw calls  ${render.calls}\n` +
        `triangles   ${render.triangles.toLocaleString()}\n` +
        `geometries  ${memory.geometries}\n` +
        `textures    ${memory.textures} (${tex.count} in scene)\n` +
        `tex memory ~${(tex.bytes / 2 ** 20).toFixed(0)} MB (estimate)\n` +
        `canvas      ${renderer.domElement.width}x${renderer.domElement.height}`;
    },
  };
}
