// Hidden packages for Vice Harbor: twenty glowing cash crates stashed around the
// city's landmarks — rooftops, alleys, the docks, the helipad and the beach rim.
// Each crate throws a thin beacon of neon light into the sky so a sharp eye can
// spot it from two blocks away. Drive or walk into the beacon's pool of light to
// grab the stash: every package pays out $75 in loose cash, the running total is
// shown on the HUD chip, and the found set is written into the persistent save
// so a reload, a bust or a wasted run never hands a crate back. Collect all
// twenty and the city pays a one-time $1,000 completion bonus under the banner
// "ALL PACKAGES FOUND". The beacon check is deliberately plan-distance only:
// a rooftop stash is collected from the street directly below its light, which
// keeps every one of the twenty reachable on foot or in a car.

import { storeSave } from './save.js';

export const PACKAGE_TOTAL = 20;
export const PACKAGE_REWARD = 75;
export const PACKAGE_BONUS = 1000;
const PICKUP_RADIUS = 3.6;
const BEACON_HEIGHT = 26;

// The twenty stash spots. x/z are world coordinates inside the island span
// (roads run at ±36/±108/±180/±248, blocks sit between them); y is the height
// the crate visually rests at — street level for alleys and docks, higher for
// the rooftop and helipad stashes whose beacons are grabbed from below.
export const PACKAGE_SPOTS = [
  { name: 'Helipad Cache', x: 180, z: -180, y: 15 },
  { name: 'North Dock Crate', x: 108, z: -238, y: 1.1 },
  { name: 'Customs Alley Stash', x: -52, z: -196, y: 1.1 },
  { name: 'Neon Rooftop Drop', x: -108, z: -108, y: 14 },
  { name: 'Harbor Crane Foot', x: 196, z: -84, y: 1.1 },
  { name: 'Old Cannery Corner', x: 238, z: 20, y: 1.1 },
  { name: 'Palms Hotel Roof', x: 108, z: 108, y: 16 },
  { name: 'Boardwalk Locker', x: 232, z: 148, y: 1.1 },
  { name: 'South Pier End', x: 36, z: 240, y: 1.1 },
  { name: 'Tide Market Alley', x: -20, z: 124, y: 1.1 },
  { name: 'Sunset Garage Roof', x: -108, z: 36, y: 12 },
  { name: 'Mangrove Bend Stash', x: -196, z: 108, y: 1.1 },
  { name: 'West Beach Cache', x: -240, z: -20, y: 1.1 },
  { name: 'Radio Tower Base', x: -180, z: -196, y: 1.1 },
  { name: 'Courthouse Steps', x: -36, z: -52, y: 1.1 },
  { name: 'Centre Square Stash', x: 8, z: 8, y: 1.1 },
  { name: 'Marina Jetty Crate', x: 148, z: -240, y: 1.1 },
  { name: 'Casino Service Lane', x: 84, z: 196, y: 1.1 },
  { name: 'Lighthouse Point', x: -148, z: 232, y: 1.1 },
  { name: 'Depot Yard Corner', x: 196, z: 196, y: 1.1 },
];

/** Build the visible crate group for one stash: box, glow shell, light pool, beam. */
function buildPackageMesh(spot, phase) {
  const group = new THREE.Group();
  group.position.set(spot.x, 0, spot.z);

  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.05, 1.05, 1.05),
    new THREE.MeshLambertMaterial({ color: 0x1d7a5f, emissive: 0x0d3d2f }),
  );
  crate.position.y = spot.y;
  group.add(crate);

  const lid = new THREE.Mesh(
    new THREE.BoxGeometry(1.18, 0.22, 1.18),
    new THREE.MeshBasicMaterial({ color: 0x39ffb0 }),
  );
  lid.position.y = spot.y + 0.6;
  group.add(lid);

  const halo = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.7, 1.7),
    new THREE.MeshBasicMaterial({
      color: 0x39ffb0, transparent: true, opacity: 0.16, depthWrite: false,
    }),
  );
  halo.position.y = spot.y;
  group.add(halo);

  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(PICKUP_RADIUS, 26),
    new THREE.MeshBasicMaterial({
      color: 0x39ffb0, transparent: true, opacity: 0.13, depthWrite: false,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  group.add(pool);

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.55, BEACON_HEIGHT, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x39ffb0, transparent: true, opacity: 0.10,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  beam.position.y = BEACON_HEIGHT / 2;
  group.add(beam);

  // Three small shards orbit the crate like sparks off a neon sign. They cost
  // almost nothing to render and make a live stash read as "loot" from the
  // minimap distance, long before the crate itself is big on screen.
  const shards = [];
  for (let i = 0; i < 3; i += 1) {
    const shard = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.21),
      new THREE.MeshBasicMaterial({ color: 0xb8ffe2 }),
    );
    shard.position.y = spot.y;
    group.add(shard);
    shards.push(shard);
  }

  group.userData = { crate, lid, halo, pool, beam, shards, phase, baseY: spot.y };
  return group;
}

export class Collectibles {
  constructor(scene, save, sfx, hud) {
    this.scene = scene;
    this.save = save;
    this.sfx = sfx;
    this.hud = hud;
    this.elapsed = 0;
    this.bonusPaid = Boolean(save && save.packagesBonus);
    const already = new Set(Array.isArray(save && save.packages) ? save.packages : []);
    this.entries = PACKAGE_SPOTS.map((spot, id) => {
      const mesh = buildPackageMesh(spot, id * 0.73);
      const found = already.has(id);
      mesh.visible = !found;
      if (!found) scene.add(mesh);
      else scene.add(mesh); // kept in the scene graph, simply hidden once taken
      return { id, spot, mesh, found };
    });
  }

  /** How many of the twenty packages have been grabbed so far. */
  foundCount() {
    let n = 0;
    for (const entry of this.entries) if (entry.found) n += 1;
    return n;
  }

  /** How many packages are still hidden out in the city. */
  remaining() {
    return PACKAGE_TOTAL - this.foundCount();
  }

  /** Completion as a 0..1 fraction, for HUD bars or end-of-run summaries. */
  progress() {
    return this.foundCount() / PACKAGE_TOTAL;
  }

  /**
   * Name of the closest stash still hidden, or null once the set is complete.
   * Handy for a future hint system; today it backs the module's own tests and
   * keeps the landmark names in PACKAGE_SPOTS from being dead data.
   */
  nearestName(pos) {
    let best = Infinity;
    let name = null;
    for (const entry of this.entries) {
      if (entry.found) continue;
      const d = Math.hypot(entry.spot.x - pos.x, entry.spot.z - pos.z);
      if (d < best) { best = d; name = entry.spot.name; }
    }
    return name;
  }

  /** Distance in plan view from a world position to the nearest live stash. */
  nearestDistance(pos) {
    let best = Infinity;
    for (const entry of this.entries) {
      if (entry.found) continue;
      const d = Math.hypot(entry.spot.x - pos.x, entry.spot.z - pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  /** Write the found set (and the bonus flag) into the persistent save record. */
  persist() {
    const ids = [];
    for (const entry of this.entries) if (entry.found) ids.push(entry.id);
    this.save.packages = ids;
    this.save.packagesBonus = this.bonusPaid;
    storeSave(this.save);
  }

  /** Grab one stash: pay the cash, ring the chime, tell the HUD, save the set. */
  collect(entry, game) {
    entry.found = true;
    entry.mesh.visible = false;
    if (typeof game.addCash === 'function') game.addCash(PACKAGE_REWARD);
    else game.cash = (game.cash || 0) + PACKAGE_REWARD;
    if (this.sfx && typeof this.sfx.chime === 'function') this.sfx.chime();
    const taken = this.foundCount();
    if (this.hud && typeof this.hud.toast === 'function') {
      this.hud.toast(`HIDDEN PACKAGE ${taken}/${PACKAGE_TOTAL}  +$${PACKAGE_REWARD}`);
    }
    if (taken >= PACKAGE_TOTAL && !this.bonusPaid) {
      this.bonusPaid = true;
      if (typeof game.addCash === 'function') game.addCash(PACKAGE_BONUS);
      else game.cash = (game.cash || 0) + PACKAGE_BONUS;
      if (this.hud && typeof this.hud.toast === 'function') {
        this.hud.toast(`ALL PACKAGES FOUND  +$${PACKAGE_BONUS}`);
      }
      if (this.sfx && typeof this.sfx.chime === 'function') {
        this.sfx.chime();
        this.sfx.chime();
      }
    }
    this.persist();
  }

  /**
   * Per-frame work: spin and bob every live crate, breathe its glow, and test
   * the player's plan position against each beacon's pool. Runs for the player
   * on foot and in a car alike because game.playerPos() already resolves both.
   */
  update(dt, game) {
    this.elapsed += dt;
    const pos = typeof game.playerPos === 'function' ? game.playerPos() : game.player;
    if (!pos) return;
    game.packagesFound = this.foundCount();
    for (const entry of this.entries) {
      if (entry.found) continue;
      const u = entry.mesh.userData;
      const wave = Math.sin(this.elapsed * 2.1 + u.phase);
      u.crate.rotation.y += dt * 1.4;
      u.lid.rotation.y -= dt * 1.4;
      const bob = u.baseY + wave * 0.28;
      u.crate.position.y = bob;
      u.lid.position.y = bob + 0.6;
      u.halo.position.y = bob;
      u.halo.rotation.y -= dt * 0.9;
      const pulse = 1 + Math.sin(this.elapsed * 3.4 + u.phase) * 0.13;
      u.halo.scale.set(pulse, pulse, pulse);
      u.pool.material.opacity = 0.10 + (wave * 0.5 + 0.5) * 0.07;
      for (let i = 0; i < u.shards.length; i += 1) {
        const shard = u.shards[i];
        const angle = this.elapsed * 1.8 + u.phase + (i * Math.PI * 2) / u.shards.length;
        shard.position.x = Math.cos(angle) * 1.35;
        shard.position.z = Math.sin(angle) * 1.35;
        shard.position.y = bob + Math.sin(this.elapsed * 2.6 + i * 1.7) * 0.22;
        shard.rotation.x += dt * 2.2;
        shard.rotation.y += dt * 3.1;
      }
      const dx = entry.spot.x - pos.x;
      const dz = entry.spot.z - pos.z;
      if (dx * dx + dz * dz <= PICKUP_RADIUS * PICKUP_RADIUS) {
        this.collect(entry, game);
      }
    }
  }
}
