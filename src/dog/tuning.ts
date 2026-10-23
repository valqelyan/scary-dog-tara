/** Every number that shapes how the dog behaves, in one place. Speeds are m/s, times are seconds, distances are metres. */
export const DOG = {
  /** A relaxed walking pace, and the gallop used for the odd burst. */
  trot: 3.2,
  run: 6.6,
  /** Top speeds: coming when whistled, keeping up with a running player, and at heel or holding near a threat. */
  comeSpeed: 7.2,
  keepUpSpeed: 7,
  heelSpeed: 6.5,
  /** Her nose sticks out about 0.9 m ahead of where she stands, so she stops this far (body centre to trunk surface) to keep a gap. */
  treeStandOff: 1.1,
  /** And this far from a puddle's edge, so her head is over the water. */
  puddleStandOff: 0.3,
  /** How close to a tree or puddle she gets before she stops and investigates. */
  targetArrive: 0.2,

  /** She only reacts to the player running if within this distance and roughly facing them (radians). */
  noticeDist: 9,
  noticeAngle: 1.15,

  /** After the whistle: the pause before she sets off. Then how long she stays at heel after a call, a run and a threat. */
  whistleDelay: [0.35, 0.7],
  heelAfterCall: [10, 18],
  heelAfterRun: [4, 8],
  heelAfterThreat: [12, 20],
  heelAtStart: [5, 8],
  /** She stops running with the player this long after the player stops. */
  keepUpLinger: 2.5,

  /** How long she lingers. Tree sniffing is scaled by distraction. */
  sniffGround: [1.2, 4],
  sniffTree: [2.5, 5.5],
  drink: [2.5, 5],
  /** Absorbed in a tree: she stays this long unless whistled, or until the player is this far away. */
  hookFor: [45, 90],
  hookReleaseDist: 26,

  /** Baseline chances (before distraction scaling) of stopping to sniff, detouring to a tree or puddle, and being hooked by a tree she passes. */
  sniffChance: 0.45,
  detourChance: 0.45,
  hookChance: 0.8,

  /** How quickly speed builds (and when called), how quickly it drops, and how quickly she turns at a walk and at a run. */
  speedUp: 4,
  speedUpCalled: 7,
  slowDown: 7,
  turnWalk: 8,
  turnRun: 4.5,

  /** Seconds the first false alarm and the later ones are away. */
  firstAlert: [20, 30],
  nextAlertAfterThreat: [20, 40],
  nextAlertAfterAlarm: [28, 58],

  /**
   * Playfulness blends these between a low value (a dog that sticks by its owner, level 0) and a high one
   * (a dog that goes off and does her own thing, level 1).
   */
  play: {
    /** How far from the player she wanders before turning back, in metres. */
    roam: [6, 20],
    /** Chance that a wander is a run rather than a trot. */
    runChance: [0.15, 0.6],
    /** Multiplies how long she stays close after being called or running. */
    heelFactor: [1.5, 0.5],
    /** Chances, each time she finishes something, that she starts a playful activity instead of wandering on. */
    dash: [0.08, 0.4],
    zoom: [0.02, 0.18],
    trail: [0.08, 0.14],
    listen: [0.05, 0.1],
    /** Pause between playful activities, in seconds. */
    cooldown: [8, 16],
    /** Chance she bows when she reaches the player after a call. */
    bow: [0.2, 0.7],
  },
  dash: { distance: [9, 18], speed: 7, waitFor: [1.5, 3.5], inviteDist: 5 },
  zoom: { radius: [4, 7], duration: [3, 5], speed: 6.2 },
  trail: { duration: [5, 9], speed: 1.3 },
  listen: { duration: [1.5, 3.5] },
  bow: { duration: 1.1 },

  /** She recognises the player when you both look at each other, and runs to you as if called. */
  eyeContact: { minDist: 4, maxDist: 22, lookAngle: 0.22, faceAngle: 0.7, hold: 0.5, cooldown: 10, delay: [0.15, 0.3] },
} as const;
