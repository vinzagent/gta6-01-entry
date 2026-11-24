// Persistent progress for Vice Harbor: cash, finished story missions, rewards already
// claimed, the cars in your garage, the upgrades fitted to them, pistol ammo and the
// radio station you left playing. Everything lives in one localStorage record so a
// reload, a bust or a wasted run never wipes the story — only the current heat resets.

const SAVE_KEY = 'viceHarborSaveV2';

export const DEFAULT_SAVE = {
  cash: 100,
  completed: [],
  claimed: [],
  ownedCars: ['runabout'],
  upgrades: { engine: 0, armor: 0 },
  ammo: 24,
  station: 0,
  missionsDone: 0,
  packages: [],
  packagesBonus: false,
};

/** Read the saved record, tolerating a missing or damaged one by starting fresh. */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SAVE, ...parsed, upgrades: { ...DEFAULT_SAVE.upgrades, ...(parsed.upgrades || {}) } };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

/** Write the record back. Called whenever cash, missions, garage or ammo change. */
export function storeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Private mode or a full store: the run simply continues unsaved.
  }
}

/** Wipe the record (used by the title screen's fresh-start key). */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/**
 * Pay a mission reward exactly once per mission id, however often the mission is
 * replayed, retried or reloaded: the claimed list is the ledger, and a reward whose
 * id is already in it pays nothing. Returns the amount actually paid.
 */
export function claimReward(save, missionId, amount) {
  if (save.claimed.includes(missionId)) return 0;
  save.claimed.push(missionId);
  save.cash += amount;
  return amount;
}
