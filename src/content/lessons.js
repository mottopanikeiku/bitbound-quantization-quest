// Teaching content. Shape fixed by the v2 contract; content owned by Teaching (stub below).

export const LESSONS = {
  bits: {
    id: 'bits',
    title: 'Bits & Levels',
    technique: 'bits',
    icon: 'bits',
    lines: ['b bits give 2^b codes.', 'Each value snaps to the nearest level.'],
    formula: 'q = round(x / step)',
    real: 'Models store weights in fewer bits to save memory.',
    recap: 'More bits, finer levels, more bytes.',
    diagramCaption: 'Values snap to the nearest level.',
  },
  zero: { id: 'zero', title: 'Zero-Shift', technique: 'zero', icon: 'zero', lines: ['Shift the grid with a zero-point.'], formula: 'q = round(x / s) + z', real: 'Lopsided activations use every code.', recap: 'A zero-point fits lopsided values.', diagramCaption: 'The grid slides.' },
  calib: { id: 'calib', title: 'Calibration', technique: 'calib', icon: 'calib', lines: ['Pick the range from past samples.'], formula: 'range ← samples', real: 'Static activation ranges come from calibration data.', recap: 'Calibrate before the wave arrives.', diagramCaption: 'Past samples guide the range.' },
  groups: { id: 'groups', title: 'Group Rulers', technique: 'groups', icon: 'groups', lines: ['Each group gets its own scale.'], formula: 's_g = max|x_g| / qmax', real: 'Groups of 128 weights often share a scale.', recap: 'Small values need their own ruler.', diagramCaption: 'One ruler per row.' },
  spotlight: { id: 'spotlight', title: 'Spotlight', technique: 'spotlight', icon: 'spotlight', lines: ['Keep the values that matter most.'], formula: 'y = Σ a·w', real: 'Outlier features can stay in 16-bit.', recap: 'Protect what the inputs amplify.', diagramCaption: 'Hot inputs magnify errors.' },
  balance: { id: 'balance', title: 'Balance', technique: 'balance', icon: 'balance', lines: ['Move range between inputs and weights.'], formula: 'x·w = (x/s)·(s·w)', real: 'SmoothQuant migrates activation outliers into weights.', recap: 'Share the burden before rounding.', diagramCaption: 'The seesaw keeps the product.' },
  budget: { id: 'budget', title: 'Bit Budget', technique: 'budget', icon: 'budget', lines: ['Spend bits where errors hurt most.'], formula: 'Σ bytes ≤ budget', real: 'Mixed precision gives sensitive layers more bits.', recap: 'Not every layer needs the same bits.', diagramCaption: 'Bits flow to sensitive heads.' },
};

export const GLOSSARY = [{ term: 'bit', text: 'A 0 or 1.' }];

export const REAL_WORLD = {
  oracle: { weights: 8e9, fp16GB: 16, int8GB: 8, int4GB: 4.125, lines: ['The Oracle has 8 billion weights.'] },
  sizes: [],
};

export const FACTS = { hub: ['b bits give 2^b codes.'], meadow: [], grove: [], cove: [], heights: [], forge: [], archives: [], spire: [] };

export const COACH = {};

export const SOURCES = [];
