import './style.css';
import * as THREE from 'three';
import { Forest } from './forest';
import { buildRock } from './groundcover';
import { loadRocks } from './rocks';
import { Player } from './player';
import { Dog } from './dog';
import { Lurker } from './lurker';
import { Stalker } from './stalker';
import { GameAudio } from './audio';
import { hash2 } from './rng';
import { buildMoon } from './moon';

const FOG_COLOR = 0x06090c;
const FLASH_BASE = 260;
const FOG_DENSITY = 0.052;
const DAWN_COLOR = new THREE.Color(0x5b6f80);
const NIGHT_COLOR = new THREE.Color(FOG_COLOR);
/** Seconds you have to survive. */
const NIGHT_LENGTH = 360;
const DAWN_FADE = 30;

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlay = document.getElementById('overlay') as HTMLElement;
const titleEl = document.getElementById('title') as HTMLElement;
const subEl = document.getElementById('sub') as HTMLElement;
const vignetteEl = document.getElementById('vignette') as HTMLElement;
const flashEl = document.getElementById('flash') as HTMLElement;
const staminaEl = document.getElementById('stamina') as HTMLElement;
const staminaBar = staminaEl.firstElementChild as HTMLElement;
const startBtn = document.getElementById('start') as HTMLButtonElement;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
document.body.classList.toggle('touch', isTouch);

// --- renderer / scene ---
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Compress hot spots so things close to the flashlight do not clip to white.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(FOG_COLOR);
scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 500);
scene.add(camera);

// --- lighting: dim moon + cold ambient + a flashlight ---
const hemi = new THREE.HemisphereLight(0x3a4f70, 0x0a0f0a, 1.1);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0x6f86b8, 0.9);
moonLight.position.set(-30, 40, -45);
scene.add(moonLight);

const flashlight = new THREE.SpotLight(0xffe8c4, FLASH_BASE, 34, 0.62, 1, 1.3);
flashlight.position.set(0.15, -0.12, 0);
flashlight.target.position.set(0, -0.05, -6);
camera.add(flashlight, flashlight.target);

// --- sky: stars and a pale moon, pinned to the camera ---
const sky = new THREE.Group();
{
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

// --- world + actors ---
const forest = new Forest();
scene.add(forest.group);
// Scanned rocks load in the background; if they can't, fall back to the plain procedural one.
loadRocks()
  .then((rocks) => forest.setRocks(rocks))
  .catch((err) => {
    console.warn('[rocks] failed to load, using fallback', err);
    forest.setRocks([{ geo: buildRock(), mat: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), gain: 1 }]);
  });

const player = new Player(
  canvas,
  document.getElementById('stick-base') as HTMLElement,
  document.getElementById('stick-knob') as HTMLElement,
);
const dog = new Dog();
scene.add(dog.group);
const lurker = new Lurker();
scene.add(lurker.group);
const stalker = new Stalker();
scene.add(stalker.group);
const audio = new GameAudio();

player.yaw = 0;
dog.reset(player);

player.onStep = (sprinting) => {
  audio.step(sprinting ? 0.5 : 0.34, 0.85 + Math.random() * 0.3, Math.random() < 0.5 ? -0.1 : 0.1);
};
player.onJump = () => audio.step(0.25, 0.7, 0);
player.onLand = () => audio.step(0.55, 0.6, 0);
dog.onStep = () => {
  const dx = dog.pos.x - player.pos.x;
  const dz = dog.pos.z - player.pos.z;
  // Pan by which side of the view the dog is on.
  const pan = (dx * Math.cos(player.yaw) - dz * Math.sin(player.yaw)) * 0.5;
  audio.step(0.12, 1.3 + Math.random() * 0.3, pan);
};
stalker.onBlink = () => {
  flickerT = 0.5;
  audio.snap(1, 0);
};
stalker.onStep = (dist, pan) => audio.snap(THREE.MathUtils.clamp(1.1 - dist / 22, 0.2, 1), pan);

let flickerT = 0;
let nextFlicker = 40 + Math.random() * 30;
let lurkerDelay = -1;
let lurkerHeading = 0;

// False alarms: the dog stares at nothing and a pair of eyes shows up. Only the stalker can hurt you.
dog.onAlertStart = (heading) => {
  audio.growl(5.5, Math.sin(heading - player.yaw) * -0.6);
  flickerT = 0.7;
  lurkerHeading = heading;
  lurkerDelay = 1.6;
};
dog.onAlertEnd = () => {
  lurkerDelay = -1;
  window.setTimeout(() => lurker.hide(), 2500);
};

// --- sizing ---
function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // Keep the dog inside the frame on narrow (portrait) screens too.
  const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  dog.followAngle = THREE.MathUtils.clamp(halfH * 0.4, 0.2, 0.4);
}
window.addEventListener('resize', resize);
resize();

// --- run state ---
type Phase = 'play' | 'caught' | 'won';
let phase: Phase = 'play';
let running = false;
let elapsed = 0;
let caughtT = 0;
let growlT = 0;
let lastTime = performance.now();

function showOverlay(title: string, sub: string, button: string): void {
  titleEl.textContent = title;
  subEl.textContent = sub;
  startBtn.textContent = button;
  overlay.classList.remove('hidden');
}

function endRun(): void {
  running = false;
  player.releaseInput();
  if (document.pointerLockElement) document.exitPointerLock();
}

/** Fresh night. The forest is endless so we stay where we are. */
function resetRun(): void {
  phase = 'play';
  elapsed = 0;
  caughtT = 0;
  growlT = 0;
  player.frozen = false;
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
  if (phase !== 'play') resetRun();
  audio.start();
  audio.resume();
  overlay.classList.add('hidden');
  running = true;
  lastTime = performance.now();
  if (!isTouch) void canvas.requestPointerLock?.();
}

function pause(): void {
  if (!running || phase !== 'play') return;
  endRun();
  audio.pause();
  showOverlay('PAUSED', 'It is still out there.', 'Resume');
}

startBtn.addEventListener('click', begin);
document.addEventListener('pointerlockchange', () => {
  if (!isTouch && document.pointerLockElement !== canvas) pause();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function caught(): void {
  phase = 'caught';
  caughtT = 0;
  player.frozen = true;
  stalker.placeInFront(player);
  dog.threatHeading = null;
  lurker.hide();
  audio.scream();
  audio.setAmbient(0);
}

/** Fog, sky and light respond to how close the stalker is and how near dawn is. */
const tmpColor = new THREE.Color();
function applyAtmosphere(threat: number, dawn: number): void {
  tmpColor.copy(NIGHT_COLOR).lerp(DAWN_COLOR, dawn);
  (scene.background as THREE.Color).copy(tmpColor);
  const fog = scene.fog as THREE.FogExp2;
  fog.color.copy(tmpColor);
  fog.density = THREE.MathUtils.lerp(FOG_DENSITY + threat * 0.022, 0.016, dawn);
  hemi.intensity = 1.1 + dawn * 2.2;
  vignetteEl.style.setProperty('--t', (threat * (1 - dawn)).toFixed(3));
}

// --- main loop ---
function frame(): void {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (running) {
    if (phase === 'play') updatePlay(dt);
    else if (phase === 'caught') updateCaught(dt);
    sky.position.copy(camera.position);
  }

  renderer.render(scene, camera);
}

function updatePlay(dt: number): void {
  elapsed += dt;
  const progress = Math.min(1, elapsed / NIGHT_LENGTH);
  const dawn = THREE.MathUtils.clamp((elapsed - (NIGHT_LENGTH - DAWN_FADE)) / DAWN_FADE, 0, 1);

  player.update(dt, forest);
  forest.update(player.pos.x, player.pos.z);
  dog.update(dt, player, forest);
  player.applyToCamera(camera);

  if (stalker.update(dt, player, camera, progress, dawn > 0)) {
    caught();
    return;
  }
  const threat = stalker.threat;

  // The dog knows first. It stares at the stalker and growls harder the closer it gets.
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

  // Flashlight: faint wobble, a scheduled stutter, and panicky flicker as the stalker closes in.
  nextFlicker -= dt;
  if (nextFlicker <= 0) {
    flickerT = 0.5;
    nextFlicker = 45 + Math.random() * 40;
  }
  if (flickerT <= 0 && Math.random() < threat * threat * 0.05) flickerT = 0.12 + Math.random() * 0.25;
  let k = 0.96 + 0.04 * Math.sin(elapsed * 23) * Math.sin(elapsed * 7.3);
  if (flickerT > 0) {
    flickerT -= dt;
    k *= Math.random() < 0.5 ? 1 : 0.12;
  }
  flashlight.intensity = FLASH_BASE * k;

  // Your own nerves: the view trembles as it gets close.
  if (threat > 0.3) {
    const s = (threat - 0.3) * 0.012;
    camera.rotation.x += (Math.random() - 0.5) * s;
    camera.rotation.y += (Math.random() - 0.5) * s;
  }

  staminaBar.style.transform = `scaleX(${player.stamina.toFixed(3)})`;
  staminaEl.style.opacity = player.stamina < 0.98 ? '1' : '0';

  if (elapsed >= NIGHT_LENGTH) {
    phase = 'won';
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
  caughtT += dt;
  stalker.shake(0.05 + caughtT * 0.04);
  // Snap your view up into its face and hold it there.
  player.pitch += (0.42 - player.pitch) * Math.min(1, dt * 14);
  player.applyToCamera(camera);
  camera.rotation.z += (Math.random() - 0.5) * 0.08;
  flashlight.intensity = FLASH_BASE * (Math.random() < 0.5 ? 0.3 : 0.03);

  if (caughtT < 0.1) {
    flashEl.style.background = '#fff';
    flashEl.style.opacity = '1';
  } else {
    flashEl.style.background = '#6e0000';
    flashEl.style.opacity = (0.15 + Math.random() * 0.3).toFixed(2);
  }
  vignetteEl.style.setProperty('--t', '1');

  if (caughtT > 1.7) {
    flashEl.style.background = '#000';
    flashEl.style.opacity = '1';
    endRun();
    showOverlay('IT GOT YOU', 'The dog was trying to warn you.', 'Try again');
  }
}

// Reset fog/sky to the opening state in case the page is restored mid-run.
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
      camera,
      renderer,
      skipTo: (t: number) => {
        elapsed = t;
      },
    },
  });
}
