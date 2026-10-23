import * as THREE from 'three';
import { Tree, TreePreset } from '@dgreenheck/ez-tree';
import { AUTUMN_LEAVES } from './groundcover';

export interface TreeVariant {
  /** Weight when scattering trees through the forest. */
  weight: number;
  branchGeo: THREE.BufferGeometry;
  branchMat: THREE.Material;
  leafGeo: THREE.BufferGeometry | null;
  leafMat: THREE.Material | null;
  /** Trunk collision radius at scale 1. */
  trunkRadius: number;
  /** Autumn colours picked per instance for the leaf mesh. */
  leafPalette?: number[];
  /** Chance that a given tree of this kind is wearing its leaves; the rest are scattered bare. */
  leafChance: number;
}

interface Spec {
  preset: keyof typeof TreePreset;
  seed: number;
  /** Final height in metres. */
  height: number;
  weight: number;
  /** Fraction of the preset's leaves to keep. 0 = bare, dead tree. */
  leaves: number;
  barkTint: number;
  leafTint: number;
  /** Pick leaf colours per tree from AUTUMN_LEAVES instead of one fixed tint. */
  autumn?: boolean;
}

// Dark, desaturated tints so everything reads as dead and sickly under the flashlight.
const SPECS: Spec[] = [
  // Evergreens: the only trees still wearing needles.
  { preset: 'Pine Medium', seed: 101, height: 10, weight: 16, leaves: 1, barkTint: 0x3a312c, leafTint: 0x2c4130 },
  { preset: 'Pine Large', seed: 202, height: 13, weight: 10, leaves: 1, barkTint: 0x342c27, leafTint: 0x263a2a },
  { preset: 'Pine Medium', seed: 303, height: 8.5, weight: 8, leaves: 0.7, barkTint: 0x3a312c, leafTint: 0x2f4130 },
  // Dead, bare trees.
  { preset: 'Oak Medium', seed: 404, height: 7.5, weight: 12, leaves: 0, barkTint: 0x302a25, leafTint: 0x000000 },
  { preset: 'Oak Small', seed: 505, height: 6, weight: 6, leaves: 0, barkTint: 0x2b2622, leafTint: 0x000000 },
  { preset: 'Aspen Medium', seed: 707, height: 9, weight: 8, leaves: 0, barkTint: 0x55524b, leafTint: 0x000000 },
  // Autumn trees still clinging to dirty orange and brown leaves.
  { preset: 'Oak Medium', seed: 606, height: 8, weight: 10, leaves: 0.6, barkTint: 0x2f2924, leafTint: 0xffffff, autumn: true },
  { preset: 'Ash Medium', seed: 808, height: 9, weight: 8, leaves: 0.55, barkTint: 0x332c27, leafTint: 0xffffff, autumn: true },
  { preset: 'Aspen Medium', seed: 909, height: 8, weight: 6, leaves: 0.65, barkTint: 0x55524b, leafTint: 0xffffff, autumn: true },
  // Young trees: small, thin, and half-stripped.
  { preset: 'Oak Small', seed: 1001, height: 3.6, weight: 8, leaves: 0.85, barkTint: 0x332c27, leafTint: 0xffffff, autumn: true },
  { preset: 'Aspen Small', seed: 1102, height: 4.2, weight: 6, leaves: 0.65, barkTint: 0x55524b, leafTint: 0xffffff, autumn: true },
  { preset: 'Ash Small', seed: 1203, height: 3.2, weight: 4, leaves: 0, barkTint: 0x332c27, leafTint: 0x000000 },
];

// Per-branch-level caps on mesh resolution. The presets are tuned for close-ups, not a forest of 100+ trees.
const MAX_SECTIONS = [8, 4, 3, 2];
const MAX_SEGMENTS = [6, 4, 3, 3];

function configure(tree: Tree, spec: Spec): void {
  tree.loadPreset(spec.preset as string);
  const o = tree.options;
  o.seed = spec.seed;
  o.bark.tint = spec.barkTint;
  o.leaves.tint = spec.leafTint;

  const sections = o.branch.sections as Record<number, number>;
  const segments = o.branch.segments as Record<number, number>;
  for (let i = 0; i < MAX_SECTIONS.length; i++) {
    sections[i] = Math.min(sections[i], MAX_SECTIONS[i]);
    segments[i] = Math.min(segments[i], MAX_SEGMENTS[i]);
  }

  if (o.type === 'evergreen') {
    // Pines spend most of their triangles on side branches and needle cards: thin both out, make cards bigger.
    o.branch.children[0] = Math.min(o.branch.children[0], 45);
    o.leaves.count = Math.round(o.leaves.count * 0.6 * spec.leaves);
    o.leaves.size *= 1.3;
  } else {
    o.leaves.count = Math.round(o.leaves.count * spec.leaves);
  }
}

/** Generates every tree variant once, bakes them to a fixed size, and returns reusable geometry. */
export function generateTreeVariants(): TreeVariant[] {
  const out: TreeVariant[] = [];

  for (const spec of SPECS) {
    const tree = new Tree();
    configure(tree, spec);
    tree.generate();

    const branchGeo = tree.branchesMesh.geometry as THREE.BufferGeometry;
    const leafGeo = tree.leavesMesh.geometry as THREE.BufferGeometry;

    branchGeo.computeBoundingBox();
    const box = branchGeo.boundingBox!;
    const scale = spec.height / (box.max.y - box.min.y);
    // Sit the trunk base on y = 0 and bake the scale in.
    const bake = (g: THREE.BufferGeometry) => {
      g.translate(0, -box.min.y, 0);
      g.scale(scale, scale, scale);
    };
    bake(branchGeo);

    const hasLeaves = spec.leaves > 0 && leafGeo.index !== null && leafGeo.index.count > 0;
    if (hasLeaves) bake(leafGeo);

    // Everything is soaked: wet bark and leaves catch the flashlight.
    const branchMat = tree.branchesMesh.material as THREE.MeshPhongMaterial;
    branchMat.shininess = 22;
    branchMat.specular.setScalar(0.14);
    const leafMat = tree.leavesMesh.material as THREE.MeshPhongMaterial;
    leafMat.shininess = 14;
    leafMat.specular.setScalar(0.08);
    // ez-tree's wind shader replaces <project_vertex> and skips the instance matrix, which
    // piles every instanced leaf at the world origin. Put the instance transform back.
    const eztreeCompile = leafMat.onBeforeCompile;
    leafMat.onBeforeCompile = (shader, renderer) => {
      eztreeCompile.call(leafMat, shader, renderer);
      shader.vertexShader = shader.vertexShader.replace(
        'vec4 mvPosition = vec4(transformed, 1.0);',
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif`,
      );
    };
    // A faint glow of its own, so leaves still read as leaves outside the flashlight beam.
    leafMat.emissive.set(spec.autumn ? 0x2a1709 : 0x0d1a0f);

    out.push({
      weight: spec.weight,
      branchGeo,
      branchMat,
      leafGeo: hasLeaves ? leafGeo : null,
      leafMat: hasLeaves ? leafMat : null,
      trunkRadius: Math.max(0.2, tree.options.branch.radius[0] * scale * 0.9),
      leafPalette: spec.autumn && hasLeaves ? AUTUMN_LEAVES : undefined,
      leafChance: spec.autumn ? 0.7 : 0.9,
    });

    if (import.meta.env.DEV) {
      const tris = (branchGeo.index?.count ?? 0) / 3 + (hasLeaves ? (leafGeo.index?.count ?? 0) / 3 : 0);
      console.info(`[trees] ${spec.preset} seed ${spec.seed}: ${Math.round(tris)} tris, trunk r=${out[out.length - 1].trunkRadius.toFixed(2)}`);
    }
  }
  return out;
}
