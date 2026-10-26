import * as THREE from 'three';
import type { Forest } from '../forest';
import type { Player } from '../player';
import { DogBrain } from './brain';
import type { DogBody } from './body';
import { DogModel } from './model';
import { DogSkin } from './skin';

/** The dog: a brain that decides what to do, and a model that shows it. This is what the rest of the game talks to. */
export class Dog {
  readonly group = new THREE.Group();
  readonly pos = this.group.position;

  onAlertStart?: (heading: number) => void;
  onAlertEnd?: () => void;
  onStep?: () => void;

  private brain = new DogBrain(this.pos);
  private model: DogBody = new DogModel();

  constructor() {
    this.group.add(this.model.group);
    this.brain.onAlertStart = (heading) => this.onAlertStart?.(heading);
    this.brain.onAlertEnd = () => this.onAlertEnd?.();
    this.model.onStep = () => this.onStep?.();
    // The blocky dog stands in while the pointer loads, and stays if it cannot (or with ?dog=box).
    if (new URLSearchParams(location.search).get('dog') !== 'box') void this.loadPointer();
  }

  private async loadPointer(): Promise<void> {
    try {
      const skin = await DogSkin.load(import.meta.env.BASE_URL + 'dog/Dog.fbx');
      this.group.remove(this.model.group);
      skin.onStep = () => this.onStep?.();
      this.model = skin;
      this.group.add(skin.group);
    } catch (err) {
      console.warn('[dog] could not load the pointer model, keeping the blocky dog', err);
    }
  }

  get followAngle(): number {
    return this.brain.followAngle;
  }

  set followAngle(angle: number) {
    this.brain.followAngle = angle;
  }

  get alarms(): boolean {
    return this.brain.alarms;
  }

  set alarms(on: boolean) {
    this.brain.alarms = on;
  }

  get playfulness(): number {
    return this.brain.playfulness;
  }

  set playfulness(level: number) {
    this.brain.playfulness = Math.min(1, Math.max(0, level));
  }

  get distraction(): number {
    return this.brain.distraction;
  }

  set distraction(level: number) {
    this.brain.distraction = Math.min(1, Math.max(0, level));
  }

  get threatHeading(): number | null {
    return this.brain.threatHeading;
  }

  set threatHeading(heading: number | null) {
    this.brain.threatHeading = heading;
  }

  reset(player: Player): void {
    this.brain.reset(player);
    this.group.rotation.y = this.brain.heading;
  }

  /** The player whistled. */
  call(): void {
    this.brain.call();
  }

  update(dt: number, player: Player, forest: Forest): void {
    this.brain.update(dt, player, forest);
    this.group.rotation.y = this.brain.heading;
    this.model.update(dt, this.brain.pose);
  }
}
