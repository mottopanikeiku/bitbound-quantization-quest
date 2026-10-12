// Original Bitbound pixel drawings. A dot is transparent; every mark is an integer rectangle.
export const PALETTE = Object.freeze({
  ink: '#293f39', forest: '#365d45', moss: '#6d9660', mint: '#b9d49a',
  cream: '#f5e5b9', ochre: '#d2ac68', rose: '#d99891', sea: '#719c9c',
  jade: '#70b79b', violet: '#8d7aab', gold: '#e5bd68', coral: '#cb765d',
});

const drawings = {
  // Nib carries a folded umbrella-leaf and walks on three little root toes.
  sprout: {
    colors: { o: '#2d4d38', g: '#5e9653', l: '#8cbc69', h: '#c6dc89', s: '#e2d4a1', c: '#f8edc6', b: '#aa905c', e: '#273e32', p: '#d8967f' },
    rows: [
      '..................oo....',
      '...............ooogho...',
      '............ooogllhho...',
      '...........oglllhhho....',
      '...........olhhhgo......',
      '............ooggo.......',
      '......ooo.....oo........',
      '.....oglho...oo.........',
      '.....ogllho.oo...ooo....',
      '......oglhooo...oglho...',
      '.......oogsssoooglho....',
      '......oosccccsogllo.....',
      '.....oscccccccsoo.......',
      '....osccccccccccso......',
      '....osceccccccecco......',
      '....osceccccccecco......',
      '....ospccccccccpso......',
      '.....osccccbcccso.......',
      '......osccccccso........',
      '.......oossssoo.........',
      '.......obooooobo........',
      '......obbo..obbo........',
      '.....ooooo..ooooo.......',
      '........................',
    ],
  },
  // A low, many-faceted geode creature: asymmetric shard ears and a stone fan-tail.
  crystal: {
    colors: { o: '#3c4356', d: '#67658b', m: '#9a8bad', l: '#d1bad3', w: '#f2e5de', a: '#7caeb8', h: '#bce0d5', e: '#293e49', g: '#8fa876' },
    rows: [
      '.......o................',
      '......owo...............',
      '......owho.....o........',
      '.....owaho....olo.......',
      '.....owahho..olwo.......',
      '.....oahhho..olwmo......',
      '......oaahooolmmo.......',
      '......omllwwllmmo.......',
      '..oo..omlwwwwllmo.......',
      '.olwoomlwwwwwwlmo.......',
      '.olwdomllwewwelmo.......',
      '.olddomllwewwelmo.......',
      '..oddmmlwwwwwwlmo.......',
      '...oommllwwwllmmo.......',
      '....ommmmllallmdo.......',
      '...omlddmmllmmdddo......',
      '...omlwllmmmmmdddo......',
      '...omlwllmmmmddddo......',
      '....omllmmmmmdddo.......',
      '.....oddooddooodo.......',
      '.....oggo.oggo.ogo......',
      '.....oooo.oooo.ooo......',
      '........................',
      '........................',
    ],
  },
  // Broad fern-gills, a paddle tail, and a translucent raincoat-like aquatic body.
  tide: {
    colors: { o: '#35575c', d: '#629397', a: '#87bec0', h: '#b6dfd3', w: '#e3eee0', p: '#d28d90', l: '#f0b7a1', e: '#304b51', g: '#70a59d' },
    rows: [
      '........................',
      '........................',
      '..o.................o...',
      '..opo.............opo...',
      '..oplo...........olpo...',
      '.ooplo..ooooooo..olpoo..',
      'olllpoooahhhhhaoooplllo.',
      '.ooploaahhwwhhhaaolpoo..',
      '..oploaahwwwwhhaaolpo...',
      '.olploahehwwhehhaolplo..',
      '..oo.oaaehwwhehaa.o.oo..',
      '.....oaahhwwhhhaa.......',
      '......oahhwlhhhao.......',
      '.......oaahhhaao........',
      '..oo..oaaahhhaaao.......',
      '.oago.oaahwwhhaao.......',
      'oahhgooaahwwhhaaao......',
      'oahhgaoaahhhhaaaao......',
      '.oahgaoadhaahdaao.......',
      '..oaggaodhhaahdo........',
      '...ooo.oddoodddo........',
      '......oahho.ohhao.......',
      '......ooooo.ooooo.......',
      '........................',
    ],
  },
  // A nocturnal silk-wing with feathered wing tips and crescent-shaped markings.
  moth: {
    colors: { o: '#454359', d: '#747293', m: '#a59fc0', l: '#d1c9dd', w: '#f7ecd0', g: '#dfc180', e: '#3e4354', p: '#d99d9f' },
    rows: [
      '.......o.......o........',
      '.......ogo...ogo........',
      '........ogo.ogo.........',
      '..oo.....ooooo.....oo...',
      '..owoo..owwwwwo..oowo...',
      '..owlmooowgwgwooomlwo...',
      '.owlmmdoowewewooodmlwo..',
      '.owlmmddoowwwoo.ddmlwo..',
      'owlwmmdddowpwo.dddmmwlwo',
      'owlwmmdddomwmodddmmwlwo.',
      '.owwlmdddomwmoddmlwwo..',
      '..owwlmddomwmodmlwwo...',
      '...owwlddomwmodlwwo....',
      '....owlddomwmodlwo.....',
      '...owlmddomwmoddmlwo...',
      '..owlmddooogoo.ddmlwo..',
      '..owlmdo..ogo..odmlwo..',
      '...owmo...ogo...omwo...',
      '...owo....ogo....owo...',
      '....o.....ogo.....o....',
      '.........oogo...........',
      '.........o.o............',
      '........................',
      '........................',
    ],
  },
  // A squat kiln artisan with a chimney crown, bellows arms, and coal-black boots.
  ember: {
    colors: { o: '#563f35', d: '#915744', r: '#bc7048', a: '#e39856', h: '#f1c278', w: '#f8e4a5', e: '#392f2e', s: '#788578', m: '#b4bc9d' },
    rows: [
      '...........a............',
      '..........aha...........',
      '........a.ahwa..........',
      '.......ahaahwa..........',
      '.......ahhwha...........',
      '........oaao............',
      '.......osmmso...........',
      '.......osmmso...........',
      '.....ooossssooo.........',
      '....orahhhhhharo........',
      '...orahhwwwwhharo.......',
      '...oahwehwwehwhao.......',
      '.oooaheehwweehhaooo.....',
      'ossoaahhwwwwhhaaosso....',
      'osmsoahhwwwwhhaosmso....',
      '.oso.oaahwwhaao.oso.....',
      '..o..oddaaadddo..o......',
      '.....odmmmmmmdo.........',
      '.....odmsssmmdo.........',
      '......odssssdo..........',
      '......oss..sso..........',
      '.....osso..osso.........',
      '.....oooo..oooo.........',
      '........................',
    ],
  },
  // An ink-wisp librarian with a folded paper hood and a tapering calligraphic tail.
  wisp: {
    colors: { o: '#514464', d: '#71628b', m: '#9b83b2', l: '#c5acd0', w: '#efe0df', e: '#4b405b', g: '#dbbd7e', b: '#a37567', p: '#e1adbb' },
    rows: [
      '............oo..........',
      '..........oowwo.........',
      '........oowlwwo.........',
      '.......owlwwwlo.........',
      '......owlwwwlmo.........',
      '.....owlwwwlmmo.........',
      '....owlwwwwwlmmo........',
      '....olwwwwwwwlmo........',
      '....olwwwwwwwlmo........',
      '....omlwewwewlmo........',
      '....omlwewwewlmo........',
      '.....omlpwwplmo.........',
      '......omlwwlmo..........',
      '.....ommlwwlmmo.........',
      '....ommlwwwwlmmo........',
      '...ommmoggggommmmo......',
      '....omobwwwwbommmo......',
      '.....oobwwwwboo.........',
      '......oggggggo..........',
      '.......ommlmo...........',
      '........odmmo..o........',
      '.........odmo.omo.......',
      '..........odmomo........',
      '...........oooo.........',
    ],
  },
  // A jade ridge-dragon: branching golden antlers, a long whisker, and a curled tail.
  dragon: {
    colors: { o: '#2d5149', d: '#477b68', j: '#6caa86', l: '#a9caa0', h: '#d6deb0', g: '#d3ad62', w: '#f6e2a2', e: '#2d4942', r: '#b77c62' },
    rows: [
      '....g...........g.......',
      '...gwg.........gwg......',
      '...g.gw.......wg.g......',
      '......wgo...ogw.........',
      '.......ogooogo..........',
      '......ojlllljo..........',
      '.....ojllhhlljo.........',
      '...oojlwlhhlwljo........',
      '..ojljlelhhlejljo.......',
      '..ojjlleehllelljo.......',
      '...ojjllhhhlljjo........',
      '.wwwoollhrhlloo.www.....',
      '......ojlllljo..........',
      '.....odjjlljddo.........',
      '....ojdjjwwjddjo....oo..',
      '...ojjdjjwwjddjjo..ojgo.',
      '..ogjodjjwwjddojgo.ojgo.',
      '...oo.odjwwjdo.oo.ojgo..',
      '......odjwwjdoo..ojgo...',
      '......odjjjjdddoodjgo...',
      '.....ogjdooodjjjjdgo....',
      '....ogggo...oddddoo.....',
      '....ooooo...oggggo......',
      '............oooooo......',
    ],
  },
  player: {
    colors: { o: '#35433a', r: '#ac5148', h: '#cf7960', c: '#f1dfb5', w: '#fff0ca', s: '#d9ae87', a: '#ae7959', e: '#343d35', g: '#709780', d: '#49675a', b: '#aa8253', l: '#d3af70' },
    rows: [
      '..............cc........',
      '.............cwc........',
      '.........oooooc.........',
      '........orrrrro.........',
      '.......orrhhrrro........',
      '.......orrrrrrro........',
      '.....ooorrrrrrrooo......',
      '....orrrrrrrrrrrrrro....',
      '.....oooossssooooo......',
      '........oseseso.........',
      '........ossssso.........',
      '.........osaso..........',
      '.......ooccccoo.........',
      '......obocwwcogo........',
      '......obloccoggo........',
      '......obloggggso........',
      '......obloggggso........',
      '.......oodgggdo.........',
      '........odgggdo.........',
      '........oddoddo.........',
      '........odo.odo.........',
      '.......oabo.oabo........',
      '.......oooo.oooo........',
      '........................',
    ],
  },
};

const playerBack = [
  '..............cc........',
  '.............cwc........',
  '.........oooooc.........',
  '........orrrrro.........',
  '.......orrhhrrro........',
  '.......orrrrrrro........',
  '.....ooorrrrrrrooo......',
  '....orrrrrrrrrrrrrro....',
  '.....ooooaaaaooooo......',
  '........oaaaao..........',
  '........oaaaao..........',
  '.........oooo...........',
  '.......ooggggoo.........',
  '......ogolllloggo.......',
  '......ogolblloggo.......',
  '......osollblogso.......',
  '......osollllogso.......',
  '.......oolllloo.........',
  '........occcco..........',
  '........oddoddo.........',
  '........odo.odo.........',
  '.......oabo.oabo........',
  '.......oooo.oooo........',
  '........................',
];

const playerSide = [
  '..............cc........',
  '.............cwc........',
  '.........oooooc.........',
  '........orrrrro.........',
  '.......orrhhrrro........',
  '.......orrrrrrro........',
  '.......orrrrrrrooo......',
  '......orrrrrrrrrrro.....',
  '.......oooossssooo......',
  '.........oaseso.........',
  '.........oasssso........',
  '..........osaso.........',
  '........ooccco..........',
  '.......oblolcgo.........',
  '.......oblogggo.........',
  '.......obloggso.........',
  '.......obloggso.........',
  '........oodgdo..........',
  '.........odgdo..........',
  '.........oddodo.........',
  '.........odo.odo........',
  '.........oabooabo.......',
  '.........oooooooo.......',
  '........................',
];

// Run-length encode once, grouped by ink, rather than scanning strings on every frame.
function compile(rows, colors) {
  const inks = new Map();
  for (let y = 0; y < rows.length; y += 1) {
    const row = rows[y];
    for (let x = 0; x < row.length;) {
      const mark = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === mark) end += 1;
      const color = colors[mark];
      if (color) {
        if (!inks.has(color)) inks.set(color, []);
        inks.get(color).push(x, y, end - x, 1);
      }
      x = end;
    }
  }
  return Array.from(inks, ([color, rectangles]) => ({ color, rectangles }));
}

const sprites = new Map();
for (const [kind, drawing] of Object.entries(drawings)) {
  sprites.set(kind, compile(drawing.rows, drawing.colors));
}

function walkingFrame(rows, step) {
  const frame = rows.slice();
  frame[20] = step === 1 ? '.......odo...odo........' : '........odo.odo.........';
  frame[21] = step === 1 ? '......oabo....odo.......' : '........odo..oabo.......';
  frame[22] = step === 1 ? '......oooo...oabo.......' : '.......oabo..oooo.......';
  frame[23] = step === 1 ? '.............oooo.......' : '.......oooo.............';
  return compile(frame, drawings.player.colors);
}

const playerFrames = [
  sprites.get('player'), walkingFrame(drawings.player.rows, 1), walkingFrame(drawings.player.rows, 2),
  compile(playerBack, drawings.player.colors), walkingFrame(playerBack, 1), walkingFrame(playerBack, 2),
  compile(playerSide, drawings.player.colors), compile(playerSide, drawings.player.colors),
];
const dataUrls = new Map();

/** Draw an original, transparent 24 × 24 sprite. Player poses 3–5 face north; 6/7 face west/east. */
export function drawSprite(ctx, kind, x, y, scale = 1, pose = 0) {
  const frame = Math.abs(Math.trunc(pose)) % playerFrames.length;
  const sprite = kind === 'player' ? playerFrames[frame] : sprites.get(kind);
  if (!sprite) throw new RangeError(`Unknown Bitbound sprite: ${kind}`);
  const pixel = Math.max(1, Math.round(scale));
  const left = Math.round(x);
  const top = Math.round(y);
  const mirrored = kind === 'player' && frame === 6;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < sprite.length; i += 1) {
    const ink = sprite[i];
    ctx.fillStyle = ink.color;
    const r = ink.rectangles;
    for (let j = 0; j < r.length; j += 4) {
      const rx = mirrored ? 24 - r[j] - r[j + 2] : r[j];
      ctx.fillRect(left + rx * pixel, top + r[j + 1] * pixel, r[j + 2] * pixel, r[j + 3] * pixel);
    }
  }
}

/** Browser-only PNG export, cached for repeated collection/encounter portraits. */
export function spriteDataUrl(kind, scale = 4) {
  const pixel = Math.max(1, Math.round(scale));
  const key = `${kind}:${pixel}`;
  if (dataUrls.has(key)) return dataUrls.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 24 * pixel;
  canvas.height = 24 * pixel;
  const ctx = canvas.getContext('2d');
  drawSprite(ctx, kind, 0, 0, pixel);
  const url = canvas.toDataURL('image/png');
  dataUrls.set(key, url);
  return url;
}
