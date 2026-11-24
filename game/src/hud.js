// The heads-up display: DOM bars and banners over the 3D view, plus a 2D canvas minimap.
// The minimap is north-up and player-centred: roads and blocks from the city layout, dots
// for traffic, peds, police and the mission target, and a wedge for the player.

import { ROAD_LINES, blockCenter, GRID, EXT } from './city.js';

export class Hud {
  constructor() {
    this.money = document.getElementById('money');
    this.healthFill = document.getElementById('health-fill');
    this.stars = document.getElementById('stars');
    this.missionBox = document.getElementById('mission');
    this.missionTitle = document.getElementById('mission-title');
    this.missionSub = document.getElementById('mission-sub');
    this.missionTime = document.getElementById('mission-time');
    this.prompt = document.getElementById('prompt');
    this.toastBox = document.getElementById('toast');
    this.bustBox = document.getElementById('bust');
    this.bustFill = document.getElementById('bust-fill');
    this.speed = document.getElementById('speed');
    this.radio = document.getElementById('radio');
    this.weapon = document.getElementById('weapon');
    this.airwarn = document.getElementById('airwarn');
    // Hidden-package counter chip. The markup ships without a slot for it, so
    // the chip is built here and docked under the cash readout: a small dark
    // pill with a mint border that always reads "PACKAGES n/20" and pulses
    // once whenever the count changes, so a pickup registers in the corner of
    // the eye even while the toast is busy with something else.
    this.packagesChip = document.createElement('div');
    this.packagesChip.id = 'packages-chip';
    this.packagesChip.textContent = 'PACKAGES 0/20';
    this.packagesChip.style.position = 'absolute';
    this.packagesChip.style.top = '64px';
    this.packagesChip.style.right = '18px';
    this.packagesChip.style.padding = '5px 12px';
    this.packagesChip.style.border = '1px solid #39ffb0';
    this.packagesChip.style.borderRadius = '999px';
    this.packagesChip.style.background = 'rgba(4, 24, 20, 0.72)';
    this.packagesChip.style.color = '#b8ffe2';
    this.packagesChip.style.font = '700 13px/1.2 system-ui, sans-serif';
    this.packagesChip.style.letterSpacing = '0.08em';
    this.packagesChip.style.pointerEvents = 'none';
    this.packagesChip.style.zIndex = '30';
    this.packagesChip.style.transition = 'transform 160ms ease';
    document.body.appendChild(this.packagesChip);
    this.packagesShown = -1;
    this.map = document.getElementById('minimap');
    this.mapCtx = this.map.getContext('2d');
    this.toastTimer = 0;
  }

  toast(text) {
    this.toastBox.textContent = text;
    this.toastBox.classList.add('show');
    this.toastTimer = 3.2;
  }

  update(dt, game) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastBox.classList.remove('show');
    }
    this.money.textContent = `$${Math.floor(game.cash)}`;
    // Keep the packages chip honest every frame: the collectibles system owns
    // the count and mirrors it onto game.packagesFound, the HUD only renders
    // it. A change of count gets one quick scale pulse as pickup feedback.
    const found = typeof game.packagesFound === 'number' ? game.packagesFound : 0;
    if (found !== this.packagesShown) {
      this.packagesShown = found;
      this.packagesChip.textContent = `PACKAGES ${found}/20`;
      this.packagesChip.style.transform = 'scale(1.18)';
      setTimeout(() => { this.packagesChip.style.transform = 'scale(1)'; }, 170);
      // A completed set turns the chip gold so the finished hunt stays
      // visible on the HUD for the rest of the session, not just in a toast.
      if (found >= 20) {
        this.packagesChip.style.borderColor = '#ffd94d';
        this.packagesChip.style.color = '#ffe98a';
        this.packagesChip.textContent = 'PACKAGES 20/20 ★ COMPLETE';
      }
    }
    this.healthFill.style.width = `${Math.max(0, Math.min(100, game.health))}%`;
    this.healthFill.style.background = game.health > 35 ? '#39d353' : '#e5484d';
    const lit = Math.ceil(game.wanted);
    this.stars.textContent = '★★★★★'.slice(0, lit) + '☆☆☆☆☆'.slice(0, 5 - lit);
    this.stars.style.opacity = game.wanted > 0 ? '1' : '0.25';
    const desc = game.missions.describe();
    if (desc) {
      this.missionBox.style.display = 'block';
      this.missionTitle.textContent = desc.title;
      this.missionTitle.style.color = desc.color;
      this.missionSub.textContent = desc.sub;
      const t = Math.ceil(desc.timeLeft);
      this.missionTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      this.missionTime.style.color = desc.timeLeft < 10 ? '#e5484d' : '#fff';
    } else {
      this.missionBox.style.display = 'none';
    }
    if (game.bustMeter > 0.02 && game.state === 'play') {
      this.bustBox.style.display = 'block';
      this.bustFill.style.width = `${Math.min(100, game.bustMeter * 100)}%`;
    } else {
      this.bustBox.style.display = 'none';
    }
    this.speed.textContent = game.inCar ? `${Math.round(Math.abs(game.playerCar.speed) * 2.4)} MPH` : '';
    // v2 systems on the HUD: the radio station now playing, pistol rounds on foot,
    // and the SKYHAWK-1 warning while air support is dispatched.
    if (this.radio) this.radio.textContent = game.radio ? `♪ ${game.radio.station().name}` : '';
    if (this.weapon) this.weapon.textContent = !game.inCar && game.weapons ? `PISTOL · ${game.weapons.ammo()} RDS` : '';
    if (this.airwarn) this.airwarn.style.display = game.air && game.air.active ? 'block' : 'none';
    this.drawMap(game);
  }

  drawMap(game) {
    const ctx = this.mapCtx;
    const S = this.map.width;
    const scale = S / 190; // show a 190-unit window around the player
    const pos = game.playerPos();
    ctx.fillStyle = '#101018';
    ctx.fillRect(0, 0, S, S);
    ctx.save();
    ctx.translate(S / 2, S / 2);
    // Blocks and roads.
    ctx.fillStyle = '#2c2c38';
    for (let i = 0; i < GRID; i += 1) {
      for (let j = 0; j < GRID; j += 1) {
        const x = (blockCenter(i) - pos.x) * scale;
        const y = (blockCenter(j) - pos.z) * scale;
        const sz = 56 * scale;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    ctx.strokeStyle = '#45455a';
    ctx.lineWidth = 2;
    for (const line of ROAD_LINES) {
      const v = (line - pos.x) * scale;
      ctx.beginPath();
      ctx.moveTo(v, -S / 2);
      ctx.lineTo(v, S / 2);
      ctx.stroke();
      const hz = (line - pos.z) * scale;
      ctx.beginPath();
      ctx.moveTo(-S / 2, hz);
      ctx.lineTo(S / 2, hz);
      ctx.stroke();
    }
    const dot = (x, z, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((x - pos.x) * scale, (z - pos.z) * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const ped of game.peds) if (ped.down <= 0) dot(ped.mesh.position.x, ped.mesh.position.z, '#8f8fa3', 1.6);
    for (const car of game.traffic) dot(car.mesh.position.x, car.mesh.position.z, '#c9ccd6', 2.4);
    const flash = Math.floor(game.time * 4) % 2 === 0;
    for (const cop of game.police) dot(cop.mesh.position.x, cop.mesh.position.z, flash ? '#ff4040' : '#4070ff', 3);
    if (game.air && game.air.active) {
      // SKYHAWK-1 on the map: a pale gold blip with its searchlight pool ring.
      const hp = game.air.mesh.position;
      dot(hp.x, hp.z, '#fff2b0', 3.4);
      ctx.strokeStyle = 'rgba(255,242,176,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc((hp.x - pos.x) * scale, (hp.z - pos.z) * scale, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    const target = game.missions.target();
    if (target) {
      const tx = (target.x - pos.x) * scale;
      const ty = (target.z - pos.z) * scale;
      ctx.strokeStyle = target.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 6 + Math.sin(game.time * 5) * 1.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Player wedge: canvas y runs with world +z, so the wedge turns by PI - heading.
    const heading = game.playerHeading();
    ctx.fillStyle = '#ffffff';
    ctx.save();
    ctx.rotate(Math.PI - heading);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5, 6);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // City edge warning tint when near the island rim.
    if (Math.abs(pos.x) > EXT - 30 || Math.abs(pos.z) > EXT - 30) {
      ctx.strokeStyle = 'rgba(255,80,80,0.5)';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, S, S);
    }
  }

  setPrompt(text) {
    if (text) {
      this.prompt.textContent = text;
      this.prompt.style.display = 'block';
    } else {
      this.prompt.style.display = 'none';
    }
  }
}
