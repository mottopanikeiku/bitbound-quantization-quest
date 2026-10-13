// Bitbound master palette. Every ramp runs dark → light and hue-shifts:
// shadows lean cool/purple, highlights lean warm/yellow. Derive tones only by mixing neighbours.

const ramp = (...colors) => Object.freeze(colors);

export const PAL = Object.freeze({
  ink: '#0e0a17',
  white: '#ffffff',
  shadow: '#140c26',
  night: ramp('#0d0a19', '#141026', '#1b1631', '#231d40', '#2e2752', '#3b3466', '#4b447c'),
  cream: ramp('#bfa983', '#d9c39a', '#efdcb6', '#fff4dc'),

  // Ground and foliage
  grass: ramp('#163028', '#1f4632', '#2b6239', '#3f7f3f', '#5c9c45', '#82b84f', '#aed15f', '#dbeb8c'),
  leaf: ramp('#10261f', '#173a29', '#1f5130', '#2c6a37', '#3f863e', '#5aa246', '#7fbd55', '#a9d66c'),
  forest: ramp('#0f2224', '#143331', '#1b463c', '#245b45', '#30734d', '#438c55', '#5fa75e', '#8bc277'),
  alpine: ramp('#22343a', '#30484a', '#425f58', '#587866', '#739277', '#93ad8c', '#b8c9a8', '#dfe6cc'),
  dusk: ramp('#16152a', '#1e2135', '#283141', '#34434b', '#435652', '#566a5f', '#6f826f', '#8f9d84'),
  sand: ramp('#4a2c2e', '#6e4339', '#946043', '#b98150', '#d6a464', '#e9c482', '#f6e0a8', '#fff4d2'),
  dirt: ramp('#3a2224', '#56342e', '#744836', '#935f40', '#b27b4e', '#cb9862', '#e0b67c'),
  ash: ramp('#1e1a1e', '#2c2629', '#3d3436', '#504446', '#665658', '#7e6c6a', '#9a8681', '#b9a698'),
  snow: ramp('#6f7f9e', '#8a9bb8', '#a9b8d0', '#c9d5e6', '#e5ecf5', '#ffffff'),

  // Water and sky
  water: ramp('#0a1530', '#0e2248', '#123364', '#174780', '#1f5f9a', '#2b7bb3', '#3e98c8', '#5cb4d8', '#86d0e6', '#bfe9f2', '#effcff'),
  sky: ramp('#141a3d', '#1f2b5e', '#2c4383', '#3e5fa8', '#5781c8', '#7aa5e0', '#a3c7f0', '#d0e6fa'),

  // Materials
  stone: ramp('#1b1926', '#292738', '#3a384c', '#4f4f64', '#68697e', '#85889b', '#a5a9b8', '#c8ccd6', '#eceef3'),
  wood: ramp('#26141a', '#3d1f22', '#5a2d2a', '#7a3f32', '#9c553d', '#bd6f48', '#d98f5a', '#eeb277'),
  roof: ramp('#2a0e1f', '#481626', '#6e2130', '#982f3a', '#c24546', '#e2644f', '#f58c63', '#ffb98a'),
  roofBlue: ramp('#121835', '#1b2550', '#263670', '#334d93', '#4568b3', '#5f88cf', '#86ade6', '#b5d0f3'),
  skin: ramp('#3b1f22', '#64352f', '#8f5240', '#b87253', '#d89569', '#efb88a', '#fbdab6'),

  // Accents
  rose: ramp('#43102f', '#6b1b45', '#98295c', '#c43f76', '#e66293', '#f58fb3', '#fbbfd2', '#fff0f5'),
  gold: ramp('#3a1f0d', '#5e3412', '#874d18', '#b26b1e', '#d99027', '#f0b636', '#f9d65a', '#fdee98', '#fffbe0'),
  violet: ramp('#140a26', '#22113c', '#341a57', '#4b2677', '#673599', '#8549b8', '#a66dd2', '#c79ae6', '#e6c9f7'),
  teal: ramp('#0a2326', '#0f3538', '#154a4b', '#1b6360', '#237f78', '#2f9d8f', '#48bba4', '#72d6bc', '#a8edd6', '#dcfbef'),
  ember: ramp('#2a080b', '#4d0f0f', '#781a12', '#a52a14', '#cf4318', '#ec6a22', '#fb9433', '#ffbd52', '#ffe08a', '#fff6cf'),

  // Interface roles
  ui: Object.freeze({
    panel: '#1b1630',
    panelHi: '#262044',
    panelLo: '#120e22',
    border: '#f2e3c0',
    borderDim: '#9a8db8',
    shadow: '#0b0815',
    text: '#fff4dc',
    dim: '#a9a2c4',
    faint: '#6d6690',
    gold: '#f9d65a',
    good: '#72d6bc',
    bad: '#f58fb3',
    warn: '#fb9433',
    hp: '#82b84f',
    hpLow: '#ec6a22',
    bytes: '#5cb4d8',
    error: '#ff6b7d',
    clip: '#fb9433',
  }),
});

/** Biome art direction: dominant ground/foliage ramps and one accent ramp. */
export const BIOME = Object.freeze({
  point: Object.freeze({ ground: 'grass', foliage: 'leaf', accent: 'gold', water: 'water', mood: 'warm sunset village' }),
  meadow: Object.freeze({ ground: 'grass', foliage: 'leaf', accent: 'rose', water: 'water', mood: 'sunny rolling meadow' }),
  grove: Object.freeze({ ground: 'forest', foliage: 'forest', accent: 'gold', water: 'water', mood: 'deep dappled grove, fireflies' }),
  cove: Object.freeze({ ground: 'grass', foliage: 'leaf', accent: 'rose', water: 'water', mood: 'bright beach, coral, surf' }),
  heights: Object.freeze({ ground: 'alpine', foliage: 'forest', accent: 'sky', water: 'water', mood: 'windy pale highlands' }),
  forge: Object.freeze({ ground: 'ash', foliage: 'ash', accent: 'ember', water: 'water', mood: 'volcanic dusk, embers' }),
  archives: Object.freeze({ ground: 'dusk', foliage: 'forest', accent: 'gold', water: 'water', mood: 'twilight ruins, lanterns' }),
  spire: Object.freeze({ ground: 'dusk', foliage: 'forest', accent: 'teal', water: 'water', mood: 'night crystal heights, aurora' }),
});
