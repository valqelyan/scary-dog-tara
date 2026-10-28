import type * as THREE from 'three';

/** Props like trees, rocks and logs are small on screen, so their textures are drawn at this size, not the 1024 they ship at. */
export const PROP_TEXTURE_PX = 512;

/**
 * Redraws a texture at `size` px along its longer side, if it is bigger. Works whether or not the image has loaded
 * yet (it waits for it), and also if the texture was already uploaded at full size (it frees that copy).
 */
export function shrinkTexture(tex: THREE.Texture, size = PROP_TEXTURE_PX): void {
  let waited = 0;
  const apply = () => {
    const img = tex.image as (CanvasImageSource & { width: number; height: number }) | null;
    if (!img?.width) {
      if (waited++ < 1200) requestAnimationFrame(apply);
      return;
    }
    if (Math.max(img.width, img.height) <= size) return;
    const k = size / Math.max(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * k);
    canvas.height = Math.round(img.height * k);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    tex.image = canvas;
    tex.dispose();
    tex.needsUpdate = true;
  };
  apply();
}
