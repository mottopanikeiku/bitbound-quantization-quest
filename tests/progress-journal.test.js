import test from 'node:test';
import assert from 'node:assert/strict';
import { Journal, JOURNAL_TABS } from '../src/ui/journal.js';
import { newGame } from '../src/state.js';
import { INTERACTABLES, START } from '../src/world/map.js';
function fixture(device = 'keyboard') {
  const state = newGame(), announcements = [], pins = [], hats = [];
  const game = { state, input: { lastDevice: device }, announce: text => announcements.push(text), audio: { play() {} }, worldScene: { world: { hero: { ...START } } }, setPin(id) { pins.push(id); state.pin = id; }, setHat(id) { hats.push(id); state.hat = id; } };
  const journal = new Journal(game);
  const act = (...actions) => journal.update(.016, { pressed: key => actions.includes(key), repeat: key => actions.includes(key), consume() {} });
  return { state, game, journal, act, announcements, pins, hats };
}
test('Journal has five tabs, 21 dex entries, 20 stamps and six hat choices plus bare head', () => {
  const f = fixture(); assert.deepEqual(JOURNAL_TABS, ['map', 'dex', 'badges', 'records', 'look']);
  for (const [tab, count] of [['dex', 21], ['badges', 20], ['look', 7], ['records', 9]]) { f.journal.open({ tab }); assert.equal(f.journal.entries().length, count); }
});
test('keyboard and touch actions browse every page and announce correct confirm/back names', () => {
  for (const device of ['keyboard', 'touch']) {
    const f = fixture(device); f.journal.open();
    for (let i = 0; i < 5; i++) { assert.equal(f.journal.page, JOURNAL_TABS[i]); f.act('right'); }
    assert.equal(f.journal.page, 'map');
    assert.ok(f.announcements.some(text => text.includes(device === 'touch' ? 'A chooses' : 'Enter chooses')));
    assert.ok(f.announcements.some(text => text.includes(device === 'touch' ? 'B goes back' : 'Escape goes back')));
  }
});
test('Map knowledge follows contiguous friends; unknown hidden shard coordinates cannot be pinned', () => {
  const f = fixture(); f.state.friends = [0, 2]; f.journal.open({ tab: 'map' });
  assert.deepEqual(f.journal.knownRegions().map(r => r.id), [-1, 0, 1]);
  for (const region of f.journal.knownRegions()) assert.ok(f.journal.landmarks(region).every(i => i.interaction !== 'shard'));
  const shard = INTERACTABLES.find(i => i.zone < 0 && i.interaction === 'shard'); f.state.shards.push(shard.id);
  assert.ok(f.journal.landmarks(f.journal.entries()[0].region).some(i => i.id === shard.id));
});
test('Map confirmation pins a known landmark, never moves position; repeat confirmation clears pin', () => {
  const f = fixture(); f.journal.open({ tab: 'map' }); const position = structuredClone(f.game.worldScene.world.hero);
  f.act('confirm'); assert.equal(f.journal.detail, true); assert.match(f.announcements.at(-1), /pins it/);
  f.act('confirm'); assert.equal(f.pins.length, 1); assert.ok(INTERACTABLES.some(i => i.id === f.state.pin)); assert.deepEqual(f.game.worldScene.world.hero, position);
  f.act('confirm'); assert.equal(f.state.pin, null);
});
test('Escape returns from detail before closing even when Input also reports pause', () => {
  const f = fixture(); let closed = 0; f.journal.open({ tab: 'dex', onClose: () => closed++ });
  f.act('confirm'); assert.equal(f.journal.detail, true); f.act('cancel', 'pause'); assert.equal(f.journal.detail, false); assert.equal(f.journal.active, true);
  f.act('cancel', 'pause'); assert.equal(f.journal.active, false); assert.equal(closed, 1);
});
test('Look wears only unlocked hats and can remove them', () => {
  const f = fixture('touch'); f.journal.open({ tab: 'look' }); f.act('down'); f.act('confirm'); assert.deepEqual(f.hats, []); assert.match(f.announcements.at(-1), /Locked/);
  f.state.progress.well.best = 5; f.act('confirm'); assert.deepEqual(f.hats, ['lantern-cap']);
  f.act('up'); f.act('confirm'); assert.equal(f.state.hat, null);
});
test('Records distinguish separate guardian extremes, bond levels, Fen and wardens', () => {
  const f = fixture(); f.state.bonds.nib = 8; f.journal.open({ tab: 'records' });
  assert.ok(f.journal.detailLines(f.journal.entries()[0]).some(line => line.includes('bond level 3')));
  assert.ok(f.journal.detailLines(f.journal.entries().at(-1)).some(line => line.includes('separate from the 21-species')));
});
