import * as THREE from 'three';
import { DAY } from '../mode';

export const AUTUMN_LEAVES = DAY
  ? [0x4f9a36, 0x5fae3f, 0x6fbf4a, 0x3f8a30, 0x7ac24f, 0x58a845]
  : [0x8a4a22, 0x7a3a1c, 0x8a6a2c, 0x6a4624, 0x5a2a16, 0x4a3c1c];
export const FLOWER_COLORS = DAY
  ? [0xf2e04a, 0xf4f4f0, 0xe0609a, 0xa874e0, 0xff9340]
  : [0x7a6a8f, 0x9a8a3a, 0xa8a49a, 0x8a4a3a, 0x6a7a9a];

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

const NIGHT_GRASS = [
  AUTUMN_PALETTE.straw,
  AUTUMN_PALETTE.golden,
  AUTUMN_PALETTE.goldenBrown,
  AUTUMN_PALETTE.olive,
  AUTUMN_PALETTE.coffee,
  AUTUMN_PALETTE.goldenBrown,
].map((hex) => new THREE.Color(hex).lerp(new THREE.Color(AUTUMN_PALETTE.walnut), 0.35).multiplyScalar(0.55).getHex());

export const GRASS_COLORS = DAY ? [0x5a9a3a, 0x6aa842, 0x78b04a, 0x4a8a34, 0x8fb850, 0xa3b04c, 0x6f9a40, 0x9aa848] : NIGHT_GRASS;
