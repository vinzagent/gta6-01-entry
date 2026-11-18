// The work that pays: a rotating set of street missions. A CHECKPOINT RUN sends you to a
// pillar of light against the clock, CASH GRAB scatters five glowing briefcases over the
// map, and HOT DELIVERY makes you pick up a package and drop it across town. Each mission
// drives a HUD banner, a minimap marker and a cash payout, and the next one is offered a
// few seconds after the last ends, pass or fail.

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

const TYPES = ['checkpoint', 'cashgrab', 'delivery'];

export class Missions {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cycle = rng.int(0, 2);
    this.current = null;
    this.cooldown = 2.5;
    this.markers = [];
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

  /** Offer the next mission in the rotation. `game` supplies playerPos/addCash/toast/sfx. */
  beginNext(game) {
    this.clearMarkers();
    const type = TYPES[this.cycle % TYPES.length];
    this.cycle += 1;
    const pos = game.playerPos();
    if (type === 'checkpoint') {
      const spot = this.rng.pick(this.spotsFarFrom(pos, 110));
      const dist = Math.hypot(spot.x - pos.x, spot.z - pos.z);
      const marker = makePillar(0xffd23e);
      marker.position.set(spot.x, 0, spot.z);
      const tag = makeLabel('GO!', '#ffd23e');
      tag.position.y = 12;
      marker.add(tag);
      this.scene.add(marker);
      this.markers.push(marker);
      this.current = { type, title: 'CHECKPOINT RUN', sub: 'Reach the gold pillar before time runs out', x: spot.x, z: spot.z, timeLeft: dist / 13 + 16, reward: 300, color: '#ffd23e' };
      game.toast('New mission: CHECKPOINT RUN');
    } else if (type === 'cashgrab') {
      const spots = this.spotsFarFrom(pos, 45);
      const cases = [];
      for (let i = 0; i < 5; i += 1) {
        const spot = this.rng.pick(spots);
        const crate = makeCrate(0x39d353, '$');
        crate.position.set(spot.x + this.rng.range(-4, 4), 0, spot.z + this.rng.range(-4, 4));
        this.scene.add(crate);
        this.markers.push(crate);
        cases.push({ x: crate.position.x, z: crate.position.z, mesh: crate, taken: false });
      }
      this.current = { type, title: 'CASH GRAB', sub: 'Collect all 5 briefcases', cases, got: 0, timeLeft: 150, reward: 200, color: '#39d353' };
      game.toast('New mission: CASH GRAB');
    } else {
      const from = this.rng.pick(this.spotsFarFrom(pos, 80));
      const pickup = makeCrate(0xff8c1a, 'PKG');
      pickup.position.set(from.x, 0, from.z);
      this.scene.add(pickup);
      this.markers.push(pickup);
      this.current = { type, title: 'HOT DELIVERY', sub: 'Pick up the package', stage: 'pickup', x: from.x, z: from.z, timeLeft: 60, reward: 450, color: '#ff8c1a' };
      game.toast('New mission: HOT DELIVERY');
    }
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
          game.addCash(120, 'briefcase');
          game.sfx.blip(760);
          game.toast(`Briefcase ${m.got} of 5 — $${120}`);
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
          m.sub = 'Now drop it at the orange pillar — move!';
          m.timeLeft = Math.hypot(dest.x - pos.x, dest.z - pos.z) / 13 + 14;
          game.toast('Package on board — deliver it!');
          game.sfx.blip(620);
        } else {
          this.complete(game, m, m.reward + Math.ceil(m.timeLeft) * 3);
        }
      }
    }
  }

  complete(game, m, amount) {
    game.addCash(amount, 'mission');
    game.stats.missions += 1;
    game.toast(`${m.title} COMPLETE — +$${amount}`);
    game.sfx.cash();
    this.current = null;
    this.cooldown = 3.5;
    this.clearMarkers();
  }

  /** HUD lines for the active mission, or null. */
  describe() {
    const m = this.current;
    if (!m) return null;
    const sub = m.type === 'cashgrab' ? `${m.sub} (${m.got}/5)` : m.sub;
    return { title: m.title, sub, timeLeft: Math.max(0, m.timeLeft), color: m.color };
  }
}
