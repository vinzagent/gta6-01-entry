// VICE HARBOR — Neon Tide. An original open-world crime game: a dusk island city of seven
// by seven blocks where you walk, steal cars, run missions for cash and try to shake the
// police as your wanted stars climb. Bust meter full or health empty ends the run; the
// stats screen is your scorecard. Everything simulated draws from one seeded stream, and
// the ?shot= scenes at the bottom play the real rules forward a fixed number of steps so a
// captured frame is the same every time.

import { Rng } from './rng.js';
import { buildCity, resolveCollisions, ringCorners, ROAD_LINES, GRID } from './city.js';
import {
  makeCarMesh, makePedMesh, makeTrafficCar, updateTrafficCar, makePoliceCar,
  updatePoliceCar, makePed, updatePed, knockPed, spinWheels,
} from './actors.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, claimReward } from './save.js';
import { Radio } from './radio.js';
import { AirSupport } from './airSupport.js';
import { CAR_CATALOG, catalogCar, buyCar, buyUpgrade, garageHtml, engineFactor, armorFactor } from './garage.js';
import { Weapons } from './weapons.js';
import { scatterPeds } from './actors.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number.parseInt(params.get('seed') || '7', 10) || 7;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.domElement.classList.add('gl');
renderer.setPixelRatio(SHOT ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1600);
camera.position.set(180, 60, 220);
camera.lookAt(0, 0, 0);

const { colliders, blockKinds } = buildCity(scene, new Rng(4242));
const hud = new Hud();
const sfx = new Sfx();

// v2 persistent layer: the save is loaded once at boot and mirrored back on every
// change, so cash, story progress, the garage and ammo survive reloads and busts.
const save = loadSave();
const radio = new Radio(sfx);
radio.setStation(save.station || 0);
const air = new AirSupport(scene);
const weapons = new Weapons(scene, save);

const game = {
  state: 'title',
  time: 0,
  cash: save.cash,
  save,
  radio,
  air,
  weapons,
  garageOpen: false,
  calledCar: null,
  health: 100,
  wanted: 0,
  lastSeen: -99,
  bustMeter: 0,
  inCar: false,
  playerCar: null,
  stats: { earned: 0, missions: 0, crimes: 0, time: 0, maxWanted: 0 },
  silent: Boolean(SHOT),
  missions: null,
  traffic: [],
  peds: [],
  police: [],
  parked: [],
  playerPos() {
    return this.inCar ? this.playerCar.mesh.position : player.mesh.position;
  },
  playerHeading() {
    return this.inCar ? this.playerCar.heading : player.heading;
  },
  addCash(n) {
    this.cash += n;
    if (n > 0) this.stats.earned += n;
    this.save.cash = this.cash;
    storeSave(this.save);
  },
  /**
   * Settle a finished mission against the save ledger: the reward for a mission id is
   * paid exactly once (claimReward), the chapter is marked complete, and everything
   * is persisted before the toast shows. Returns the amount actually paid.
   */
  completeMission(def, amount) {
    const paid = claimReward(this.save, def.id, amount);
    if (!this.save.completed.includes(def.id)) this.save.completed.push(def.id);
    this.save.missionsDone = this.save.completed.length;
    this.cash = this.save.cash;
    if (paid > 0) this.stats.earned += paid;
    storeSave(this.save);
    return paid;
  },
  toast(text) {
    if (!this.silent) hud.toast(text);
  },
  sfx,
};
game.missions = null; // set by resetWorld below

const player = {
  mesh: makePedMesh(new Rng(99), { hero: true }),
  heading: Math.PI,
  phase: 0,
  invuln: 0,
};
player.mesh.position.set(30, 0, -176);
scene.add(player.mesh);
const playerRing = new THREE.Mesh(
  new THREE.RingGeometry(0.75, 1.0, 24),
  new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
);
playerRing.rotation.x = -Math.PI / 2;
scene.add(playerRing);

let rng = new Rng(SEED * 1000 + 17);

function allCars() {
  const list = [...game.traffic, ...game.parked, ...game.police];
  if (game.inCar && game.playerCar) list.push(game.playerCar);
  return list;
}

function spawnWorld() {
  game.traffic = [];
  game.peds = [];
  game.parked = [];
  game.police = [];
  for (let i = 0; i < 14; i += 1) {
    game.traffic.push(makeTrafficCar(rng, scene, rng.int(0, GRID - 1), rng.int(0, GRID - 1)));
  }
  for (let i = 0; i < 16; i += 1) {
    game.peds.push(makePed(rng, scene, rng.int(0, GRID - 1), rng.int(0, GRID - 1)));
  }
  // Parked cars: a few on the lots, a couple near the spawn for a quick first steal.
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      if (blockKinds[j * GRID + i] !== 'parking') continue;
      const cx = (i - 3) * 72;
      const cz = (j - 3) * 72;
      for (let k = 0; k < 3; k += 1) {
        const mesh = makeCarMesh(rng.pick([0xd64545, 0x4574d6, 0x53c269, 0xe0a83c, 0xb8bcc4]));
        mesh.position.set(cx + rng.range(-18, 18), 0, cz + rng.range(-18, 18));
        const heading = rng.range(0, Math.PI * 2);
        mesh.rotation.y = heading;
        scene.add(mesh);
        game.parked.push({ kind: 'parked', mesh, heading, speed: 0, radius: 2.3, health: 100, stolen: false });
      }
    }
  }
  const starter = makeCarMesh(0xd64545);
  starter.position.set(47, 0, -176);
  starter.rotation.y = Math.PI / 2;
  scene.add(starter);
  game.parked.push({ kind: 'parked', mesh: starter, heading: Math.PI / 2, speed: 0, radius: 2.3, health: 100, stolen: false });
  game.missions = new Missions(scene, rng, save);
}

function despawnWorld() {
  for (const list of [game.traffic, game.peds, game.parked, game.police]) {
    for (const e of list) scene.remove(e.mesh);
  }
  if (game.playerCar && game.inCar) scene.remove(game.playerCar.mesh);
  if (game.missions) game.missions.clearMarkers();
}

function resetRun() {
  despawnWorld();
  rng = new Rng(SEED * 1000 + 17 + Math.floor(game.stats.time) + 1);
  game.cash = save.cash; // a bust costs the run, never the bank: the save endures
  if (air.active) air.recall(game);
  game.health = 100;
  game.wanted = 0;
  game.bustMeter = 0;
  game.inCar = false;
  game.playerCar = null;
  game.stats = { earned: 0, missions: 0, crimes: 0, time: 0, maxWanted: 0 };
  player.mesh.visible = true;
  player.mesh.position.set(30, 0, -176);
  player.heading = Math.PI;
  spawnWorld();
}

function addCrime(amount) {
  if (game.state !== 'play') return;
  game.wanted = Math.min(5, game.wanted + amount);
  game.stats.maxWanted = Math.max(game.stats.maxWanted, Math.ceil(game.wanted));
  game.stats.crimes += 1;
}

function damage(amount) {
  if (game.state !== 'play') return;
  game.health -= amount * armorFactor(save); // garage armour plating soaks its share
  if (game.health <= 0) {
    game.health = 0;
    endRun('wasted');
  }
}

/* ---------------- player movement ---------------- */

const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  sfx.unlock();
  if (e.code === 'Enter' && game.state === 'title') startGame();
  if (e.code === 'KeyE' && game.state === 'play') toggleCar();
  if (e.code === 'KeyQ' && game.state === 'play') cycleRadio();
  if (e.code === 'KeyG' && (game.state === 'play' || game.garageOpen)) toggleGarage();
  if (e.code === 'KeyF' && game.state === 'play' && !game.inCar) firePistol();
  if ((e.code === 'KeyP' || e.code === 'Escape') && (game.state === 'play' || game.state === 'pause')) togglePause();
  if (e.code === 'KeyR' && (game.state === 'busted' || game.state === 'wasted')) restart();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('pointerdown', () => {
  sfx.unlock();
  if (game.state === 'title') startGame();
  else if (game.state === 'busted' || game.state === 'wasted') restart();
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- v2 systems: radio, garage, pistol ---------------- */

function cycleRadio() {
  const st = radio.next();
  save.station = radio.index;
  storeSave(save);
  radio.start();
  game.toast(`♪ ${st.name} — ${st.genre}`);
}

function firePistol() {
  const before = save.ammo;
  const hit = weapons.fire(game, player.mesh.position, player.heading);
  if (save.ammo < before) {
    addCrime(hit && hit.kind === 'police' ? 1.6 : 0.9); // shots fired are never free
    storeSave(save);
  }
}

const garageEl = document.getElementById('garage');
const garagePanel = document.getElementById('garage-panel');

function renderGarage() {
  garagePanel.innerHTML = garageHtml(save) +
    `<div class="shop-row"><span><b>Ammo Box</b> — 12 pistol rounds for the pouch</span><button data-buy-ammo="1">BUY $60</button></div>` +
    CAR_CATALOG.filter((c) => save.ownedCars.includes(c.id)).map((c) =>
      `<div class="shop-row"><span><b>${c.name}</b> — parked in your garage</span><button data-call-car="${c.id}">CALL IT OUT</button></div>`).join('');
}

function toggleGarage() {
  game.garageOpen = !game.garageOpen;
  garageEl.classList.toggle('hidden', !game.garageOpen);
  if (game.garageOpen) renderGarage();
}

function callOutCar(carId) {
  const spec = catalogCar(carId);
  if (game.calledCar) {
    scene.remove(game.calledCar.mesh);
    game.parked = game.parked.filter((c) => c !== game.calledCar);
  }
  const mesh = makeCarMesh(spec.color);
  const p = game.playerPos();
  mesh.position.set(p.x + 4.5, 0, p.z + 2);
  mesh.rotation.y = Math.PI / 2;
  scene.add(mesh);
  const car = { kind: 'parked', mesh, heading: Math.PI / 2, speed: 0, radius: 2.3, health: 100, stolen: true, topSpeed: spec.topSpeed };
  game.parked.push(car);
  game.calledCar = car;
  game.toast(`${spec.name} rolled out beside you — E to drive`);
}

garagePanel.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  let result = null;
  if (btn.dataset.buyCar) result = buyCar(save, btn.dataset.buyCar);
  else if (btn.dataset.buyUpgrade) result = buyUpgrade(save, btn.dataset.buyUpgrade);
  else if (btn.dataset.buyAmmo) result = weapons.buyAmmo(save);
  else if (btn.dataset.callCar) { callOutCar(btn.dataset.callCar); toggleGarage(); return; }
  if (result) {
    game.cash = save.cash;
    storeSave(save);
    game.toast(result.line);
    renderGarage();
  }
});

function nearestCar(maxDist) {
  const pos = player.mesh.position;
  let best = null;
  let bestD = maxDist;
  for (const car of [...game.traffic, ...game.parked]) {
    const d = Math.hypot(car.mesh.position.x - pos.x, car.mesh.position.z - pos.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function toggleCar() {
  if (game.inCar) {
    const car = game.playerCar;
    const h = car.heading;
    player.mesh.position.set(
      car.mesh.position.x + Math.cos(h) * 2.6,
      0,
      car.mesh.position.z - Math.sin(h) * 2.6,
    );
    player.heading = h;
    player.mesh.visible = true;
    car.speed = 0;
    car.kind = 'parked';
    game.parked.push(car);
    game.playerCar = null;
    game.inCar = false;
    sfx.setEngine(0, 0);
  } else {
    const car = nearestCar(3.6);
    if (!car) return;
    game.traffic = game.traffic.filter((c) => c !== car);
    game.parked = game.parked.filter((c) => c !== car);
    car.kind = 'player';
    game.playerCar = car;
    game.inCar = true;
    player.mesh.visible = false;
    if (!car.stolen) {
      car.stolen = true;
      addCrime(1);
      game.toast('Vehicle stolen — the law noticed');
    }
  }
}

function updatePlayerFoot(dt) {
  const turn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  player.heading += turn * 2.7 * dt;
  const run = keys.ShiftLeft || keys.ShiftRight;
  let vel = 0;
  if (keys.KeyW || keys.ArrowUp) vel = run ? 10.5 : 6.8;
  if (keys.KeyS || keys.ArrowDown) vel = -4;
  const pos = player.mesh.position;
  pos.x += Math.sin(player.heading) * vel * dt;
  pos.z += Math.cos(player.heading) * vel * dt;
  resolveCollisions(colliders, pos, 0.55);
  player.mesh.rotation.y = player.heading;
  player.phase += dt * (vel !== 0 ? Math.abs(vel) * 1.35 : 0);
  const swing = vel !== 0 ? Math.sin(player.phase) * 0.55 : 0;
  player.mesh.userData.legL.rotation.x = swing;
  player.mesh.userData.legR.rotation.x = -swing;
  player.mesh.userData.armL.rotation.x = -swing * 0.7;
  player.mesh.userData.armR.rotation.x = swing * 0.7;
  if (player.invuln > 0) player.invuln -= dt;
}

function updatePlayerCar(dt) {
  const car = game.playerCar;
  const pos = car.mesh.position;
  const throttle = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const steerIn = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  const brake = keys.Space;
  if (throttle !== 0) car.speed += throttle * (throttle > 0 ? 15.5 : 10.5) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 4.5 * dt);
  car.speed -= car.speed * 0.32 * dt;
  if (brake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 30 * dt);
  // Each car's own ceiling, raised fleet-wide by the garage engine tune.
  const ceiling = (car.topSpeed || 31) * engineFactor(save);
  car.speed = Math.max(-10, Math.min(ceiling, car.speed));
  const grip = Math.min(1, Math.abs(car.speed) / 7);
  car.heading += steerIn * (brake ? 2.4 : 1.75) * grip * Math.sign(car.speed || 1) * dt;
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  const hit = resolveCollisions(colliders, pos, car.radius);
  if (hit > 0.02) {
    if (Math.abs(car.speed) > 6.5) {
      damage(Math.abs(car.speed) * 0.5);
      sfx.crash(Math.min(1, Math.abs(car.speed) / 26));
      car.speed *= -0.22;
    } else {
      car.speed *= 0.45;
    }
  }
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
}

/* ---------------- world interactions ---------------- */

function carCarCollisions() {
  const cars = allCars();
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const pa = a.mesh.position;
      const pb = b.mesh.position;
      const dx = pb.x - pa.x;
      const dz = pb.z - pa.z;
      const d = Math.hypot(dx, dz);
      const min = 3.6;
      if (d === 0 || d >= min) continue;
      const push = (min - d) / 2;
      const nx = dx / d;
      const nz = dz / d;
      pa.x -= nx * push;
      pa.z -= nz * push;
      pb.x += nx * push;
      pb.z += nz * push;
      const closing = Math.abs(a.speed) + Math.abs(b.speed);
      const playerInvolved = game.inCar && (a === game.playerCar || b === game.playerCar);
      if (closing > 6) {
        a.speed *= 0.5;
        b.speed *= 0.5;
        if (playerInvolved) {
          const other = a === game.playerCar ? b : a;
          damage(closing * 0.34);
          sfx.crash(Math.min(1, closing / 30));
          if (other.kind === 'police') addCrime(1.0);
          else if (other.kind === 'traffic' || other.kind === 'parked') addCrime(0.6);
        }
      } else {
        a.speed *= 0.82;
        b.speed *= 0.82;
      }
    }
  }
}

function pedHits() {
  const cars = allCars();
  for (const car of cars) {
    if (Math.abs(car.speed) < 3.5) continue;
    const cp = car.mesh.position;
    for (const ped of game.peds) {
      if (ped.down > 0) continue;
      const pp = ped.mesh.position;
      if (Math.hypot(pp.x - cp.x, pp.z - cp.z) < 1.8) {
        if (knockPed(ped)) {
          if (game.inCar && car === game.playerCar) {
            addCrime(1.6);
            game.toast('You flattened a pedestrian!');
            sfx.crash(0.35);
          }
        }
      }
    }
  }
  // The player on foot is not immune to traffic.
  if (!game.inCar && player.invuln <= 0) {
    const pp = player.mesh.position;
    for (const car of cars) {
      if (Math.abs(car.speed) < 4) continue;
      const cp = car.mesh.position;
      const dx = pp.x - cp.x;
      const dz = pp.z - cp.z;
      if (Math.hypot(dx, dz) < 2.0) {
        damage(15);
        sfx.crash(0.5);
        const d = Math.max(0.4, Math.hypot(dx, dz));
        pp.x += (dx / d) * 3;
        pp.z += (dz / d) * 3;
        player.invuln = 1.2;
        game.toast('Clipped by a car — watch the road!');
        break;
      }
    }
  }
}

function managePolice(dt) {
  const pos = game.playerPos();
  const want = game.wanted < 0.4 ? 0 : Math.min(5, Math.round(game.wanted));
  while (game.police.length < want) {
    const options = [];
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        const d = Math.hypot(x - pos.x, z - pos.z);
        if (d > 85 && d < 150) options.push({ x, z });
      }
    }
    const spot = options.length ? rng.pick(options) : { x: pos.x + 100, z: pos.z + 40 };
    const cop = makePoliceCar(scene, spot.x, spot.z);
    cop.flash = rng.range(0, 2);
    game.police.push(cop);
  }
  for (let i = game.police.length - 1; i >= 0; i -= 1) {
    const cop = game.police[i];
    const d = Math.hypot(cop.mesh.position.x - pos.x, cop.mesh.position.z - pos.z);
    if (d > 240 && game.police.length > want) {
      scene.remove(cop.mesh);
      game.police.splice(i, 1);
    }
  }
  for (const cop of game.police) updatePoliceCar(dt, cop, pos, colliders, game.time);
  // Seen / unseen drives the wanted decay.
  const seen = game.police.some((c) => Math.hypot(c.mesh.position.x - pos.x, c.mesh.position.z - pos.z) < 62);
  if (seen) game.lastSeen = game.time;
  if (game.wanted > 0 && game.time - game.lastSeen > 5) {
    game.wanted = Math.max(0, game.wanted - dt * 0.055);
  }
  // Bust meter: cops close in while you are slow or on foot and it fills.
  const nearCop = game.police.some((c) => Math.hypot(c.mesh.position.x - pos.x, c.mesh.position.z - pos.z) < (game.inCar ? 7.5 : 6));
  const vulnerable = !game.inCar || Math.abs(game.playerCar.speed) < 1.3;
  if (nearCop && vulnerable && game.wanted > 0.4) game.bustMeter += dt / 2.2;
  else game.bustMeter -= dt / 1.1;
  game.bustMeter = Math.max(0, Math.min(1, game.bustMeter));
  if (game.bustMeter >= 1) endRun('busted');
}

/* ---------------- run lifecycle ---------------- */

const titleEl = document.getElementById('title');
const endEl = document.getElementById('end');
const pauseEl = document.getElementById('pause');

function startGame() {
  titleEl.classList.add('hidden');
  game.state = 'play';
  radio.start(); // the context was unlocked by the same gesture that started the game
  if (save.completed.length > 0) game.toast(`Welcome back — ${save.completed.length} chapters done, garage saved`);
}

function togglePause() {
  if (game.state === 'play') {
    game.state = 'pause';
    pauseEl.classList.remove('hidden');
    sfx.setEngine(0, 0);
    sfx.setSiren(0);
  } else if (game.state === 'pause') {
    game.state = 'play';
    pauseEl.classList.add('hidden');
  }
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function endRun(kind) {
  game.state = kind;
  save.cash = game.cash;
  storeSave(save); // busted or wasted, the story and the garage carry over
  sfx.sting();
  sfx.setEngine(0, 0);
  sfx.setSiren(0);
  const title = document.getElementById('end-title');
  title.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  title.className = kind === 'busted' ? '' : 'wasted';
  document.getElementById('end-stats').innerHTML =
    `Cash earned <b>$${Math.floor(game.stats.earned)}</b> · Missions done <b>${game.stats.missions}</b><br>` +
    `Time on the streets <b>${fmtTime(game.stats.time)}</b> · Hottest heat <b>${'★'.repeat(game.stats.maxWanted) || '—'}</b><br>` +
    `Crimes committed <b>${game.stats.crimes}</b>`;
  endEl.classList.remove('hidden');
}

function restart() {
  endEl.classList.add('hidden');
  resetRun();
  game.state = 'play';
}

/* ---------------- camera ---------------- */

function updateCamera(dt, snap = false) {
  const target = game.playerPos();
  const heading = game.playerHeading();
  const dist = game.inCar ? 11.5 : 8.5;
  const height = game.inCar ? 5.2 : 4.4;
  const bx = target.x - Math.sin(heading) * dist;
  const bz = target.z - Math.cos(heading) * dist;
  const k = snap ? 1 : 1 - Math.exp(-dt * 4.2);
  camera.position.x += (bx - camera.position.x) * k;
  camera.position.z += (bz - camera.position.z) * k;
  camera.position.y += (height - camera.position.y) * k;
  camera.lookAt(
    target.x + Math.sin(heading) * 5,
    1.7,
    target.z + Math.cos(heading) * 5,
  );
}

/* ---------------- the step ---------------- */

function step(dt, auto = false) {
  game.time += dt;
  if (game.state === 'play') game.stats.time += dt;
  if (game.inCar) {
    if (auto) updateTrafficCar(dt, game.playerCar, allCars(), colliders);
    else updatePlayerCar(dt);
  } else if (!auto) {
    updatePlayerFoot(dt);
  }
  for (const car of game.traffic) updateTrafficCar(dt, car, allCars(), colliders);
  for (const ped of game.peds) updatePed(dt, ped);
  if (game.state === 'play') {
    carCarCollisions();
    pedHits();
    managePolice(dt);
    air.update(dt, game);
    weapons.update(dt);
    if (air.active && air.lightsPlayer(game)) {
      const pool = air.mesh.userData.pool.position;
      scatterPeds(game.peds, pool.x, pool.z, 11); // the crowd breaks from the light
    }
    game.missions.update(dt, game, game.time);
    // Context prompt + audio state.
    if (!game.inCar) {
      hud.setPrompt(nearestCar(3.6) ? 'E — STEAL THE RIDE' : null);
    } else {
      hud.setPrompt(null);
    }
    if (!SHOT) {
      if (game.inCar) sfx.setEngine(1, Math.abs(game.playerCar.speed) / 31);
      else sfx.setEngine(0, 0);
      let nearest = 999;
      const pos = game.playerPos();
      for (const cop of game.police) {
        nearest = Math.min(nearest, Math.hypot(cop.mesh.position.x - pos.x, cop.mesh.position.z - pos.z));
      }
      sfx.setSiren(Math.max(0, 1 - nearest / 75));
    }
  }
  playerRing.position.set(player.mesh.position.x, 0.07, player.mesh.position.z);
  playerRing.visible = !game.inCar;
}

function idleStep(dt) {
  game.time += dt;
  for (const car of game.traffic) updateTrafficCar(dt, car, allCars(), colliders);
  for (const ped of game.peds) updatePed(dt, ped);
}

/* ---------------- screenshot scenes ---------------- */

function snapChaseCamera(wide = false) {
  updateCamera(0, true);
  // Pull the framed shot a little wider and higher than the gameplay camera; the chase
  // framing pulls well back so the police trailing the player stay in the picture.
  const t = game.playerPos();
  const pull = wide ? 0.55 : 0.08;
  camera.position.x += (camera.position.x - t.x) * pull;
  camera.position.z += (camera.position.z - t.z) * pull;
  camera.position.y += wide ? 3.6 : 1.2;
  camera.lookAt(
    t.x + Math.sin(game.playerHeading()) * 5,
    1.7,
    t.z + Math.cos(game.playerHeading()) * 5,
  );
}

function setupShot(name) {
  const DT = 1 / 30;
  document.getElementById('hud').style.visibility = name === 'title' ? 'hidden' : 'visible';
  if (name === 'title') {
    game.state = 'title';
    for (let i = 0; i < 90; i += 1) idleStep(DT);
    camera.position.set(172, 42, 198);
    camera.lookAt(-30, 12, -50);
  } else if (name === 'play' || name === 'chase') {
    const chaseScene = name === 'chase';
    game.state = 'play';
    titleEl.classList.add('hidden');
    const mesh = makeCarMesh(chaseScene ? 0x4574d6 : 0xd64545);
    mesh.position.set(36, 0, chaseScene ? -108 : -180);
    scene.add(mesh);
    const car = {
      kind: 'player', mesh, heading: Math.PI / 2, speed: chaseScene ? 17 : 12,
      corners: ringCorners(4, chaseScene ? 2 : 1), wp: 0, cruise: 14.5, radius: 2.3, health: 100, stolen: true,
    };
    car.heading = Math.PI / 2;
    game.playerCar = car;
    game.inCar = true;
    player.mesh.visible = false;
    game.cash = chaseScene ? 1120 : 640;
    game.health = chaseScene ? 64 : 88;
    if (chaseScene) {
      game.wanted = 4.3; // four-plus stars: SKYHAWK-1 dispatches during the stepped scene
      game.stats.maxWanted = 5;
      for (const [px, pz] of [[8, -118], [-16, -104], [2, -88]]) {
        const cop = makePoliceCar(scene, px, pz);
        cop.flash = game.police.length * 0.6;
        cop.speed = 15;
        game.police.push(cop);
      }
    }
    game.missions.beginNext(game);
    const steps = chaseScene ? 105 : 150;
    for (let i = 0; i < steps; i += 1) step(DT, true);
    if (chaseScene) {
      // Front-quarter framing: from behind, the pursuers hide in the camera's blind spot,
      // so the chase shot looks back down the pursuit line instead.
      const t = game.playerPos();
      const h = game.playerHeading();
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      // Stay over the road: mostly ahead of the player, only a few units to the side.
      camera.position.set(t.x + fx * 16 + fz * 5, 6.5, t.z + fz * 16 - fx * 5);
      camera.lookAt(t.x - fx * 8, 1.2, t.z - fz * 8);
    } else {
      snapChaseCamera(false);
    }
    hud.update(0, game);
  } else if (name === 'busted') {
    game.state = 'play';
    titleEl.classList.add('hidden');
    game.cash = 1875;
    game.health = 41;
    game.wanted = 4;
    game.stats = { earned: 1875, missions: 3, crimes: 6, time: 154, maxWanted: 4 };
    player.mesh.position.set(36, 0, -36);
    player.heading = 2.5;
    player.mesh.rotation.y = 2.5;
    for (const [px, pz, ph] of [[29, -43, 0.8], [44, -41, -0.7], [37, -26, 3.0]]) {
      const cop = makePoliceCar(scene, px, pz);
      cop.heading = ph;
      cop.mesh.rotation.y = ph;
      game.police.push(cop);
    }
    for (let i = 0; i < 24; i += 1) idleStep(DT);
    endRun('busted');
    camera.position.set(47, 6.5, -22);
    camera.lookAt(36, 1.2, -36);
    hud.update(0, game);
  }
  renderer.render(scene, camera);
  window.__shotReady = true;
}

/* ---------------- boot ---------------- */

// A small debug handle for tooling (screenshot scripts read positions from it).
window.__vice = { game, player, camera, scene };

spawnWorld();
if (SHOT) {
  setupShot(SHOT);
} else {
  let last = performance.now();
  const frame = (now) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (game.state === 'play') {
      step(dt);
      updateCamera(dt);
      hud.update(dt, game);
    } else if (game.state === 'title') {
      idleStep(dt);
      const t = game.time * 0.045;
      camera.position.set(Math.sin(t) * 205, 52, Math.cos(t) * 205);
      camera.lookAt(0, 8, 0);
    } else if (game.state === 'busted' || game.state === 'wasted') {
      idleStep(dt);
    }
    renderer.render(scene, camera);
  };
  requestAnimationFrame(frame);
}
