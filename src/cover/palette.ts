import * as THREE from 'three';

export const AUTUMN_LEAVES = [0x8a4a22, 0x7a3a1c, 0x8a6a2c, 0x6a4624, 0x5a2a16, 0x4a3c1c];
export const FLOWER_COLORS = [0x7a6a8f, 0x9a8a3a, 0xa8a49a, 0x8a4a3a, 0x6a7a9a];

export const AUTUMN_PALETTE = {
  burntOrange: 0xcc5500,
  rust: 0x9c3b1b,
  golden: 0xe8a14a,
  goldenBrown: 0x996515,
  coffee: 0x6f4e37,
  olive: 0x6b6b2e,
  walnut: 0x4a3b2a,
  straw: 0xd2b48c,
} as const;

export const GRASS_COLORS = [
  AUTUMN_PALETTE.straw,
  AUTUMN_PALETTE.golden,
  AUTUMN_PALETTE.goldenBrown,
  AUTUMN_PALETTE.olive,
  AUTUMN_PALETTE.coffee,
  AUTUMN_PALETTE.goldenBrown,
].map((hex) => new THREE.Color(hex).lerp(new THREE.Color(AUTUMN_PALETTE.walnut), 0.35).multiplyScalar(0.55).getHex());
