// A working gta6-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. Only the plumbing, not an open world: Block
// Dodger, a plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a
// title screen, score, lives and levels, game over and restart, flat colours and no sound. Build
// your own open-world crime game in its place (three.js or any library you vendor under game/),
// put your 3 or 4 PNG or JPEG screenshots in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Vice Harbor hand-in guard (authored for this entry): the judge reads the dossier cold, so
// refuse to hand in anything that is not the full, playable package — the game's own
// index.html present in game/, and a complete set of three or four real screenshots, each
// inside the scorer's 256 KiB cap. Failing loudly here beats a silent, thin dossier.
const gameEntry = join(out, 'game', 'index.html');
if (!existsSync(gameEntry)) {
  throw new Error('hand-in refused: game/index.html is missing, the game would not load');
}
const shotDir = join(out, 'screenshots');
const shotNames = existsSync(shotDir)
  ? readdirSync(shotDir).filter((name) => /\.(png|jpe?g)$/i.test(name)).sort()
  : [];
if (shotNames.length < 3 || shotNames.length > 4) {
  throw new Error(`hand-in refused: expected 3 or 4 screenshots, found ${shotNames.length}`);
}
for (const name of shotNames) {
  const bytes = statSync(join(shotDir, name)).size;
  if (bytes > 262144) {
    throw new Error(`hand-in refused: screenshot ${name} is ${bytes} bytes, over the 256 KiB cap`);
  }
}
// Vice Harbor v2 package check: the six v2 systems live in their own modules under
// game/src/ (missions graph, air support, radio, save, garage, weapons). Refuse to hand
// in a package where one of them went missing — a thin dossier would read as the old
// game to the judge, and v1's 984.522 is the bar this build has to clear.
const v2Modules = ['missions.js', 'airSupport.js', 'radio.js', 'save.js', 'garage.js', 'weapons.js'];
for (const name of v2Modules) {
  const modulePath = join(out, 'game', 'src', name);
  if (!existsSync(modulePath)) {
    throw new Error(`hand-in refused: v2 module game/src/${name} is missing from the package`);
  }
  // An empty or stub module would pass a presence check while shipping nothing, so
  // hold each system to a real minimum size as well (the smallest genuine one, the
  // save ledger, is well over a kilobyte of code).
  const moduleBytes = statSync(modulePath).size;
  if (moduleBytes < 1000) {
    throw new Error(`hand-in refused: v2 module game/src/${name} is only ${moduleBytes} bytes, a stub is not a system`);
  }
}
console.log(`Vice Harbor hand-in: game/index.html plus ${shotNames.length} screenshots (${shotNames.join(', ')}) and ${v2Modules.length} v2 system modules`);

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
