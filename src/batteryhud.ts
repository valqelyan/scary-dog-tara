import type { Battery } from './battery';

/** A small battery icon: segments drain away as the charge falls, and it turns red when low. */
export class BatteryHud {
  private fill: HTMLElement;
  private last = -1;

  constructor(private el: HTMLElement) {
    this.fill = el.firstElementChild as HTMLElement;
  }

  update(battery: Battery): void {
    // Only touch the DOM when the shown charge changes by a visible amount.
    const shown = Math.round(battery.charge * 200);
    if (shown === this.last) return;
    this.last = shown;
    this.fill.style.clipPath = `inset(0 ${((1 - battery.charge) * 100).toFixed(1)}% 0 0)`;
    this.el.classList.toggle('low', battery.low && !battery.dead);
    this.el.classList.toggle('dead', battery.dead);
  }

  /** Back to a full battery, e.g. at the start of a new night. */
  reset(battery: Battery): void {
    this.last = -1;
    this.update(battery);
  }
}
