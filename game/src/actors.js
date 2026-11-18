// The cast of Vice Harbor: box-built cars and pedestrians, plus the simple brains that move
// them. Traffic cars loop the road ring around an assigned block on their own side of the
// road, police cars hunt the player, and pedestrians stroll the sidewalks. All steering is
// plain seek-a-waypoint with building collision resolved by the city module, and every
// decision draws from the shared seeded stream so screenshot scenes stay deterministic.

import { resolveCollisions, ringCorners } from './city.js';

export const CAR_COLORS = [0xd64545, 0x4574d6, 0x53c269, 0xe0a83c, 0xb8bcc4, 0x7040c0, 0x38b6b0, 0xe8e8ec, 0x30323c];
const SKIN_TONES = [0xf2c89b, 0xc68863, 0x8d5524, 0xffdbac];
const SHIRTS = [0xff5d8f, 0x38b6b0, 0xffd23e, 0x7c4dff, 0x53c269, 0xe8e8ec, 0xff7043];

const box = (w, h, d, color, x = 0, y = 0, z = 0, basic = false) => {
  const mat = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
};

/** A low-poly car facing +Z: body, glass cabin, spinning wheels, lights. Police get a light bar. */
export function makeCarMesh(color, { police = false, taxi = false } = {}) {
  const car = new THREE.Group();
  const paint = police ? 0xf2f2f5 : color;
  car.add(box(1.9, 0.52, 4.3, paint, 0, 0.56, 0));
  car.add(box(1.86, 0.3, 1.1, paint, 0, 0.42, 1.85)); // nose
  car.add(box(1.7, 0.52, 2.0, 0x161a26, 0, 1.06, -0.25)); // glass cabin
  if (police) {
    car.add(box(1.94, 0.34, 1.5, 0x14151c, 0, 0.6, 0.4)); // black door band
    const barL = box(0.62, 0.16, 0.5, 0xff2040, -0.42, 1.42, -0.25, true);
    const barR = box(0.62, 0.16, 0.5, 0x2060ff, 0.42, 1.42, -0.25, true);
    car.add(barL);
    car.add(barR);
    car.userData.barL = barL;
    car.userData.barR = barR;
  }
  if (taxi) car.add(box(0.7, 0.22, 0.4, 0xffe14d, 0, 1.42, -0.25, true));
  car.add(box(0.34, 0.15, 0.06, 0xfff6c9, -0.6, 0.62, 2.41, true));
  car.add(box(0.34, 0.15, 0.06, 0xfff6c9, 0.6, 0.62, 2.41, true));
  car.add(box(0.34, 0.13, 0.06, 0xff2a30, -0.6, 0.64, -2.16, true));
  car.add(box(0.34, 0.13, 0.06, 0xff2a30, 0.6, 0.64, -2.16, true));
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0b0b0d });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.42], [0.95, 1.42], [-0.95, -1.42], [0.95, -1.42]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(wx, 0.37, wz);
    car.add(wheel);
    wheels.push(wheel);
  }
  car.userData.wheels = wheels;
  return car;
}

/** A simple articulated pedestrian: swinging legs and arms around a torso, head on top. */
export function makePedMesh(rng, { hero = false } = {}) {
  const ped = new THREE.Group();
  const shirt = hero ? 0xff2e88 : rng.pick(SHIRTS);
  const pants = hero ? 0x14213d : rng.pick([0x2b2f3a, 0x4a3b2a, 0x24344d, 0x5a2d43]);
  const skin = rng.pick(SKIN_TONES);
  const legGeo = new THREE.BoxGeometry(0.17, 0.52, 0.17);
  legGeo.translate(0, -0.26, 0);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = new THREE.Mesh(legGeo, legMat);
  legL.position.set(-0.11, 0.52, 0);
  const legR = new THREE.Mesh(legGeo, legMat);
  legR.position.set(0.11, 0.52, 0);
  const armGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12);
  armGeo.translate(0, -0.22, 0);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const armL = new THREE.Mesh(armGeo, armMat);
  armL.position.set(-0.3, 1.08, 0);
  const armR = new THREE.Mesh(armGeo, armMat);
  armR.position.set(0.3, 1.08, 0);
  ped.add(legL, legR, armL, armR);
  ped.add(box(0.46, 0.6, 0.25, shirt, 0, 0.83, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.set(0, 1.32, 0);
  ped.add(head);
  ped.userData.legL = legL;
  ped.userData.legR = legR;
  ped.userData.armL = armL;
  ped.userData.armR = armR;
  ped.scale.setScalar(1.12);
  return ped;
}

/** Turn `heading` toward `target` by at most `maxTurn`; returns the new heading. */
export function steerToward(heading, target, maxTurn) {
  let diff = target - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
  return heading + turn;
}

export function headingTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** A traffic car: loops the road ring around one block, braking for the car in front. */
export function makeTrafficCar(rng, scene, bi, bj) {
  const mesh = makeCarMesh(rng.pick(CAR_COLORS), { taxi: rng.chance(0.14) });
  const dir = rng.chance(0.5) ? 1 : -1;
  const corners = ringCorners(bi, bj);
  if (dir < 0) corners.reverse();
  const car = {
    kind: 'traffic',
    mesh,
    heading: 0,
    speed: 0,
    cruise: rng.range(10.5, 14.5),
    corners,
    wp: rng.int(0, 3),
    radius: 2.3,
    health: 100,
  };
  const start = corners[car.wp];
  mesh.position.set(start.x, 0, start.z);
  car.heading = headingTo(start, corners[(car.wp + 1) % 4]);
  mesh.rotation.y = car.heading;
  scene.add(mesh);
  return car;
}

export function updateTrafficCar(dt, car, cars, colliders) {
  const pos = car.mesh.position;
  const target = car.corners[(car.wp + 1) % car.corners.length];
  // Aim at a point offset to the car's own side of the road so opposing flows pass cleanly.
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const aim = { x: target.x + fz * 2.3, z: target.z - fx * 2.3 };
  const dist = Math.hypot(target.x - pos.x, target.z - pos.z);
  if (dist < 5) car.wp = (car.wp + 1) % car.corners.length;
  const desired = headingTo(pos, aim);
  car.heading = steerToward(car.heading, desired, 1.9 * dt);
  // Brake when something is close ahead.
  let want = car.cruise;
  for (const other of cars) {
    if (other === car) continue;
    const ox = other.mesh.position.x - pos.x;
    const oz = other.mesh.position.z - pos.z;
    const ahead = ox * fx + oz * fz;
    const side = Math.abs(ox * fz - oz * fx);
    if (ahead > 0 && ahead < 8 && side < 2.2) want = Math.min(want, ahead < 4.5 ? 0 : car.cruise * 0.45);
  }
  car.speed += Math.max(-26 * dt, Math.min(9 * dt, want - car.speed));
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  resolveCollisions(colliders, pos, car.radius);
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
}

export function spinWheels(car, dt) {
  const wheels = car.mesh.userData.wheels;
  if (!wheels) return;
  const spin = (car.speed * dt) / 0.37;
  for (const wheel of wheels) wheel.rotation.x += spin;
}

/** A police car: hunts the target position, fast and stubborn, lights flashing. */
export function makePoliceCar(scene, x, z) {
  const mesh = makeCarMesh(0xf2f2f5, { police: true });
  mesh.position.set(x, 0, z);
  scene.add(mesh);
  return { kind: 'police', mesh, heading: 0, speed: 0, cruise: 23.5, radius: 2.3, health: 100, flash: 0 };
}

export function updatePoliceCar(dt, car, targetPos, colliders, time) {
  const pos = car.mesh.position;
  const desired = headingTo(pos, targetPos);
  const dist = Math.hypot(targetPos.x - pos.x, targetPos.z - pos.z);
  car.heading = steerToward(car.heading, desired, 2.3 * dt);
  const want = dist > 26 ? car.cruise : Math.max(9, car.cruise * (dist / 26));
  car.speed += Math.max(-30 * dt, Math.min(13 * dt, want - car.speed));
  pos.x += Math.sin(car.heading) * car.speed * dt;
  pos.z += Math.cos(car.heading) * car.speed * dt;
  resolveCollisions(colliders, pos, car.radius);
  car.mesh.rotation.y = car.heading;
  spinWheels(car, dt);
  // Flash the light bar: alternate bright red / bright blue phases.
  const phase = Math.floor(time * 5 + car.flash) % 2 === 0;
  car.mesh.userData.barL.material.color.setHex(phase ? 0xff2040 : 0x57101c);
  car.mesh.userData.barR.material.color.setHex(phase ? 0x12245c : 0x2a6bff);
}

/** A pedestrian: strolls the sidewalk ring around one block; can be knocked down. */
export function makePed(rng, scene, bi, bj) {
  const mesh = makePedMesh(rng);
  const h = 30.5; // just outside the block edge: the sidewalk
  const cx = (bi - 3) * 72;
  const cz = (bj - 3) * 72;
  const corners = [
    { x: cx - h, z: cz - h },
    { x: cx + h, z: cz - h },
    { x: cx + h, z: cz + h },
    { x: cx - h, z: cz + h },
  ];
  if (rng.chance(0.5)) corners.reverse();
  const ped = {
    kind: 'ped',
    mesh,
    heading: 0,
    speed: rng.range(1.1, 1.9),
    corners,
    wp: rng.int(0, 3),
    phase: rng.range(0, 6.28),
    down: 0,
    radius: 0.5,
  };
  const start = corners[ped.wp];
  mesh.position.set(start.x, 0, start.z);
  scene.add(mesh);
  return ped;
}

export function updatePed(dt, ped) {
  const pos = ped.mesh.position;
  if (ped.down > 0) {
    ped.down -= dt;
    ped.mesh.rotation.x = Math.max(-Math.PI / 2, ped.mesh.rotation.x - dt * 7);
    if (ped.down <= 0) {
      ped.mesh.rotation.x = 0;
      ped.mesh.position.y = 0;
    }
    return;
  }
  const target = ped.corners[(ped.wp + 1) % ped.corners.length];
  if (Math.hypot(target.x - pos.x, target.z - pos.z) < 1.2) ped.wp = (ped.wp + 1) % ped.corners.length;
  const desired = headingTo(pos, target);
  ped.heading = steerToward(ped.heading, desired, 6 * dt);
  pos.x += Math.sin(ped.heading) * ped.speed * dt;
  pos.z += Math.cos(ped.heading) * ped.speed * dt;
  ped.mesh.rotation.y = ped.heading;
  ped.phase += dt * ped.speed * 3.6;
  const swing = Math.sin(ped.phase) * 0.55;
  ped.mesh.userData.legL.rotation.x = swing;
  ped.mesh.userData.legR.rotation.x = -swing;
  ped.mesh.userData.armL.rotation.x = -swing * 0.7;
  ped.mesh.userData.armR.rotation.x = swing * 0.7;
}

/** Knock a pedestrian flat for a few seconds (they get up again; this is a cartoon). */
export function knockPed(ped) {
  if (ped.down > 0) return false;
  ped.down = 4.5;
  return true;
}
