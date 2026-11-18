// Vice Harbor itself: a 7x7 grid of city blocks on a small island at dusk. The ground is one
// big canvas texture (asphalt, sidewalks, dashes, crosswalks, parks, parking lots), buildings
// are a single InstancedMesh of boxes wearing a canvas window texture — some windows lit —
// and lamps, palms and neon signs are instanced or merged so the whole city is a few draw
// calls. Every building also registers an AABB collider the physics resolves against.

export const PITCH = 72; // distance between block centres
export const BLOCK_HALF = 28; // half the width of a block (roads fill the gaps)
export const GRID = 7; // blocks per side
export const EXT = (GRID * PITCH) / 2; // 252: half the city span
export const ISLE = 288; // half the island span (beach rim beyond the last road)
export const ROAD_LINES = [-248, -180, -108, -36, 36, 108, 180, 248]; // road centre lines

export function blockCenter(i) {
  return -EXT + PITCH / 2 + i * PITCH;
}

/** Corner waypoints of the road ring around block (bi, bj), in driving order. */
export function ringCorners(bi, bj) {
  const cx = blockCenter(bi);
  const cz = blockCenter(bj);
  const h = PITCH / 2;
  return [
    { x: cx - h, z: cz - h },
    { x: cx + h, z: cz - h },
    { x: cx + h, z: cz + h },
    { x: cx - h, z: cz + h },
  ];
}

function makeFacadeTextures(rng) {
  const w = 128;
  const h = 256;
  const map = document.createElement('canvas');
  map.width = w;
  map.height = h;
  const mc = map.getContext('2d');
  mc.fillStyle = '#c9ccd6';
  mc.fillRect(0, 0, w, h);
  const glow = document.createElement('canvas');
  glow.width = w;
  glow.height = h;
  const gc = glow.getContext('2d');
  gc.fillStyle = '#000000';
  gc.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 14;
  const cw = w / cols;
  const ch = h / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const px = x * cw + 3;
      const py = y * ch + 4;
      const pw = cw - 6;
      const ph = ch - 8;
      mc.fillStyle = '#3c4054';
      mc.fillRect(px, py, pw, ph);
      if (rng.chance(0.42)) {
        const warm = rng.chance(0.75);
        gc.fillStyle = warm ? '#ffc06a' : '#a8d8ff';
        gc.globalAlpha = rng.range(0.55, 1);
        gc.fillRect(px, py, pw, ph);
        gc.globalAlpha = 1;
      }
    }
  }
  const mapTex = new THREE.CanvasTexture(map);
  const glowTex = new THREE.CanvasTexture(glow);
  return { mapTex, glowTex };
}

function makeGroundTexture(blockKinds) {
  const S = 2048;
  const world = ISLE * 2;
  const px = (v) => ((v + ISLE) / world) * S;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const c = canvas.getContext('2d');
  // Island base: asphalt everywhere, roads are what is left between the blocks.
  c.fillStyle = '#26242e';
  c.fillRect(0, 0, S, S);
  // Beach rim.
  c.strokeStyle = '#8a6f4d';
  c.lineWidth = px(ISLE) - px(EXT + 14);
  c.strokeRect(c.lineWidth / 2, c.lineWidth / 2, S - c.lineWidth, S - c.lineWidth);
  // Blocks.
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const x0 = px(cx - BLOCK_HALF - 2);
      const y0 = px(cz - BLOCK_HALF - 2);
      const sz = px(cx + BLOCK_HALF + 2) - x0;
      const kind = blockKinds[j * GRID + i];
      c.fillStyle = kind === 'park' ? '#274d2d' : '#43434f';
      c.fillRect(x0, y0, sz, sz);
      c.strokeStyle = '#5a5a68';
      c.lineWidth = 3;
      c.strokeRect(x0, y0, sz, sz);
      if (kind === 'park') {
        c.strokeStyle = '#6d7f56';
        c.lineWidth = 10;
        c.beginPath();
        c.moveTo(x0 + 8, y0 + sz / 2);
        c.lineTo(x0 + sz - 8, y0 + sz / 2);
        c.moveTo(x0 + sz / 2, y0 + 8);
        c.lineTo(x0 + sz / 2, y0 + sz - 8);
        c.stroke();
      }
      if (kind === 'parking') {
        c.fillStyle = '#33323d';
        c.fillRect(x0 + 10, y0 + 10, sz - 20, sz - 20);
        c.strokeStyle = '#cfd2dc';
        c.lineWidth = 2;
        for (let s = 0; s < 6; s += 1) {
          const sx = x0 + 16 + s * ((sz - 32) / 6);
          c.beginPath();
          c.moveTo(sx, y0 + 14);
          c.lineTo(sx, y0 + 44);
          c.moveTo(sx, y0 + sz - 44);
          c.lineTo(sx, y0 + sz - 14);
          c.stroke();
        }
      }
    }
  }
  // Lane dashes along every road centre line, skipping the intersections.
  c.fillStyle = '#d8b93a';
  const dash = 7;
  const gap = 6;
  for (const line of ROAD_LINES) {
    for (let v = -EXT - 10; v < EXT + 10; v += dash + gap) {
      let inCrossing = false;
      for (const other of ROAD_LINES) {
        if (Math.abs(v + (dash / 2) - other) < 11) inCrossing = true;
      }
      if (inCrossing) continue;
      c.fillRect(px(v), px(line) - 1.5, px(v + dash) - px(v), 3);
      c.fillRect(px(line) - 1.5, px(v), 3, px(v + dash) - px(v));
    }
  }
  // Crosswalk stripes at every intersection.
  c.fillStyle = '#b9bcc8';
  for (const a of ROAD_LINES) {
    for (const b of ROAD_LINES) {
      for (let s = -3; s <= 3; s += 1) {
        if (s === 0) continue;
        c.fillRect(px(a + s * 2.2) - 2, px(b - 10), 4, px(b - 4) - px(b - 10));
        c.fillRect(px(a + s * 2.2) - 2, px(b + 4), 4, px(b + 10) - px(b + 4));
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 512;
  const c = canvas.getContext('2d');
  const grad = c.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#171233');
  grad.addColorStop(0.42, '#3d2058');
  grad.addColorStop(0.68, '#8a3560');
  grad.addColorStop(0.86, '#e8763a');
  grad.addColorStop(1, '#ffb35c');
  c.fillStyle = grad;
  c.fillRect(0, 0, 16, 512);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Build the whole city into `scene`. Returns the building colliders and the block kinds so
 * the rest of the game can place traffic, peds and missions on the right kind of ground.
 */
export function buildCity(scene, rng) {
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0x4a2a52, 190, 780);

  const hemi = new THREE.HemisphereLight(0x9a7bd0, 0x1c1428, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.5);
  sun.position.set(-260, 120, -140);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x6a5acd, 0.35);
  fill.position.set(200, 160, 220);
  scene.add(fill);

  // Water around the island.
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 2600),
    new THREE.MeshLambertMaterial({ color: 0x0d2f52 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  scene.add(water);

  // Block kinds: a couple of parks and parking lots in a sea of towers and mid-rise.
  const blockKinds = [];
  for (let n = 0; n < GRID * GRID; n += 1) {
    const roll = rng.float();
    blockKinds.push(roll < 0.1 ? 'park' : roll < 0.2 ? 'parking' : roll < 0.55 ? 'mid' : 'tower');
  }
  blockKinds[3 * GRID + 3] = 'mid'; // keep the city centre built up

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(ISLE * 2, ISLE * 2),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(blockKinds) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Buildings: one InstancedMesh, tinted per instance, windows from the facade textures.
  const { mapTex, glowTex } = makeFacadeTextures(rng);
  const lots = [];
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const kind = blockKinds[j * GRID + i];
      if (kind === 'park' || kind === 'parking') continue;
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      const centreBoost = 1 - Math.min(1, Math.hypot(cx, cz) / 320);
      for (const ox of [-14, 14]) {
        for (const oz of [-14, 14]) {
          if (rng.chance(0.14)) continue; // an empty lot here and there
          const w = rng.range(15, 23);
          const d = rng.range(15, 23);
          const base = kind === 'tower' ? rng.range(20, 42) : rng.range(8, 20);
          const hgt = base * (0.55 + centreBoost * 0.9);
          lots.push({ x: cx + ox, z: cz + oz, w, d, h: hgt });
        }
      }
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({
    map: mapTex,
    emissiveMap: glowTex,
    emissive: 0xffc98a,
    emissiveIntensity: 1.0,
  });
  const buildings = new THREE.InstancedMesh(geo, mat, lots.length);
  const dummy = new THREE.Object3D();
  const palette = [0xb8b0c8, 0x9fb4c8, 0xc8a8a0, 0xa8c8b8, 0xd0c098, 0x8f9fd8, 0xc898b8];
  const colliders = [];
  lots.forEach((lot, idx) => {
    dummy.position.set(lot.x, 0, lot.z);
    dummy.scale.set(lot.w, lot.h, lot.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    buildings.setMatrixAt(idx, dummy.matrix);
    buildings.setColorAt(idx, new THREE.Color(rng.pick(palette)));
    colliders.push({ x0: lot.x - lot.w / 2, x1: lot.x + lot.w / 2, z0: lot.z - lot.d / 2, z1: lot.z + lot.d / 2, h: lot.h });
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // Neon signs on a few rooftops and facades: plain bright boxes, pure vice.
  const neonColors = [0xff2e88, 0x00e5ff, 0xffa726, 0x76ff03, 0xd500f9];
  const neonGroup = new THREE.Group();
  for (const lot of lots) {
    if (!rng.chance(0.16)) continue;
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(lot.w * 0.7, 1.6, 0.4),
      new THREE.MeshBasicMaterial({ color: rng.pick(neonColors) }),
    );
    sign.position.set(lot.x, lot.h + 0.8, lot.z + lot.d / 2 + 0.3);
    neonGroup.add(sign);
  }
  scene.add(neonGroup);

  // Street lamps: instanced poles and glowing heads along the intersections.
  const lampSpots = [];
  for (const a of ROAD_LINES) {
    for (const b of ROAD_LINES) {
      lampSpots.push({ x: a + 9, z: b + 9 });
      lampSpots.push({ x: a - 9, z: b - 9 });
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 5.2, 5);
  poleGeo.translate(0, 2.6, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x22222c }), lampSpots.length);
  const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
  headGeo.translate(0, 5.3, 0);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), lampSpots.length);
  lampSpots.forEach((spot, idx) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.scale.set(1, 1, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    poles.setMatrixAt(idx, dummy.matrix);
    heads.setMatrixAt(idx, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(heads);

  // Palms and park trees: tilted trunks with a squashed green crown, instanced.
  const treeSpots = [];
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const kind = blockKinds[j * GRID + i];
      const cx = blockCenter(i);
      const cz = blockCenter(j);
      if (kind === 'park') {
        for (let t = 0; t < 9; t += 1) treeSpots.push({ x: cx + rng.range(-22, 22), z: cz + rng.range(-22, 22) });
      } else {
        for (const [ox, oz] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) {
          if (rng.chance(0.55)) treeSpots.push({ x: cx + ox, z: cz + oz });
        }
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 4.4, 5);
  trunkGeo.translate(0, 2.2, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), treeSpots.length);
  const crownGeo = new THREE.IcosahedronGeometry(2.3, 0);
  crownGeo.scale(1, 0.55, 1);
  crownGeo.translate(0, 4.9, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2e7d46 }), treeSpots.length);
  treeSpots.forEach((spot, idx) => {
    dummy.position.set(spot.x, 0, spot.z);
    dummy.scale.setScalar(rng.range(0.8, 1.3));
    dummy.rotation.set(rng.range(-0.09, 0.09), rng.range(0, 6.28), rng.range(-0.09, 0.09));
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);
    crowns.setMatrixAt(idx, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(crowns);

  return { colliders, blockKinds };
}

/**
 * Push a circle (x, z, radius r) out of every building AABB it overlaps and off the island.
 * Mutates pos. Returns the deepest penetration resolved, 0 when nothing was touched — the
 * physics uses that to tell a graze from a real crash.
 */
export function resolveCollisions(colliders, pos, r) {
  let worst = 0;
  for (const b of colliders) {
    if (pos.x < b.x0 - r || pos.x > b.x1 + r || pos.z < b.z0 - r || pos.z > b.z1 + r) continue;
    const dxl = pos.x - (b.x0 - r);
    const dxr = (b.x1 + r) - pos.x;
    const dzl = pos.z - (b.z0 - r);
    const dzr = (b.z1 + r) - pos.z;
    const m = Math.min(dxl, dxr, dzl, dzr);
    if (m === dxl) pos.x = b.x0 - r;
    else if (m === dxr) pos.x = b.x1 + r;
    else if (m === dzl) pos.z = b.z0 - r;
    else pos.z = b.z1 + r;
    if (m > worst) worst = m;
  }
  const lim = ISLE - 6;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
  return worst;
}
