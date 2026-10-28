import './style.css';
import * as THREE from 'three';
import { DRAW_DISTANCE, Forest } from './forest';
import { buildRock } from './cover';
import { loadRocks } from './rocks';
import { Player } from './player';
import { Dog } from './dog';
import { Lurker } from './lurker';
import { Stalker } from './stalker';
import { GameAudio } from './audio';
import { hash2 } from './rng';
import { approach } from './util';
import { canvasTexture, newCanvas } from './gfx';
import { buildMoon } from './moon';
import { createStats } from './stats';
import { GameState, NIGHT_LENGTH } from './gamestate';
import { Battery } from './battery';
import { BatteryHud } from './batteryhud';
import { DAY } from './mode';
import { loadPlants } from './plants';

/** Off by default, so you can just explore: no stalker, eyes, false alarms, twig snaps or dawn ending. Add ?horror to the URL to turn it all on. */
const HORROR = !DAY && new URLSearchParams(location.search).has('horror');

const FOG_COLOR = DAY ? 0xf0e6c8 : 0x06090c;
const FLASH_BASE = 260;
const FOG_DENSITY = 0.052;
const DAWN_COLOR = new THREE.Color(0x5b6f80);
const NIGHT_COLOR = new THREE.Color(FOG_COLOR);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const titleEl = document.getElementById('title') as HTMLElement;
const subEl = document.getElementById('sub') as HTMLElement;
const vignetteEl = document.getElementById('vignette') as HTMLElement;
const flashEl = document.getElementById('flash') as HTMLElement;
const staminaEl = document.getElementById('stamina') as HTMLElement;
const staminaBar = staminaEl.firstElementChild as HTMLElement;
const batteryEl = document.getElementById('battery') as HTMLElement;
const climbEl = document.getElementById('climb') as HTMLElement;
const startBtn = document.getElementById('start') as HTMLButtonElement;
if (DAY) subEl.textContent = 'A walk in the woods, in the daylight.';
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);
document.body.classList.toggle('day', DAY);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Compress hot spots so things close to the flashlight do not clip to white.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = DAY ? 1.0 : 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
// Night fog is thick enough to hide the edge of the forest. Day fog is thin, so it is linear and ends exactly at the draw distance.
scene.fog = DAY ? new THREE.Fog(FOG_COLOR, DRAW_DISTANCE * 0.2, DRAW_DISTANCE) : new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
scene.add(camera);

const hemi = DAY ? new THREE.HemisphereLight(0xfff3dc, 0x6f7f4a, 2.3) : new THREE.HemisphereLight(0x3a4f70, 0x0a0f0a, 1.1);
scene.add(hemi);
// The moon at night, the sun by day.
const moonLight = DAY ? new THREE.DirectionalLight(0xffe2a8, 2.8) : new THREE.DirectionalLight(0x6f86b8, 0.9);
if (DAY) moonLight.position.set(45, 70, 30);
else moonLight.position.set(-30, 40, -45);
scene.add(moonLight);

const flashlight = new THREE.SpotLight(0xffe8c4, DAY ? 0 : FLASH_BASE, 34, 0.62, 1, 1.3);
flashlight.position.set(0.15, -0.12, 0);
flashlight.target.position.set(0, -0.05, -6);
camera.add(flashlight, flashlight.target);

/** A soft white-yellow disc that stays put in the sky, like the stars and moon do. */
function buildSun(): THREE.Sprite {
  const size = 128;
  const { canvas, ctx } = newCanvas(size);
  const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  glow.addColorStop(0, 'rgba(255,255,240,1)');
  glow.addColorStop(0.18, 'rgba(255,248,215,1)');
  glow.addColorStop(0.3, 'rgba(255,230,160,0.6)');
  glow.addColorStop(0.6, 'rgba(255,226,150,0.18)');
  glow.addColorStop(1, 'rgba(255,230,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: canvasTexture(canvas, { srgb: true }), fog: false, transparent: true, depthWrite: false, toneMapped: false }),
  );
  sun.position.copy(moonLight.position).normalize().multiplyScalar(280);
  sun.scale.setScalar(170);
  return sun;
}

const sky = new THREE.Group();
if (DAY) sky.add(buildSun());
else {
  const n = 350;
  const pts = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = hash2(i, 1, 77) * Math.PI * 2;
    const y = 0.08 + hash2(i, 2, 77) * 0.92;
    const r = Math.sqrt(1 - y * y);
    pts[i * 3] = Math.cos(a) * r * 300;
    pts[i * 3 + 1] = y * 300;
    pts[i * 3 + 2] = Math.sin(a) * r * 300;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  sky.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0x9fb0d0,
        size: 1.6,
        sizeAttenuation: false,
        fog: false,
        transparent: true,
        opacity: 0.7,
      }),
    ),
  );
  sky.add(buildMoon());
}
scene.add(sky);

const forest = new Forest();
scene.add(forest.group);
// Scanned rocks load in the background; if they can't, fall back to the plain procedural one.
loadRocks()
  .then((rocks) => forest.setRocks(rocks))
  .catch((err) => {
    console.warn('[rocks] failed to load, using fallback', err);
    forest.setRocks([{ geo: buildRock(), mat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), gain: 1 }]);
  });

// The scanned plants load in the background too; until they arrive (or if they can't) that ground cover is simply missing.
loadPlants({ name: 'grass_medium_01', scale: [5, 5, 5], triangles: 400, maxError: 0.02 })
  .then((variants) => forest.setScattered('grass', variants))
  .catch((err) => console.warn('[grass] failed to load', err));
loadPlants({ name: 'celandine_01', scale: [6, 3, 6], triangles: 300, maxError: 0.05 })
  .then((variants) => forest.setScattered('celandine', variants))
  .catch((err) => console.warn('[celandine] failed to load', err));

const player = new Player(
  canvas,
  document.getElementById('stick-base') as HTMLElement,
  document.getElementById('stick-knob') as HTMLElement,
);
const dog = new Dog();
dog.alarms = HORROR;
{
  // ?distraction=0..1 sets how easily the dog gets sidetracked (0.5 if left out), and ?playful=0..1 how playful she is (0.7).
  const params = new URLSearchParams(location.search);
  const level = (name: string, fallback: number) => {
    const asked = parseFloat(params.get(name) ?? '');
    return Number.isFinite(asked) ? asked : fallback;
  };
  dog.distraction = level('distraction', 0.5);
  dog.playfulness = level('playful', 0.7);
}
scene.add(dog.group);
const lurker = new Lurker();
scene.add(lurker.group);
const stalker = new Stalker();
scene.add(stalker.group);
stalker.group.visible = HORROR;
const audio = new GameAudio();
audio.twigSnaps = HORROR;
audio.calm = DAY;
const game = new GameState();
const battery = new Battery();
const batteryHud = new BatteryHud(batteryEl);
battery.onDead = () => {
  audio.snap(1, 0);
  audio.crowFlock();
};

player.yaw = 0;
dog.reset(player);

player.onStep = (sprinting) => {
  audio.step(sprinting ? 0.5 : 0.34, 0.85 + Math.random() * 0.3, Math.random() < 0.5 ? -0.1 : 0.1);
};
player.onJump = () => audio.step(0.25, 0.7, 0);
player.onLand = () => audio.step(0.55, 0.6, 0);
player.onGrab = () => audio.step(0.3, 0.55, 0);
player.onRung = () => audio.step(0.14, 0.7 + Math.random() * 0.2, 0);
dog.onStep = () => {
  const dx = dog.pos.x - player.pos.x;
  const dz = dog.pos.z - player.pos.z;
  const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) * 0.5;
  audio.step(0.12, 1.3 + Math.random() * 0.3, pan);
};
stalker.onBlink = () => {
  battery.flicker(0.5);
  audio.snap(1, 0);
};
stalker.onStep = (dist, pan) => audio.snap(THREE.MathUtils.clamp(1.1 - dist / 22, 0.2, 1), pan);

let lastWhistle = 0;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyC' || e.repeat || !game.running || game.phase !== 'play') return;
  const now = performance.now();
  if (now - lastWhistle < 1200) return;
  lastWhistle = now;
  audio.whistle();
  dog.call();
});

let lurkerDelay = -1;
let lurkerHeading = 0;

dog.onAlertStart = (heading) => {
  audio.growl(5.5, Math.sin(heading - player.yaw) * -0.6);
  battery.flicker(0.7);
  if (Math.random() < 0.5) audio.crowFlock();
  lurkerHeading = heading;
  lurkerDelay = 1.6;
};
dog.onAlertEnd = () => {
  lurkerDelay = -1;
  window.setTimeout(() => lurker.hide(), 2500);
};

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  dog.followAngle = THREE.MathUtils.clamp(halfH * 0.4, 0.2, 0.4);
}
window.addEventListener('resize', resize);
resize();

let growlT = 0;
let lastTime = performance.now();

function showOverlay(title: string, sub: string, button: string): void {
  titleEl.textContent = title;
  subEl.textContent = sub;
  startBtn.textContent = button;
  overlay.classList.remove('hidden');
}

function endRun(): void {
  game.running = false;
  player.releaseInput();
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Fresh night. We stay where we are; the map is a walled disc around the start. */
function resetRun(): void {
  game.reset();
  battery.reset();
  batteryHud.reset(battery);
  growlT = 0;
  player.frozen = false;
  player.dismount();
  player.stamina = 1;
  player.pitch = 0;
  stalker.reset();
  lurker.hide();
  lurkerDelay = -1;
  dog.threatHeading = null;
  dog.reset(player);
  flashEl.style.opacity = '0';
  audio.setAmbient(1);
  applyAtmosphere(0, 0);
}

function begin(): void {
  if (game.phase !== 'play') resetRun();
  audio.start();
  audio.resume();
  overlay.classList.add('hidden');
  game.running = true;
  lastTime = performance.now();
  if (!isTouch) void canvas.requestPointerLock?.();
}

function pause(): void {
  if (!game.running || game.phase !== 'play') return;
  endRun();
  audio.pause();
  showOverlay('PAUSED', DAY ? 'Take your time.' : 'It is still out there.', 'Resume');
}

climbEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  player.requestClimb();
});
startBtn.addEventListener('click', begin);
document.addEventListener('pointerlockchange', () => {
  if (!isTouch && document.pointerLockElement !== canvas) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function caught(): void {
  game.caught();
  player.frozen = true;
  stalker.placeInFront(player);
  dog.threatHeading = null;
  lurker.hide();
  audio.scream();
  audio.setAmbient(0);
}

const tmpColor = new THREE.Color();
function applyAtmosphere(threat: number, dawn: number): void {
  if (DAY) return;
  tmpColor.copy(NIGHT_COLOR).lerp(DAWN_COLOR, dawn);
  (scene.background as THREE.Color).copy(tmpColor);
  const fog = scene.fog as THREE.FogExp2;
  fog.color.copy(tmpColor);
  fog.density = THREE.MathUtils.lerp(FOG_DENSITY + threat * 0.022, 0.016, dawn);
  hemi.intensity = 1.1 + dawn * 2.2;
  vignetteEl.style.setProperty('--t', (threat * (1 - dawn)).toFixed(3));
}

const stats = createStats(renderer, scene);

function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (game.running) {
    if (game.phase === 'play') updatePlay(dt);
    else if (game.phase === 'caught') updateCaught(dt);
    sky.position.copy(camera.position);
  }

  renderer.render(scene, camera);
  stats.update();
}

function updatePlay(dt: number): void {
  game.tick(dt);
  const { progress } = game;
  const dawn = HORROR ? game.dawn : 0;

  player.update(dt, forest);
  forest.update(player.pos.x, player.pos.z);
  dog.update(dt, player, forest);
  player.applyToCamera(camera);

  if (HORROR && stalker.update(dt, player, camera, progress, dawn > 0)) {
    caught();
    return;
  }
  const threat = HORROR ? stalker.threat : 0;

  if (stalker.active && threat > 0.04) {
    const sp = stalker.group.position;
    dog.threatHeading = Math.atan2(sp.x - dog.pos.x, sp.z - dog.pos.z);
    growlT -= dt;
    if (growlT <= 0) {
      audio.growl(4.5, 0.3, 0.35 + 0.65 * threat);
      growlT = 4;
    }
  } else {
    dog.threatHeading = null;
    growlT = 0;
  }
  audio.setAmbient(stalker.active ? 1 - 0.8 * threat : 1);
  if (stalker.active && lurker.visible) {
    lurker.hide();
    lurkerDelay = -1;
  }

  if (lurkerDelay >= 0) {
    lurkerDelay -= dt;
    if (lurkerDelay < 0) {
      const d = 13 + Math.random() * 5;
      lurker.show(dog.pos.x + Math.sin(lurkerHeading) * d, dog.pos.z + Math.cos(lurkerHeading) * d);
    }
  }
  lurker.update(dt, camera);
  audio.tick(dt, threat);
  applyAtmosphere(threat, dawn);

  if (!DAY) {
    flashlight.intensity = FLASH_BASE * battery.update(dt, threat);
    batteryHud.update(battery);
  }

  if (threat > 0.3) {
    const s = (threat - 0.3) * 0.012;
    camera.rotation.x += (Math.random() - 0.5) * s;
    camera.rotation.y += (Math.random() - 0.5) * s;
  }

  const climbHint = player.climbing ? 'let go' : player.climbTarget(forest) ? 'climb' : '';
  if (climbEl.dataset.mode !== climbHint) {
    climbEl.dataset.mode = climbHint;
    climbEl.textContent = climbHint ? (isTouch ? climbHint : `E · ${climbHint}`) : '';
    climbEl.classList.toggle('show', climbHint !== '');
  }
  staminaBar.style.transform = `scaleX(${player.stamina.toFixed(3)})`;
  staminaEl.style.opacity = player.stamina < 0.98 ? '1' : '0';

  if (HORROR && game.survived) {
    game.win();
    stalker.retreat(1e9);
    dog.threatHeading = null;
    endRun();
    flashEl.style.opacity = '0';
    showOverlay(
      'DAWN',
      'You made it out of the woods. The dog wags its tail. It is still staring at the trees.',
      'Walk again',
    );
  }
}

function updateCaught(dt: number): void {
  game.caughtT += dt;
  stalker.shake(0.05 + game.caughtT * 0.04);
  player.pitch = approach(player.pitch, 0.42, 14, dt);
  player.applyToCamera(camera);
  camera.rotation.z += (Math.random() - 0.5) * 0.08;
  flashlight.intensity = FLASH_BASE * (Math.random() < 0.5 ? 0.3 : 0.03);

  if (game.caughtT < 0.1) {
    flashEl.style.background = '#fff';
    flashEl.style.opacity = '1';
  } else {
    flashEl.style.background = '#6e0000';
    flashEl.style.opacity = (0.15 + Math.random() * 0.3).toFixed(2);
  }
  vignetteEl.style.setProperty('--t', '1');

  if (game.caughtT > 1.7) {
    flashEl.style.background = '#000';
    flashEl.style.opacity = '1';
    endRun();
    showOverlay('IT GOT YOU', 'The dog was trying to warn you.', 'Try again');
  }
}

applyAtmosphere(0, 0);
frame();

if (import.meta.env.DEV) {
  Object.assign(window, {
    __game: {
      forest,
      player,
      dog,
      lurker,
      stalker,
      game,
      battery,
      camera,
      renderer,
      skipTo: (t: number) => {
        game.elapsed = t;
      },
    },
  });
}
