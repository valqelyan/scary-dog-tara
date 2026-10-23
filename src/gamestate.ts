export type Phase = 'play' | 'caught' | 'won';

/** Seconds you have to survive. */
export const NIGHT_LENGTH = 360;
/** The last stretch of the night, when the sky brightens. */
const DAWN_FADE = 30;

/** The run itself: which phase it is in, whether it is live, and how far through the night we are. */
export class GameState {
  phase: Phase = 'play';
  /** False while paused or sitting on a title or end screen. */
  running = false;
  /** Seconds of night survived. */
  elapsed = 0;
  /** Seconds since the stalker got you. */
  caughtT = 0;

  /** 0 at dusk, 1 at dawn. */
  get progress(): number {
    return Math.min(1, this.elapsed / NIGHT_LENGTH);
  }

  /** 0 through the night, ramping to 1 over the final DAWN_FADE seconds. */
  get dawn(): number {
    return Math.min(1, Math.max(0, (this.elapsed - (NIGHT_LENGTH - DAWN_FADE)) / DAWN_FADE));
  }

  get survived(): boolean {
    return this.elapsed >= NIGHT_LENGTH;
  }

  /** A fresh night. */
  reset(): void {
    this.phase = 'play';
    this.elapsed = 0;
    this.caughtT = 0;
  }

  tick(dt: number): void {
    this.elapsed += dt;
  }

  caught(): void {
    this.phase = 'caught';
    this.caughtT = 0;
  }

  win(): void {
    this.phase = 'won';
  }
}
