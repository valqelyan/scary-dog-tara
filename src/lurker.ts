import * as THREE from 'three';

export class Lurker {
  readonly group = new THREE.Group();

  private life = 0;
  private watched = 0;
  private blinkT = 0;
  private active = false;
  private readonly toEyes = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();

  constructor() {
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2a14 });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), mat);
      eye.position.x = sx * 0.12;
      eye.rotation.z = -sx * 0.18;
      this.group.add(eye);
    }
    this.group.visible = false;
  }

  show(x: number, z: number): void {
    this.group.position.set(x, 1.55 + Math.random() * 0.4, z);
    this.group.visible = true;
    this.active = true;
    this.life = 0;
    this.watched = 0;
    this.blinkT = 2 + Math.random() * 2;
  }

  hide(): void {
    this.active = false;
    this.group.visible = false;
  }

  get visible(): boolean {
    return this.active;
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    if (!this.active) return;
    this.life += dt;

    this.group.lookAt(camera.position.x, this.group.position.y, camera.position.z);

    camera.getWorldDirection(this.fwd);
    this.toEyes.copy(this.group.position).sub(camera.position).normalize();
    if (this.fwd.dot(this.toEyes) > 0.94) this.watched += dt;
    else this.watched = Math.max(0, this.watched - dt * 0.5);
    if (this.watched > 0.7 || this.life > 14) {
      this.hide();
      return;
    }

    this.blinkT -= dt;
    this.group.scale.y = this.blinkT < 0.12 && this.blinkT > 0 ? 0.1 : 1;
    if (this.blinkT <= -0.001) this.blinkT = 2.5 + Math.random() * 3;
  }
}
