import { DAY } from '../mode';

export const AUTUMN_LEAVES = DAY
  ? [0x4f9a36, 0x5fae3f, 0x6fbf4a, 0x3f8a30, 0x7ac24f, 0x58a845]
  : [0x8a4a22, 0x7a3a1c, 0x8a6a2c, 0x6a4624, 0x5a2a16, 0x4a3c1c];

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
