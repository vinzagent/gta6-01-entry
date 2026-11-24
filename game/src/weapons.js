// Street hardware: a single holdout pistol, because Vice Harbor runs on fists, wheels
// and nerve before it runs on guns. On foot, F fires toward your facing: a hit pops a
// tyre's worth of trouble into the nearest target in the cone — a car shudders and slows,
// a pedestrian dives flat, and the law takes it very personally. Ammo is finite, shown
// on the HUD, topped up at the garage, and every shot is a crime the stars remember.

const RANGE = 26;
const CONE = 0.42; // radians of slack either side of the facing

export class Weapons {
  constructor(scene, save) {
    this.scene = scene;
    this.save = save;
    this.cooldown = 0;
    // A tracer line that flashes for a frame on each shot.
    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0 });
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(geo, this.tracerMat);
    this.tracer.frustumCulled = false;
    this.scene.add(this.tracer);
  }

  ammo() {
    return this.save.ammo;
  }

  /** Buy a 12-round box at the garage; never charges for rounds you cannot hold. */
  buyAmmo(save, price = 60) {
    if (save.cash < price) return { ok: false, line: `Need $${price} for a box of rounds` };
    save.cash -= price;
    save.ammo += 12;
    return { ok: true, line: `Ammo +12 — ${save.ammo} rounds in the pouch` };
  }

  /**
   * Fire once from `origin` along `heading`. Returns a hit record or null. Targets are
   * the game's cars and pedestrians; the tracer and the sound are the caller's cue that
   * the shot really left the barrel, hit or miss.
   */
  fire(game, origin, heading) {
    if (this.cooldown > 0) return null;
    this.cooldown = 0.28;
    if (this.save.ammo <= 0) {
      game.toast('Click — out of ammo. The garage sells rounds (G)');
      game.sfx.blip(140);
      return null;
    }
    this.save.ammo -= 1;
    game.sfx.shot();
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let best = null;
    let bestDist = RANGE;
    const consider = (obj, x, z, radius) => {
      const dx = x - origin.x;
      const dz = z - origin.z;
      const dist = Math.hypot(dx, dz);
      if (dist > RANGE + radius || dist < 0.6) return;
      const ang = Math.abs(Math.atan2(dx, dz) - heading + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      if (Math.abs(ang) > CONE) return;
      if (dist < bestDist) { bestDist = dist; best = obj; }
    };
    for (const car of [...game.traffic, ...game.parked, ...game.police]) {
      consider(car, car.mesh.position.x, car.mesh.position.z, 2.2);
    }
    for (const ped of game.peds) {
      if (ped.down <= 0) consider(ped, ped.mesh.position.x, ped.mesh.position.z, 0.6);
    }
    // Draw the tracer from the muzzle to the hit point (or the full range on a miss).
    const endDist = best ? bestDist : RANGE;
    const pts = [
      new THREE.Vector3(origin.x, 1.25, origin.z),
      new THREE.Vector3(origin.x + fx * endDist, 1.1, origin.z + fz * endDist),
    ];
    this.tracer.geometry.setFromPoints(pts);
    this.tracerMat.opacity = 0.95;
    if (best) {
      if (best.kind === 'ped') {
        best.down = 3.5;
        game.toast('You winged a pedestrian — the stars noticed');
      } else {
        best.health = (best.health ?? 100) - 34;
        best.speed *= 0.35;
        game.toast(best.kind === 'police' ? 'You shot a cruiser!' : 'Shots into a car — bold move');
      }
    }
    return best;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.tracerMat.opacity > 0) this.tracerMat.opacity = Math.max(0, this.tracerMat.opacity - dt * 7);
  }
}
