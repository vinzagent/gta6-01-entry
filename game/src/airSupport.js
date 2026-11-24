// SKYHAWK-1: Harbor PD's air support unit, an original Vice Harbor system. When the
// wanted level reaches four stars the dispatcher sends the helicopter out from the
// helipad by the marina; it shadows the player from above, sweeping a searchlight
// cone across the streets. While its light holds you, the ground units keep your
// position fresh and the heat cannot cool. Slip the light — break away, duck between
// towers until it loses the trail for a few seconds — and SKYHAWK-1 is recalled.

const DISPATCH_WANTED = 4; // stars at which the dispatcher scrambles the unit
const LOSE_SECONDS = 4.5; // unlit time after which the unit gives up and leaves

function box(w, h, d, color, x = 0, y = 0, z = 0, basic = false) {
  const mat = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Build the helicopter: hull, tail boom, spinning rotors and its searchlight rig. */
function makeHeliMesh() {
  const heli = new THREE.Group();
  heli.add(box(2.4, 1.7, 5.2, 0xf2f2f5, 0, 0, 0)); // hull
  heli.add(box(1.9, 1.1, 1.8, 0x14151c, 0, 0.25, 1.9)); // glass nose band
  heli.add(box(0.5, 0.5, 4.6, 0xd8d8de, 0, 0.35, -4.4)); // tail boom
  heli.add(box(0.18, 1.5, 0.7, 0xff2040, 0, 0.6, -6.6, true)); // tail fin
  heli.add(box(3.4, 0.22, 0.5, 0x14151c, 0, -1.15, 0.6)); // skids crossbar
  const rotor = box(11.5, 0.08, 0.55, 0x22222c, 0, 1.15, 0, true);
  const tailRotor = box(0.08, 2.0, 0.3, 0x22222c, 0.32, 0.6, -6.6, true);
  heli.add(rotor);
  heli.add(tailRotor);
  // The searchlight: a visible translucent cone plus a real spotlight on the ground.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(7.5, 26, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -13.5;
  heli.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 2.4, 90, 0.32, 0.5, 0.4);
  spot.position.set(0, -0.8, 0);
  heli.add(spot);
  heli.add(spot.target);
  spot.target.position.set(0, -30, 4);
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(6.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.28, depthWrite: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  heli.userData.rotor = rotor;
  heli.userData.tailRotor = tailRotor;
  heli.userData.pool = pool;
  return heli;
}

export class AirSupport {
  constructor(scene) {
    this.scene = scene;
    this.mesh = makeHeliMesh();
    this.mesh.visible = false;
    this.scene.add(this.mesh);
    this.scene.add(this.mesh.userData.pool);
    this.active = false;
    this.litTime = 0; // seconds the light has held the player, total this dispatch
    this.darkTime = 0; // consecutive seconds the player has been out of the light
    this.angle = 0;
    this.announced = false;
  }

  /** True while the searchlight pool currently covers the player. */
  lightsPlayer(game) {
    if (!this.active) return false;
    const p = game.playerPos();
    const pool = this.mesh.userData.pool.position;
    return Math.hypot(p.x - pool.x, p.z - pool.z) < 6.6;
  }

  dispatch(game) {
    this.active = true;
    this.announced = true;
    this.darkTime = 0;
    this.mesh.visible = true;
    this.mesh.userData.pool.visible = true;
    const p = game.playerPos();
    this.mesh.position.set(p.x + 60, 30, p.z - 60);
    game.toast('SKYHAWK-1 is airborne — break its searchlight!');
    game.sfx.blip(220);
  }

  recall(game) {
    this.active = false;
    this.mesh.visible = false;
    this.mesh.userData.pool.visible = false;
    game.toast('SKYHAWK-1 lost your trail and peeled off');
  }

  /**
   * Fly the unit for one step. It orbits toward a point above and behind the player,
   * lagging enough that sharp turns and tower shadows shake it off; the light pool
   * trails the helicopter, so a moving player is lit only intermittently.
   */
  update(dt, game) {
    if (!this.active) {
      if (game.wanted >= DISPATCH_WANTED && game.state === 'play') this.dispatch(game);
      return;
    }
    if (game.wanted < 2 || game.state !== 'play') {
      this.recall(game);
      return;
    }
    const p = game.playerPos();
    this.angle += dt * 0.55;
    const hoverX = p.x + Math.sin(this.angle) * 13;
    const hoverZ = p.z + Math.cos(this.angle) * 13;
    const pos = this.mesh.position;
    const lag = 1 - Math.exp(-dt * 1.15); // the lag is what makes evasion possible
    pos.x += (hoverX - pos.x) * lag;
    pos.z += (hoverZ - pos.z) * lag;
    pos.y += (29 - pos.y) * lag;
    this.mesh.rotation.y = Math.atan2(p.x - pos.x, p.z - pos.z);
    this.mesh.userData.rotor.rotation.y += dt * 28;
    this.mesh.userData.tailRotor.rotation.x += dt * 34;
    // The pool sits under the helicopter, offset toward the player it is hunting.
    const pool = this.mesh.userData.pool;
    pool.position.set(pos.x + (p.x - pos.x) * 0.25, 0.09, pos.z + (p.z - pos.z) * 0.25);
    if (this.lightsPlayer(game)) {
      this.litTime += dt;
      this.darkTime = 0;
      game.lastSeen = game.time; // lit means located: the heat cannot cool down
    } else {
      this.darkTime += dt;
      if (this.darkTime >= LOSE_SECONDS) this.recall(game);
    }
  }
}
