import './styles.css';
import { Game } from './game.js';
import { newGame } from './state.js';
import { GUARDIANS, TECHNIQUE_ORDER, heroStats } from './content/game-data.js';

const game = new Game({ canvas: document.querySelector('#game'), stage: document.querySelector('#stage') });

/** DEV-only shortcuts for building and reviewing slices (stripped from production builds). */
async function applyDevRoute(params) {
  const progressed = (friends, techniques) => {
    const state = newGame();
    state.started = true;
    state.friends = Array.from({ length: friends }, (_, i) => i);
    state.techniques = TECHNIQUE_ORDER.slice(0, techniques);
    state.lessons = [...state.techniques];
    const stats = heroStats(state);
    state.hero = { hp: stats.maxHp, bytes: stats.maxBytes, snacks: 3 };
    return state;
  };
  game.saving = !params.has('nosave');
  if (params.has('gallery')) {
    const { GalleryScene } = await import('./scenes/gallery.js');
    game.scene = new GalleryScene(game, params.get('gallery'));
    return;
  }
  if (params.has('zone')) {
    const zone = Math.max(0, Math.min(6, Number(params.get('zone')) || 0));
    game.state = progressed(zone, zone);
    game.worldScene.reset();
    game.scene = game.worldScene;
    game.worldScene.world.devPlace(zone);
    game.worldScene.enter({});
    return;
  }
  if (params.has('battle')) {
    const foeId = params.get('battle');
    const guardian = GUARDIANS.find((g) => g.key === foeId);
    const zone = guardian ? guardian.zone : Number(foeId.split('-')[1]) || 0;
    const friends = params.has('friends') ? Number(params.get('friends')) : guardian ? guardian.id : zone;
    game.state = progressed(friends, Math.max(friends, zone + 1));
    game.worldScene.reset();
    game.scene = game.battleScene;
    game.battleScene.enter({ foeId, guardian: Boolean(guardian), uid: `dev-${foeId}`, zone });
    return;
  }
  const scene = params.get('scene');
  if (scene === 'intro') game.scene = game.introScene;
  else if (scene === 'ending') game.scene = game.endingScene;
  game.scene.enter?.({});
}

if (import.meta.env.DEV) {
  window.__bitbound = game;
  const params = new URLSearchParams(location.search);
  if ([...params.keys()].length) applyDevRoute(params);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  game.update(dt);
  game.draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('pagehide', () => game.save());
