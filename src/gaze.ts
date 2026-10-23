/** How long something has been stared at: it builds while the thing is in view, and fades at half speed once it is not. */
export class Gaze {
  time = 0;

  update(dt: number, inView: boolean): void {
    if (inView) this.time += dt;
    else this.time = Math.max(0, this.time - dt * 0.5);
  }

  reset(): void {
    this.time = 0;
  }
}
