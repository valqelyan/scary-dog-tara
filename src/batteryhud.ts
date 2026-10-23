import type { Battery } from './battery';

export class BatteryHud {
  private fill: HTMLElement;
  private last = -1;

  constructor(private el: HTMLElement) {
    this.fill = el.firstElementChild as HTMLElement;
  }

  update(battery: Battery): void {
    const shown = Math.round(battery.charge * 200);
    if (shown === this.last) return;
    this.last = shown;
    this.fill.style.clipPath = `inset(0 ${((1 - battery.charge) * 100).toFixed(1)}% 0 0)`;
    this.el.classList.toggle('low', battery.low && !battery.dead);
    this.el.classList.toggle('dead', battery.dead);
  }

  reset(battery: Battery): void {
    this.last = -1;
    this.update(battery);
  }
}
