// Island voices. Technical sentences come from Teaching's verified FACTS; the
// short seed fallbacks below use the build contract's cited facts, never toy damage.
import { FACTS } from '../content/lessons.js';
import { GUARDIANS, ZONES, TECHNIQUES } from '../content/game-data.js';
import { PORTRAIT_IDS } from '../art/portraits.js';
import { PUZZLES } from './puzzles.js';

export const INTRO_HINT = 'WASD / arrows walk. Shift runs. Enter talks. Esc pauses. N opens Field Notes.';
const SEEDS = {
  hub: ['Eight bits make one byte.', 'A 16-bit number takes two bytes; a 4-bit code takes half a byte.'],
  meadow: ['b bits give 2^b codes. Four bits give 16 codes.', 'Nearest-level rounding is off by at most half a step, unless the value clips.'],
  grove: ['A zero-point shifts the grid so lopsided data can use every code.', 'Narrow symmetric INT4 uses -7 through 7; the -8 code goes unused.'],
  cove: ['Calibration uses sample inputs to choose ranges before deployment. It is not retraining.', 'Values beyond the chosen range clip to an endpoint.'],
  heights: ['Group-wise quantization gives each block of weights its own scale.', 'A group of 128 weights can share one FP16 scale.'],
  forge: ['LLM.int8() keeps rare outlier feature dimensions in 16-bit and the rest in 8-bit.', 'A 16-bit number takes two bytes.'],
  archives: ['SmoothQuant divides activation channels by a factor and multiplies the matching weights by it.', 'Before rounding, those opposite rescalings leave their product unchanged.'],
  spire: ['Eight billion 4-bit weights need about 4 GB for codes, plus scales and other metadata.', 'The KV cache can be quantized separately from the weights.'],
};
const names = {
  'point-keeper': 'Keeper Moss', 'point-kid': 'Pip', 'point-fisher': 'Nella', 'point-cat': 'Deputy Crumb',
  'meadow-npc-a': 'Dr. Petal', 'meadow-npc-b': 'Beet',
  'grove-npc-a': 'Professor Tink', 'grove-npc-b': 'Fern',
  'cove-npc-a': 'Tern', 'cove-npc-b': 'Captain Maybe',
  'heights-npc-a': 'Gus', 'heights-npc-b': 'Ada',
  'forge-npc-a': 'Juniper', 'forge-npc-b': 'Mica',
  'archives-npc-a': 'Ms. Hush', 'archives-npc-b': 'Pip, somehow',
  'spire-npc-a': 'Dr. Almost', 'spire-npc-b': 'Gus, again',
};
const voice = (npc, text) => ({
  speaker: names[npc.id] ?? 'Island friend',
  portrait: PORTRAIT_IDS.includes(npc.character) ? npc.character : 'keeper',
  text,
});
export function fact(zone, index = 0) {
  const key = zone < 0 ? 'hub' : ZONES[zone].key;
  const verified = FACTS[key];
  return verified?.length ? verified[index % verified.length] : SEEDS[key][index % SEEDS[key].length];
}

const JOKES = {
  'meadow-npc-a': ['My research says flowers like compliments. The control group got polite nods.', 'Nib has forgotten all the shades between leaf and leaf. Please help our little sprout.'],
  'meadow-npc-b': ['I tried to put the whole meadow in my pocket. Now my pocket is a meadow.', 'The bridge stones want the *same rung*, not a perfect copy of every height. Try fewer bits.'],
  'grove-npc-a': ['My bell rings slightly to the right. I call it an offset. The neighbours call it 6 a.m.', 'The glowing Grid Stone knows how to shift a grid. Chime needs that kind of kindness.'],
  'grove-npc-b': ['I grew a square tomato. It keeps asking whether it is a fruit or a tile.', 'Our bridge has *two different banks*: 0.9 and 1.8. With only 2 bits, put zero at code 0 and make room on the positive side.'],
  'cove-npc-a': ['My weather forecast is a crab holding a damp biscuit. Surprisingly well calibrated.', 'Brine has calm days and storm days. A tiny range is lovely until a very large wave arrives.'],
  'cove-npc-b': ['Captain Maybe, at your service. We leave at approximately yes.', 'The forecast says *high tide*. Select the Tide Gauge’s high-tide archive and cover its old peak. The covered stones reveal today’s heights only after you lock.'],
  'heights-npc-a': ['I packed three scarves. One for the wind, one for my dignity, one for emergencies involving soup.', 'Spindle weaves thick and tiny threads. One huge ruler can overlook the little ones.'],
  'heights-npc-b': ['I am measuring the mountain in teaspoons. My grant application said “small-scale research.”', 'Our staircase has big, medium and tiny rows. Give each the matching ruler at *3 bits*. The 10-byte packet includes the extra scales; they are not free magic.'],
  'forge-npc-a': ['This anvil is named Clang. Its brother is also named Clang. Family dinners are difficult.', 'A tiny weight error can matter a lot when a big input multiplies it. Watch the hot channels.'],
  'forge-npc-b': ['Cinder warmed my lunch, my backpack and a geological era. Very considerate.', 'The second pressure plate carries *eighteen times* the load. Keep that one exact with Spotlight. The light plates may round; flattening all four is no help.'],
  'archives-npc-a': ['Please whisper. The dictionaries are nesting.', 'Vesper filed an outlier under “too enormous for this shelf.” Try balancing the load first.'],
  'archives-npc-b': ['I took a shortcut through the index. Do not try the appendix. There are actual appendages.', 'The crossing rounds *both inputs and weights*. Divide the first input by 8 and multiply its weight by 8: the product stays 1 before rounding. Then keep all four products within 20%.'],
  'spire-npc-a': ['At the top of knowledge stands a dragon. At the bottom stands me, looking for my pencil.', 'Auric has several heads to care for. Spend precision where the error matters, not equally out of politeness.'],
  'spire-npc-b': ['Good news: I reached the summit. Bad news: the summit has more summit.', 'The last crossing has just *15 bytes* of packet space. Try 4 bits for the fine row, 3 for the middle, 2 for the coarse. Then seven friends, and home to the lighthouse.'],
};

export function npcDialogue(npc, state, first = false) {
  const friends = state.friends.length;
  if (npc.id === 'point-keeper') {
    if (friends === 7) return [voice(npc, 'Seven colours. Seven friends. And you, with considerably more pockets than when you left.'), voice(npc, 'Bring them into the lighthouse. The Oracle is ready to come home.')];
    if (first) return [
      voice(npc, 'Welcome to Lighthouse Point, cartographer. The Static has stolen our island’s in-between colours.'),
      voice(npc, INTRO_HINT),
      voice(npc, 'Take the west path to Bitleaf Meadow. Wake its *Grid Stone*, then help Nib at the shrine.'),
      voice(npc, 'Campfires refill you. Little Staticlings chase, but running helps. We befriend the big spirits; nobody gets squashed.'),
    ];
    return [voice(npc, `${friends} of seven friends. The kettle believes in you. So do I.`), voice(npc, fact(-1, 1)), voice(npc, 'Follow the objective arrow. The next Grid Stone is always waiting before its guardian.')];
  }
  if (npc.id === 'point-kid') return [voice(npc, 'I hid two bit shards in the village. This is either a treasure hunt or very untidy accounting.'), voice(npc, fact(-1, 0)), voice(npc, 'Collect eight shards and your byte pouch grows. The cliffs are not a shortcut. I checked.')];
  if (npc.id === 'point-fisher') return [voice(npc, 'The fish are biting. Mostly my thesis.'), voice(npc, fact(-1, 1)), voice(npc, 'The dock is for thinking. West is for adventures. Please do not mix those up at speed.')];
  if (npc.id === 'point-cat') return [{ speaker: 'Deputy Crumb', portrait: 'kid', text: 'Mrrp. (You receive no technical advice. It is strangely refreshing.)' }];
  const jokes = JOKES[npc.id];
  const restored = state.friends.includes(npc.zone);
  return [voice(npc, jokes[0]), voice(npc, fact(npc.zone, npc.id.endsWith('-b') ? 1 : 0)), voice(npc, restored ? `${GUARDIANS[npc.zone].name} is back, and so are the colours. ${npc.zone === 5 ? 'The books are showing off their jackets.' : 'Even the shadows look relieved.'}` : jokes[1])];
}

export function signText(zone) {
  if (zone < 0) return ['LIGHTHOUSE POINT', 'West: Bitleaf Meadow. Enter talks / examines. Shift runs.', 'Campfires heal. N opens Field Notes. Look for the floating 0 / 1 shards.'];
  const next = zone === 6 ? 'Lighthouse Point, when all seven are friends' : ZONES[zone + 1].name;
  return [ZONES[zone].name, '*Grid Stone* → guardian shrine → next gate. Follow the objective arrow through each region’s own paths.', `Next: ${next}. Side trails lead to a cache and a hidden bit shard.`, `SNAP BRIDGE: ${PUZZLES[zone].goal} ${PUZZLES[zone].hint}`];
}

export function stoneText(zone) {
  return { speaker: 'Grid Stone', portrait: 'oracle', text: [
    'Little values, little lanterns. Turn the *Bit Dial* and watch how the spaces change.',
    'The world is not always centred. Let *Zero-Shift* make room on the crowded side.',
    'Listen to yesterday’s waves. The *Tide Gauge* remembers; tomorrow still surprises.',
    'A mountain and a seed deserve different rulers. Try *Group Rulers*.',
    'Not every error speaks at the same volume. A *Spotlight* protects what matters.',
    'What one hand releases, the other can carry. *Balance* first, then round.',
    'You cannot carry infinite precision. Give your *Bit Budget* a purpose.',
  ][zone] };
}

export function shrineDialogue(zone) {
  const guardian = GUARDIANS[zone];
  return [
    { speaker: guardian.name, portrait: guardian.key, text: [
      'I used to know seventeen greens. Now I know... crunchy. Can you help?',
      'Ding. D... dong? My notes keep falling off one side of the world.',
      'I tried to hold the whole sea still. It did not appreciate that.',
      'My little thread! I can see it. Why can’t the enormous ruler see it?',
      'I made the numbers small. But the hot ones still shout through my chimney.',
      'One very loud value is shushing every other book. This is not library etiquette.',
      'Seven kinds of wisdom. One small satchel. Show me what is worth carrying.',
    ][zone] },
    { speaker: 'Gridstaff', portrait: 'hero', text: `No swords. No squashing. Let’s help ${guardian.name} find a clearer shape.` },
  ];
}

export function interactionName(item, state) {
  if (item.interaction === 'npc') return `Talk: ${names[item.id] ?? 'friend'}`;
  if (item.interaction === 'camp') return 'Rest & refill';
  if (item.interaction === 'stone') return state.techniques.includes(ZONES[item.zone].technique) ? 'Awakened Grid Stone' : `Learn ${TECHNIQUES[ZONES[item.zone].technique].name}`;
  if (item.interaction === 'shrine') return state.friends.includes(item.zone) ? 'Restored shrine' : `Meet ${GUARDIANS[item.zone].name}`;
  if (item.interaction === 'puzzle') return state.puzzles.includes(item.id) ? 'Snap Bridge: solved' : 'Try Snap Bridge';
  return { cache: 'Open snack cache', shard: 'Collect bit shard', sign: 'Read sign', lighthouse: 'Visit the Lighthouse' }[item.interaction] ?? 'Examine';
}
