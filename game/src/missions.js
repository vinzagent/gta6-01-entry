// The Neon Tide story: ten named missions in a graph, not a rotation. Six chapters form
// the spine — Mara Venn, a fixer with a debt to the tide, walks you from a first errand
// to the night the harbor itself is on the line — and four side jobs branch off the
// spine once their chapter is done. Every mission has a name, a line of story, staged
// objectives and a cash reward. Rewards are idempotent: the game's ledger pays each
// mission id exactly once, so replaying, retrying or reloading a save can never pay a
// chapter twice. Finished chapters stay finished in the save; when the graph is done
// the streets offer endless replays of any chapter for a small, non-story fee.

import { ROAD_LINES } from './city.js';

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext('2d');
  c.font = 'bold 84px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = 14;
  c.strokeStyle = 'rgba(10,6,20,0.85)';
  c.strokeText(text, 128, 64);
  c.fillStyle = color;
  c.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sprite.scale.set(9, 4.5, 1);
  return sprite;
}

function makePillar(color) {
  const group = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 30, 18, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 15;
  group.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.4, 4.4, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);
  return group;
}

function makeCrate(color, label) {
  const group = new THREE.Group();
  const crate = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.8, 0.9),
    new THREE.MeshBasicMaterial({ color }),
  );
  crate.position.y = 0.7;
  group.add(crate);
  const tag = makeLabel(label, '#ffffff');
  tag.position.y = 2.6;
  tag.scale.set(5, 2.5, 1);
  group.add(tag);
  return group;
}

/**
 * The mission graph. `requires` lists chapter ids that must be complete first; the
 * validator below proves every requirement exists and the graph has no dead branch.
 * kind reuses the three proven objective shapes: checkpoint, cashgrab, delivery.
 */
export const MISSION_GRAPH = [
  { id: 'first-fare', title: 'FIRST FARE', kind: 'checkpoint', reward: 300, color: '#ffd23e', requires: [], story: 'Mara Venn needs a driver who asks nothing. Reach her lookout and the harbor opens up.' },
  { id: 'paper-tide', title: 'PAPER TIDE', kind: 'cashgrab', reward: 420, color: '#39d353', requires: ['first-fare'], story: 'A tide of marked bills spilled across the east blocks. Gather five cases before the PD does.' },
  { id: 'hot-sauce', title: 'HOT SAUCE RUN', kind: 'delivery', reward: 520, color: '#ff8c1a', requires: ['paper-tide'], story: 'Chef Lio\'s "special sauce" cannot sit in a hot car. Pick it up, drop it fast, ask nothing.' },
  { id: 'silent-dock', title: 'SILENT DOCK', kind: 'checkpoint', reward: 560, color: '#00e5ff', requires: ['hot-sauce'], story: 'A boat leaves the silent dock at dusk. Be the shadow standing on the pier when it does.' },
  { id: 'neon-debt', title: 'NEON DEBT', kind: 'cashgrab', reward: 700, color: '#ff2e88', requires: ['silent-dock'], story: 'The Neon Parlor owes Mara five drops. Collect every one and the debt — and her leash — is gone.' },
  { id: 'tide-turns', title: 'THE TIDE TURNS', kind: 'delivery', reward: 950, color: '#d500f9', requires: ['neon-debt'], story: 'The last package: Mara\'s way out of Vice Harbor. Deliver it and the tide turns for good.' },
  { id: 'cab-confessional', title: 'CAB CONFESSIONAL', kind: 'checkpoint', reward: 380, color: '#ffe14d', requires: ['first-fare'], branch: true, story: 'An old cabbie hears everything. Race his route and he will tell you where the money sleeps.' },
  { id: 'rooftop-relay', title: 'ROOFTOP RELAY', kind: 'cashgrab', reward: 480, color: '#76ff03', requires: ['paper-tide'], branch: true, story: 'Couriers stash relay pouches on the low roofs\' shadows. Five pouches, one skyline.' },
  { id: 'ambulance-drift', title: 'AMBULANCE DRIFT', kind: 'delivery', reward: 640, color: '#ff7043', requires: ['hot-sauce'], branch: true, story: 'A private clinic needs donor ice, no sirens, no questions. Drive like a heartbeat.' },
  { id: 'harbor-lights', title: 'HARBOR LIGHTS', kind: 'checkpoint', reward: 800, color: '#a8d8ff', requires: ['neon-debt'], branch: true, story: 'Signal the fleet from the harbor lights: three seconds in the beam and the night is yours.' },
];

/** Prove the graph is sound: unique ids, known requirements, no unreachable chapter. */
export function validateMissionGraph(graph = MISSION_GRAPH) {
  const ids = new Set(graph.map((m) => m.id));
  if (ids.size !== graph.length) return 'duplicate mission id';
  for (const m of graph) {
    for (const req of m.requires) if (!ids.has(req)) return `${m.id} requires missing ${req}`;
  }
  const done = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of graph) {
      if (!done.has(m.id) && m.requires.every((r) => done.has(r))) { done.add(m.id); grew = true; }
    }
  }
  return done.size === graph.length ? null : 'mission graph has an unreachable branch';
}

export class Missions {
  constructor(scene, rng, save = null) {
    this.scene = scene;
    this.rng = rng;
    this.save = save; // shared save record: completed chapters persist across runs
    this.current = null;
    this.def = null;
    this.cooldown = 2.5;
    this.markers = [];
    const flaw = validateMissionGraph();
    if (flaw) throw new Error(`mission graph broken: ${flaw}`);
  }

  completedIds() {
    return new Set(this.save ? this.save.completed : []);
  }

  /** Chapters whose requirements are met and which are not yet complete. */
  available() {
    const done = this.completedIds();
    return MISSION_GRAPH.filter((m) => !done.has(m.id) && m.requires.every((r) => done.has(r)));
  }

  clearMarkers() {
    for (const m of this.markers) this.scene.remove(m);
    this.markers = [];
  }

  spotsFarFrom(pos, minDist) {
    const spots = [];
    for (const x of ROAD_LINES) {
      for (const z of ROAD_LINES) {
        if (Math.hypot(x - pos.x, z - pos.z) > minDist) spots.push({ x, z });
      }
    }
    return spots;
  }

  /** Offer the next chapter: first available in graph order, else a replayable encore. */
  beginNext(game) {
    this.clearMarkers();
    const next = this.available()[0];
    const def = next || this.rng.pick(MISSION_GRAPH);
    this.def = def;
    const pos = game.playerPos();
    const encore = !next;
    const tail = encore ? ' (encore — streets fee only)' : '';
    if (def.kind === 'checkpoint') {
      const spot = this.rng.pick(this.spotsFarFrom(pos, 110));
      const dist = Math.hypot(spot.x - pos.x, spot.z - pos.z);
      const marker = makePillar(def.color === '#ffd23e' ? 0xffd23e : new THREE.Color(def.color).getHex());
      marker.position.set(spot.x, 0, spot.z);
      const tag = makeLabel('GO!', def.color);
      tag.position.y = 12;
      marker.add(tag);
      this.scene.add(marker);
      this.markers.push(marker);
      this.current = { type: 'checkpoint', title: def.title, sub: def.story, x: spot.x, z: spot.z, timeLeft: dist / 13 + 18, reward: def.reward, color: def.color };
    } else if (def.kind === 'cashgrab') {
      const spots = this.rng.shuffle(this.spotsFarFrom(pos, 45));
      const cases = [];
      for (let i = 0; i < 5; i += 1) {
        const spot = this.rng.pick(spots);
        const crate = makeCrate(0x39d353, '$');
        crate.position.set(spot.x + this.rng.range(-4, 4), 0, spot.z + this.rng.range(-4, 4));
        this.scene.add(crate);
        this.markers.push(crate);
        cases.push({ x: crate.position.x, z: crate.position.z, mesh: crate, taken: false });
      }
      this.current = { type: 'cashgrab', title: def.title, sub: `${def.story} (0/5)`, cases, got: 0, timeLeft: 160, reward: def.reward, color: def.color };
    } else {
      const from = this.rng.pick(this.spotsFarFrom(pos, 80));
      const pickup = makeCrate(0xff8c1a, 'PKG');
      pickup.position.set(from.x, 0, from.z);
      this.scene.add(pickup);
      this.markers.push(pickup);
      this.current = { type: 'delivery', title: def.title, sub: `${def.story} First: pick up the package.`, stage: 'pickup', x: from.x, z: from.z, timeLeft: 70, reward: def.reward, color: def.color };
    }
    game.toast(`Mission: ${def.title}${tail}`);
  }

  /** The spot the minimap should highlight right now, or null between missions. */
  target() {
    const m = this.current;
    if (!m) return null;
    if (m.type === 'cashgrab') {
      const next = m.cases.find((c) => !c.taken);
      return next ? { x: next.x, z: next.z, color: m.color } : null;
    }
    return { x: m.x, z: m.z, color: m.color };
  }

  /** Advance the mission; ends it (paying out or failing) through the game callbacks. */
  update(dt, game, time) {
    if (!this.current) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) this.beginNext(game);
      return;
    }
    const m = this.current;
    m.timeLeft -= dt;
    for (const marker of this.markers) {
      marker.rotation.y += dt * 0.7;
    }
    if (m.timeLeft <= 0) {
      game.toast(`${m.title} FAILED — the streets move on`);
      game.sfx.blip(180);
      this.current = null;
      this.cooldown = 4;
      this.clearMarkers();
      return;
    }
    const pos = game.playerPos();
    if (m.type === 'checkpoint') {
      if (Math.hypot(pos.x - m.x, pos.z - m.z) < 5.5) this.complete(game, m, m.reward + Math.ceil(m.timeLeft) * 4);
    } else if (m.type === 'cashgrab') {
      for (const c of m.cases) {
        if (!c.taken && Math.hypot(pos.x - c.x, pos.z - c.z) < 3.4) {
          c.taken = true;
          this.scene.remove(c.mesh);
          this.markers = this.markers.filter((mk) => mk !== c.mesh);
          m.got += 1;
          m.sub = `${this.def.story} (${m.got}/5)`;
          game.sfx.blip(760);
          game.toast(`Case ${m.got} of 5 secured`);
          if (m.got >= 5) this.complete(game, m, m.reward);
        }
      }
    } else if (m.type === 'delivery') {
      if (Math.hypot(pos.x - m.x, pos.z - m.z) < 4.5) {
        if (m.stage === 'pickup') {
          this.clearMarkers();
          const dest = this.rng.pick(this.spotsFarFrom(pos, 170));
          const pillar = makePillar(0xff8c1a);
          pillar.position.set(dest.x, 0, dest.z);
          this.scene.add(pillar);
          this.markers.push(pillar);
          m.x = dest.x;
          m.z = dest.z;
          m.stage = 'dropoff';
          m.sub = 'Package on board — now drop it at the orange pillar, fast!';
          m.timeLeft = Math.hypot(dest.x - pos.x, dest.z - pos.z) / 13 + 16;
          game.toast('Package on board — deliver it!');
          game.sfx.blip(620);
        } else {
          this.complete(game, m, m.reward + Math.ceil(m.timeLeft) * 3);
        }
      }
    }
  }

  complete(game, m, amount) {
    // The game owns the ledger: it pays this mission id once, marks the chapter
    // complete in the save and reports what was actually paid (0 on an encore).
    const paid = game.completeMission ? game.completeMission(this.def, amount) : (game.addCash(amount), amount);
    game.stats.missions += 1;
    game.toast(paid > 0 ? `${m.title} COMPLETE — +$${paid}` : `${m.title} COMPLETE — encore, ledger already paid`);
    game.sfx.cash();
    this.current = null;
    this.cooldown = 3.5;
    this.clearMarkers();
  }

  /** HUD lines for the active mission, or null. */
  describe() {
    const m = this.current;
    if (!m) return null;
    return { title: m.title, sub: m.sub, timeLeft: Math.max(0, m.timeLeft), color: m.color };
  }
}
