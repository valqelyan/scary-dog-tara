/** Seconds one full charge lasts. The night is 360, so the last stretch before dawn is dark. */
const LIFE = 300;
export const LOW_CHARGE = 0.25;
const DIM_BELOW = 0.12;

export class Battery {
  charge = 1;
  onDead?: () => void;

  private flickerT = 0;
  private nextFlicker = 40 + Math.random() * 30;
  private deadT = -1;
  private clock = 0;

  get low(): boolean {
    return this.charge < LOW_CHARGE;
  }

  get dead(): boolean {
    return this.charge <= 0;
  }

  reset(): void {
    this.charge = 1;
    this.flickerT = 0;
    this.nextFlicker = 40 + Math.random() * 30;
    this.deadT = -1;
  }

  flicker(seconds: number): void {
    this.flickerT = Math.max(this.flickerT, seconds);
  }

  update(dt: number, threat: number): number {
    this.clock += dt;
    this.charge = Math.max(0, this.charge - dt / LIFE);

    if (this.dead) {
      if (this.deadT < 0) {
        this.deadT = 0;
        this.onDead?.();
      }
      this.deadT += dt;
      return this.deadT < 0.9 && Math.random() < 0.5 ? 0.3 : 0;
    }

    this.nextFlicker -= dt;
    if (this.nextFlicker <= 0) {
      this.flickerT = Math.max(this.flickerT, 0.5);
      this.nextFlicker = 45 + Math.random() * 40;
    }
    if (this.flickerT <= 0) {
      if (Math.random() < threat * threat * 0.05) this.flickerT = 0.12 + Math.random() * 0.25;
      else if (this.low && Math.random() < dt * 1.2 * (1 - this.charge / LOW_CHARGE)) this.flickerT = 0.06 + Math.random() * 0.2;
    }

    const fade = this.charge >= DIM_BELOW ? 1 : 0.35 + 0.65 * (this.charge / DIM_BELOW);
    let k = fade * (0.96 + 0.04 * Math.sin(this.clock * 23) * Math.sin(this.clock * 7.3));
    if (this.flickerT > 0) {
      this.flickerT -= dt;
      k *= Math.random() < 0.5 ? 1 : 0.12;
    }
    return k;
  }
}
