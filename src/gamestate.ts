export type Phase = 'play' | 'caught' | 'won';

export const NIGHT_LENGTH = 360;
const DAWN_FADE = 30;

export class GameState {
  phase: Phase = 'play';
  running = false;
  elapsed = 0;
  caughtT = 0;

  get progress(): number {
    return Math.min(1, this.elapsed / NIGHT_LENGTH);
  }

  get dawn(): number {
    return Math.min(1, Math.max(0, (this.elapsed - (NIGHT_LENGTH - DAWN_FADE)) / DAWN_FADE));
  }

  get survived(): boolean {
    return this.elapsed >= NIGHT_LENGTH;
  }

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
