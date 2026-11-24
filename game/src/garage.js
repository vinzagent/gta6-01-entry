// The Neon Tide Garage: where mission cash turns into machinery. Cars bought here are
// yours for good — they live in the save, roll out beside you when called, and keep the
// upgrades fitted to the fleet: engine tunes that raise every owned car's top speed and
// armour plating that shrinks the damage your runs take. Press G to open the doors.

export const CAR_CATALOG = [
  { id: 'runabout', name: 'Runabout Coupe', price: 0, color: 0xd64545, topSpeed: 31, note: 'The starter ride. Honest, slow, yours.' },
  { id: 'palmetto', name: 'Palmetto GT', price: 900, color: 0x38b6b0, topSpeed: 36, note: 'Island muscle with a surfboard soul.' },
  { id: 'nightfox', name: 'Nightfox S', price: 2200, color: 0x7040c0, topSpeed: 41, note: 'Purple menace. Built to outrun cruisers.' },
  { id: 'sunspike', name: 'Sunspike Hyper', price: 4500, color: 0xe0a83c, topSpeed: 47, note: 'The fastest legal-ish thing in Vice Harbor.' },
];

export const UPGRADE_TRACKS = [
  { id: 'engine', name: 'Engine Tune', max: 3, basePrice: 350, note: '+12% top speed per level, fleet-wide.' },
  { id: 'armor', name: 'Armour Plating', max: 3, basePrice: 300, note: '-15% damage taken per level, fleet-wide.' },
];

export function catalogCar(id) {
  return CAR_CATALOG.find((c) => c.id === id) || CAR_CATALOG[0];
}

export function upgradePrice(track, level) {
  return track.basePrice * (level + 1);
}

/** Top-speed multiplier from the fitted engine tune. */
export function engineFactor(save) {
  return 1 + 0.12 * (save.upgrades.engine || 0);
}

/** Damage multiplier from the fitted armour: plating only ever helps. */
export function armorFactor(save) {
  return Math.max(0.4, 1 - 0.15 * (save.upgrades.armor || 0));
}

/**
 * Buy a catalog car into the save. Returns a result line for the HUD; a car already in
 * the garage is never charged for twice, so double-clicks and reloads stay harmless.
 */
export function buyCar(save, carId) {
  const car = catalogCar(carId);
  if (save.ownedCars.includes(carId)) return { ok: false, line: `${car.name} is already in your garage` };
  if (save.cash < car.price) return { ok: false, line: `Need $${car.price} for the ${car.name} — you have $${Math.floor(save.cash)}` };
  save.cash -= car.price;
  save.ownedCars.push(carId);
  return { ok: true, line: `${car.name} is yours — it rolls out beside you` };
}

/** Fit the next level of an upgrade track, charging once per level. */
export function buyUpgrade(save, trackId) {
  const track = UPGRADE_TRACKS.find((t) => t.id === trackId);
  if (!track) return { ok: false, line: 'Unknown upgrade' };
  const level = save.upgrades[trackId] || 0;
  if (level >= track.max) return { ok: false, line: `${track.name} is already maxed out` };
  const price = upgradePrice(track, level);
  if (save.cash < price) return { ok: false, line: `Need $${price} for ${track.name} Lv${level + 1}` };
  save.cash -= price;
  save.upgrades[trackId] = level + 1;
  return { ok: true, line: `${track.name} fitted — level ${level + 1}` };
}

/** Render the garage panel's inner HTML from the current save. */
export function garageHtml(save) {
  const cars = CAR_CATALOG.map((car) => {
    const owned = save.ownedCars.includes(car.id);
    return `<div class="shop-row"><span><b>${car.name}</b> — ${car.note}</span>` +
      (owned ? '<span class="owned">OWNED</span>' : `<button data-buy-car="${car.id}">BUY $${car.price}</button>`) + '</div>';
  }).join('');
  const ups = UPGRADE_TRACKS.map((track) => {
    const level = save.upgrades[track.id] || 0;
    const maxed = level >= track.max;
    return `<div class="shop-row"><span><b>${track.name}</b> Lv${level}/${track.max} — ${track.note}</span>` +
      (maxed ? '<span class="owned">MAXED</span>' : `<button data-buy-upgrade="${track.id}">FIT $${upgradePrice(track, level)}</button>`) + '</div>';
  }).join('');
  return `<h1>NEON TIDE GARAGE</h1><p>Cash on hand: <b>$${Math.floor(save.cash)}</b> · G closes the doors</p>${cars}${ups}`;
}
