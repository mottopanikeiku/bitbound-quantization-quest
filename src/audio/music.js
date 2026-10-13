// Original Bitbound scores; no recorded samples or borrowed melodies.
// The island's 1–3–5 / 6–5–3 hook changes mode, metre and instrumentation by biome.
// Sixteenth-note events retain tails across the loop; echo is written into the score.
const PITCHES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pitch = (name) =>
  typeof name === "number" ? name :
    (Number(name.at(-1)) + 1) * 12 + PITCHES[name[0]] +
    (name[1] === "#" ? 1 : name[1] === "b" ? -1 : 0);
const frequency = (note) => 440 * 2 ** ((note - 69) / 12);

function compose({
  bpm, chords, melody, bass, arp, drums, fill = [], variations = {},
  lead = "square", leadLevel = 0.076, arpLevel = 0.027,
  arpWave = "square", bassWave = "triangle", bassLevel = 0.145,
  cutoff = 4600, pad = true, padLevel = 0.014,
  barSteps = 16, swing = 0, echo = 0,
}) {
  const stepSeconds = 60 / bpm / 4;
  const steps = Array.from({ length: chords.length * barSteps }, () => []);
  const add = (step, event) => {
    const index = Math.floor(step);
    steps[((index % steps.length) + steps.length) % steps.length].push({
      ...event,
      delay: ((step - index) + (index % 4 >= 2 ? swing * 2 : 0)) * stepSeconds,
    });
  };
  const tone = (step, note, length, wave, level, gate = 0.86) => {
    add(step, { voice: "tone", frequency: frequency(note),
      duration: length * stepSeconds * gate, wave, level });
  };
  chords.forEach(([rootName, ...chordNames], bar) => {
    const root = pitch(rootName);
    const chord = chordNames.map(pitch);
    const start = bar * barSteps;
    const part = variations[bar] ?? {};
    for (const [step, note, length, accent = 1] of melody[bar]) {
      const wave = part.lead ?? lead;
      const level = (part.leadLevel ?? leadLevel) * accent;
      tone(start + step, pitch(note), length, wave, level, part.gate ?? 0.88);
      if (echo) tone(start + step + 3, pitch(note), length, wave, level * echo, 0.7);
    }
    for (const [step, interval, length] of part.bass ?? bass) {
      tone(start + step, root + interval, length, bassWave,
        part.bassLevel ?? bassLevel, 0.93);
    }
    const arpeggio = part.arp ?? arp;
    arpeggio.forEach((chordIndex, index) => {
      if (chordIndex !== null) {
        tone(start + index * (barSteps / arpeggio.length), chord[chordIndex],
          barSteps / arpeggio.length, part.arpWave ?? arpWave,
          part.arpLevel ?? arpLevel, 0.72);
      }
    });
    for (const [step, kind, level = 1] of part.drums ?? drums)
      add(start + step, { voice: kind, level });
    for (const [step, kind, level = 1] of part.fill ?? (bar % 4 === 3 ? fill : []))
      add(start + step, { voice: kind, level });
    // A quiet, overlapping chord bed joins bars and the actual loop boundary.
    // Unlike restarting an audio file, the scheduler never truncates these tails.
    if (pad) {
      tone(start, chord[0], barSteps, "pad", padLevel, 1.06);
      tone(start, chord[2], barSteps, "pad", padLevel * 0.72, 1.06);
    }
  });
  return { bpm, stepSeconds, steps, cutoff, barSteps, bars: chords.length };
}

// Shared players, not identical backing: the B phrases thin out and breathe.
const LONG_BASS = [
  [0, 0, 6],
  [8, 7, 3],
  [12, 12, 2],
];
const HALF_TIME = [
  [0, "kick", 0.65],
  [8, "snare", 0.5],
  [2, "hat", 0.42],
  [6, "hat", 0.36],
  [10, "hat", 0.42],
  [14, "hat", 0.38],
];
const QUIET_ARP = [0, null, 1, null, 2, null, 3, 2];

export const SCORES = {
  // "Lantern Steps": 112 BPM, sixteen bars. Skipping A, lower lyrical B, homeward turn.
  overworld: compose({
    bpm: 112,
    chords: [
      ["D3", "D4", "F#4", "A4", "D5"],
      ["B2", "D4", "F#4", "B4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["A2", "C#4", "E4", "A4", "C#5"],
      ["D3", "D4", "F#4", "A4", "D5"],
      ["F#2", "C#4", "F#4", "A4", "C#5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["A2", "C#4", "E4", "A4", "C#5"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["A2", "C#4", "E4", "A4", "C#5"],
      ["F#2", "C#4", "F#4", "A4", "C#5"],
      ["B2", "D4", "F#4", "B4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["D3", "D4", "F#4", "A4", "D5"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["A2", "C#4", "E4", "G4", "A4"],
    ],
    melody: [
      [
        [0, "D5", 3],
        [3, "F#5", 1, 0.8],
        [4, "A5", 3],
        [8, "B5", 3],
        [11, "A5", 1, 0.8],
        [12, "F#5", 2],
        [14, "E5", 2, 0.8],
      ],
      [
        [0, "F#5", 4],
        [4, "D5", 2],
        [6, "E5", 2, 0.8],
        [8, "F#5", 3],
        [12, "B5", 2],
        [14, "A5", 2, 0.85],
      ],
      [
        [0, "G5", 3],
        [3, "F#5", 1, 0.8],
        [4, "D5", 4],
        [8, "G5", 2],
        [10, "A5", 2, 0.85],
        [12, "B5", 3],
      ],
      [
        [0, "A5", 4],
        [4, "E5", 3],
        [8, "C#5", 4],
        [14, "E5", 2, 0.75],
      ],
      [
        [0, "D5", 3],
        [3, "F#5", 1, 0.8],
        [4, "A5", 2],
        [6, "D6", 2, 0.85],
        [8, "B5", 3],
        [11, "A5", 1, 0.8],
        [12, "F#5", 3],
      ],
      [
        [0, "F#5", 4],
        [4, "A5", 2],
        [6, "F#5", 2, 0.8],
        [8, "C#5", 4],
        [12, "E5", 2],
        [14, "F#5", 2, 0.8],
      ],
      [
        [0, "G5", 3],
        [3, "A5", 1, 0.8],
        [4, "B5", 4],
        [8, "A5", 2],
        [10, "G5", 2, 0.85],
        [12, "F#5", 2],
        [14, "E5", 2, 0.75],
      ],
      [
        [0, "E5", 3],
        [4, "A5", 3],
        [8, "F#5", 2],
        [10, "E5", 2, 0.8],
        [12, "C#5", 3],
      ],
      [
        [0, "B4", 6],
        [6, "E5", 2, 0.8],
        [8, "G5", 4],
        [14, "F#5", 2, 0.75],
      ],
      [
        [0, "E5", 6],
        [8, "C#5", 3],
        [12, "B4", 2, 0.8],
        [14, "C#5", 2, 0.8],
      ],
      [
        [0, "A4", 4],
        [4, "C#5", 4],
        [10, "F#5", 2],
        [12, "E5", 2, 0.8],
        [14, "C#5", 2, 0.75],
      ],
      [
        [0, "D5", 6],
        [8, "F#5", 3],
        [12, "B5", 2],
        [14, "A5", 2, 0.8],
      ],
      [
        [0, "D5", 3],
        [3, "G5", 1, 0.8],
        [4, "B5", 4],
        [8, "A5", 3],
        [12, "G5", 2],
        [14, "F#5", 2, 0.8],
      ],
      [
        [0, "A5", 4],
        [4, "F#5", 3],
        [8, "D5", 5],
        [14, "F#5", 2, 0.75],
      ],
      [
        [0, "G5", 3],
        [3, "F#5", 1, 0.8],
        [4, "E5", 4],
        [8, "B4", 3],
        [12, "E5", 2],
        [14, "G5", 2, 0.8],
      ],
      [
        [0, "E5", 4],
        [4, "G5", 3],
        [8, "A5", 3],
        [12, "E5", 2, 0.8],
        [14, "C#5", 2, 0.75],
      ],
    ],
    bass: [
      [0, 0, 3],
      [4, 7, 2],
      [6, 12, 1],
      [8, 0, 3],
      [12, 7, 2],
      [14, 12, 1],
    ],
    arp: [0, 1, 2, 1, 3, 2, 1, 2],
    drums: [
      [0, "kick", 0.72],
      [8, "kick", 0.65],
      [10, "kick", 0.35],
      [4, "snare", 0.52],
      [12, "snare", 0.56],
      [2, "hat", 0.5],
      [6, "hat", 0.42],
      [10, "hat", 0.45],
      [14, "hat", 0.55],
    ],
    fill: [[15, "snare", 0.3]],
    variations: {
      3: {
        bass: [
          [0, 0, 3],
          [4, 7, 2],
          [8, 12, 3],
          [12, 7, 2],
          [14, 4, 1],
        ],
        fill: [],
      },
      7: {
        fill: [
          [14, "tom", 0.4],
          [15, "snare", 0.35],
        ],
      },
      8: {
        bass: LONG_BASS,
        arp: QUIET_ARP,
        arpLevel: 0.02,
        drums: HALF_TIME,
        leadLevel: 0.07,
      },
      9: {
        bass: LONG_BASS,
        arp: QUIET_ARP,
        arpLevel: 0.02,
        drums: HALF_TIME,
        leadLevel: 0.07,
      },
      10: {
        bass: LONG_BASS,
        arp: [0, 1, 2, 3],
        arpLevel: 0.021,
        drums: HALF_TIME,
      },
      11: {
        bass: LONG_BASS,
        arp: [0, 1, 2, 3, 2, 1, 2, 3],
        fill: [
          [14, "snare", 0.25],
          [15, "snare", 0.38],
        ],
      },
      15: {
        bass: [
          [0, 0, 3],
          [4, 7, 3],
          [8, 12, 3],
          [12, 7, 2],
          [14, 4, 1],
        ],
        fill: [
          [14, "tom", 0.42],
          [15, "snare", 0.4],
        ],
      },
    },
  }),

  // "Packet Skirmish": 144 BPM, sixteen bars. Minor hook, half-time major B, rebuild.
  battle: compose({
    bpm: 144,
    cutoff: 5100,
    leadLevel: 0.077,
    arpLevel: 0.024,
    chords: [
      ["B2", "B3", "D4", "F#4", "B4"],
      ["G2", "B3", "D4", "G4", "B4"],
      ["D3", "A3", "D4", "F#4", "A4"],
      ["A2", "A3", "C#4", "E4", "A4"],
      ["B2", "B3", "D4", "F#4", "B4"],
      ["G2", "B3", "D4", "G4", "B4"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["F#2", "A#3", "C#4", "E4", "F#4"],
      ["D3", "A3", "D4", "F#4", "A4"],
      ["A2", "A3", "C#4", "E4", "A4"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["G2", "B3", "D4", "G4", "B4"],
      ["B2", "B3", "D4", "F#4", "B4"],
      ["G2", "B3", "D4", "G4", "B4"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["F#2", "A#3", "C#4", "E4", "F#4"],
    ],
    melody: [
      [
        [0, "B4", 2],
        [3, "D5", 1, 0.78],
        [4, "F#5", 2],
        [6, "D5", 2, 0.85],
        [8, "B5", 3],
        [12, "A5", 2],
        [14, "F#5", 2, 0.8],
      ],
      [
        [0, "G5", 3],
        [4, "D5", 2],
        [6, "B4", 2, 0.85],
        [8, "D5", 2],
        [11, "F#5", 1, 0.75],
        [12, "G5", 2],
        [14, "A5", 2, 0.85],
      ],
      [
        [0, "F#5", 2],
        [2, "A5", 2, 0.85],
        [4, "D6", 3, 0.9],
        [8, "A5", 2],
        [10, "F#5", 2, 0.85],
        [12, "E5", 2],
        [14, "D5", 2, 0.8],
      ],
      [
        [0, "E5", 3],
        [4, "C#5", 2],
        [6, "E5", 2, 0.8],
        [8, "A5", 4],
        [14, "F#5", 2, 0.75],
      ],
      [
        [0, "B4", 2],
        [3, "D5", 1, 0.78],
        [4, "F#5", 2],
        [6, "A5", 2, 0.85],
        [8, "B5", 3],
        [12, "F#5", 2],
        [14, "D5", 2, 0.8],
      ],
      [
        [0, "G5", 2],
        [2, "F#5", 2, 0.8],
        [4, "D5", 3],
        [8, "B4", 2],
        [10, "D5", 2, 0.85],
        [12, "G5", 3],
      ],
      [
        [0, "E5", 2],
        [2, "G5", 2, 0.85],
        [4, "B5", 3],
        [8, "A5", 2],
        [10, "G5", 2, 0.85],
        [12, "F#5", 2],
        [14, "E5", 2, 0.8],
      ],
      [
        [0, "F#5", 3],
        [4, "C#5", 2],
        [6, "E5", 2, 0.8],
        [8, "A#4", 4],
        [14, "C#5", 2, 0.8],
      ],
      [
        [0, "D5", 6],
        [6, "F#5", 2, 0.8],
        [8, "A5", 6],
      ],
      [
        [0, "E5", 6],
        [8, "C#5", 3],
        [12, "B4", 2, 0.8],
        [14, "C#5", 2, 0.8],
      ],
      [
        [0, "G5", 4],
        [4, "F#5", 2, 0.8],
        [6, "E5", 2, 0.85],
        [8, "B4", 4],
        [12, "E5", 3],
      ],
      [
        [0, "D5", 3],
        [4, "G5", 3],
        [8, "B5", 2],
        [10, "A5", 2, 0.85],
        [12, "G5", 2],
        [14, "F#5", 2, 0.8],
      ],
      [
        [0, "B4", 2],
        [3, "D5", 1, 0.78],
        [4, "F#5", 2],
        [6, "D5", 2, 0.85],
        [8, "B5", 3],
        [12, "D6", 2, 0.9],
        [14, "B5", 2, 0.8],
      ],
      [
        [0, "G5", 3],
        [4, "D5", 3],
        [8, "B4", 2],
        [10, "D5", 2, 0.85],
        [12, "G5", 2],
        [14, "A5", 2, 0.8],
      ],
      [
        [0, "B5", 3],
        [4, "G5", 2],
        [6, "F#5", 2, 0.85],
        [8, "E5", 4],
        [12, "G5", 2],
        [14, "E5", 2, 0.8],
      ],
      [
        [0, "F#5", 3],
        [4, "E5", 2],
        [6, "C#5", 2, 0.8],
        [8, "A#4", 3],
        [12, "C#5", 2],
        [14, "A#4", 2, 0.8],
      ],
    ],
    bass: [
      [0, 0, 2],
      [2, 12, 1],
      [4, 7, 2],
      [6, 12, 1],
      [8, 0, 2],
      [10, 12, 1],
      [12, 7, 2],
      [14, 12, 1],
    ],
    arp: [0, 2, 1, 2, 3, 2, 1, 2],
    drums: [
      [0, "kick", 0.9],
      [6, "kick", 0.6],
      [8, "kick", 0.8],
      [10, "kick", 0.45],
      [4, "snare", 0.76],
      [12, "snare", 0.8],
      [0, "hat", 0.35],
      [2, "hat", 0.55],
      [4, "hat", 0.3],
      [6, "hat", 0.5],
      [8, "hat", 0.35],
      [10, "hat", 0.55],
      [12, "hat", 0.3],
      [14, "open", 0.48],
    ],
    fill: [[15, "snare", 0.45]],
    variations: {
      3: {
        arp: [0, 1, 2, 3, 2, 1, 0, 1],
        fill: [
          [14, "tom", 0.4],
          [15, "snare", 0.45],
        ],
      },
      7: {
        bass: [
          [0, 0, 2],
          [2, 12, 1],
          [4, 7, 2],
          [6, 12, 1],
          [8, 0, 3],
          [12, 7, 2],
          [14, 4, 1],
        ],
        fill: [
          [13, "tom", 0.45],
          [14, "tom", 0.6],
        ],
      },
      8: {
        bass: LONG_BASS,
        arp: QUIET_ARP,
        arpLevel: 0.02,
        drums: HALF_TIME,
        leadLevel: 0.073,
      },
      9: {
        bass: LONG_BASS,
        arp: QUIET_ARP,
        arpLevel: 0.02,
        drums: HALF_TIME,
        leadLevel: 0.073,
      },
      10: { bass: LONG_BASS, arp: [0, 1, 2, 3], drums: HALF_TIME },
      11: {
        arp: [0, 1, 2, 3, 2, 1, 2, 3],
        fill: [
          [13, "snare", 0.25],
          [14, "tom", 0.45],
          [15, "snare", 0.6],
        ],
      },
      15: {
        bass: [
          [0, 0, 2],
          [2, 12, 1],
          [4, 7, 2],
          [6, 12, 1],
          [8, 0, 2],
          [10, 7, 1],
          [12, 12, 1],
          [14, 4, 1],
        ],
        arp: [0, 1, 2, 3, 2, 1, 0, null],
        fill: [
          [14, "snare", 0.35],
          [15, "snare", 0.58],
        ],
      },
    },
  }),

  // "Guardian Current": 132 BPM, sixteen bars. 3+3+2 pressure, broad B, dominant return.
  boss: compose({
    bpm: 132,
    cutoff: 4300,
    lead: "sawtooth",
    leadLevel: 0.074,
    arpLevel: 0.021,
    chords: [
      ["E2", "B3", "E4", "G4", "B4"],
      ["C3", "C4", "E4", "G4", "C5"],
      ["A2", "C4", "E4", "A4", "C5"],
      ["B2", "B3", "D#4", "F#4", "A4"],
      ["E2", "B3", "E4", "G4", "B4"],
      ["C3", "C4", "E4", "G4", "C5"],
      ["A2", "C4", "E4", "A4", "C5"],
      ["B2", "B3", "D#4", "F#4", "A4"],
      ["G2", "B3", "D4", "G4", "B4"],
      ["D3", "A3", "D4", "F#4", "A4"],
      ["C3", "C4", "E4", "G4", "B4"],
      ["B2", "B3", "D#4", "F#4", "A4"],
      ["E2", "B3", "E4", "G4", "B4"],
      ["C3", "C4", "E4", "G4", "C5"],
      ["A2", "C4", "E4", "A4", "C5"],
      ["B2", "B3", "D#4", "F#4", "A4"],
    ],
    melody: [
      [
        [0, "E5", 3],
        [3, "B5", 3, 0.9],
        [6, "G5", 2],
        [8, "F#5", 3],
        [11, "E5", 1, 0.8],
        [12, "D#5", 2],
        [14, "E5", 2, 0.85],
      ],
      [
        [0, "G5", 3],
        [3, "E5", 3, 0.9],
        [6, "C5", 2],
        [8, "G5", 4],
        [12, "B5", 2],
        [14, "G5", 2, 0.8],
      ],
      [
        [0, "A5", 3],
        [3, "E5", 3, 0.9],
        [6, "C5", 2],
        [8, "E5", 3],
        [12, "G5", 2],
        [14, "A5", 2, 0.85],
      ],
      [
        [0, "F#5", 3],
        [3, "D#5", 3, 0.9],
        [6, "B4", 2],
        [8, "D#5", 4],
        [14, "F#5", 2, 0.8],
      ],
      [
        [0, "E5", 3],
        [3, "B5", 3, 0.9],
        [6, "G5", 2],
        [8, "E6", 3, 0.86],
        [12, "D#6", 2, 0.85],
        [14, "B5", 2, 0.8],
      ],
      [
        [0, "C6", 3, 0.9],
        [3, "B5", 3, 0.8],
        [6, "G5", 2],
        [8, "E5", 4],
        [12, "G5", 2],
        [14, "B5", 2, 0.8],
      ],
      [
        [0, "A5", 3],
        [3, "G5", 3, 0.9],
        [6, "E5", 2],
        [8, "C5", 3],
        [12, "E5", 2],
        [14, "F#5", 2, 0.85],
      ],
      [
        [0, "D#5", 2],
        [2, "F#5", 2, 0.85],
        [4, "B5", 3],
        [8, "A5", 2],
        [10, "F#5", 2, 0.85],
        [12, "D#5", 3],
      ],
      [
        [0, "D5", 6],
        [6, "G5", 2, 0.8],
        [8, "B5", 6],
      ],
      [
        [0, "A5", 6],
        [8, "F#5", 4],
        [12, "E5", 3, 0.85],
      ],
      [
        [0, "G5", 4],
        [4, "E5", 4, 0.9],
        [8, "B4", 3],
        [12, "C5", 2],
        [14, "E5", 2, 0.8],
      ],
      [
        [0, "F#5", 3],
        [4, "D#5", 3],
        [8, "B4", 2],
        [10, "D#5", 2, 0.85],
        [12, "F#5", 2],
        [14, "A5", 2, 0.8],
      ],
      [
        [0, "E5", 3],
        [3, "B5", 3, 0.9],
        [6, "G5", 2],
        [8, "F#5", 3],
        [11, "E5", 1, 0.8],
        [12, "B5", 3],
      ],
      [
        [0, "C6", 3, 0.9],
        [4, "G5", 3],
        [8, "E5", 2],
        [10, "G5", 2, 0.85],
        [12, "C5", 3],
      ],
      [
        [0, "A5", 3],
        [3, "G5", 3, 0.9],
        [6, "E5", 2],
        [8, "C5", 3],
        [12, "E5", 2],
        [14, "G5", 2, 0.8],
      ],
      [
        [0, "F#5", 3],
        [3, "D#5", 3, 0.9],
        [6, "B4", 2],
        [8, "A4", 3],
        [12, "B4", 2],
        [14, "D#5", 2, 0.8],
      ],
    ],
    bass: [
      [0, 0, 2],
      [3, 0, 2],
      [6, 12, 2],
      [8, 0, 2],
      [11, 0, 1],
      [12, 7, 2],
      [14, 12, 2],
    ],
    arp: [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 3, 2, 1, 2, 1],
    drums: [
      [0, "kick", 0.95],
      [3, "kick", 0.55],
      [6, "kick", 0.7],
      [8, "kick", 0.9],
      [11, "kick", 0.45],
      [4, "snare", 0.85],
      [12, "snare", 0.9],
      [2, "hat", 0.45],
      [6, "hat", 0.55],
      [10, "hat", 0.45],
      [14, "open", 0.5],
    ],
    fill: [
      [14, "tom", 0.6],
      [15, "snare", 0.48],
    ],
    variations: {
      3: {
        fill: [
          [13, "tom", 0.4],
          [15, "tom", 0.6],
        ],
      },
      7: {
        arp: [0, 1, 2, 3, 2, 1, 0, null],
        fill: [
          [13, "tom", 0.5],
          [14, "tom", 0.7],
          [15, "snare", 0.5],
        ],
      },
      8: {
        bass: LONG_BASS,
        arp: [0, 2, 1, 3, 2, 1, 2, 3],
        arpLevel: 0.017,
        drums: HALF_TIME,
        leadLevel: 0.068,
      },
      9: {
        bass: LONG_BASS,
        arp: [0, 2, 1, 3, 2, 1, 2, 3],
        arpLevel: 0.017,
        drums: HALF_TIME,
        leadLevel: 0.068,
      },
      10: { bass: LONG_BASS, arp: [0, 1, 2, 3, 2, 1, 2, 3], drums: HALF_TIME },
      11: {
        fill: [
          [13, "snare", 0.25],
          [14, "tom", 0.5],
          [15, "snare", 0.7],
        ],
      },
      15: {
        bass: [
          [0, 0, 2],
          [3, 0, 2],
          [6, 12, 2],
          [8, 7, 3],
          [12, 12, 2],
          [14, 4, 1],
        ],
        arp: [0, 1, 2, 3, 2, 1, 0, null],
        fill: [
          [13, "tom", 0.55],
          [15, "snare", 0.65],
        ],
      },
    },
  }),

  // "A New Friend": 126 BPM, eight bars. Fanfare followed by a gentler answering cadence.
  victory: compose({
    bpm: 126,
    cutoff: 4900,
    leadLevel: 0.078,
    chords: [
      ["D3", "D4", "F#4", "A4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["A2", "C#4", "E4", "A4", "C#5"],
      ["D3", "D4", "F#4", "A4", "D5"],
      ["B2", "D4", "F#4", "B4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["A2", "C#4", "E4", "G4", "A4"],
      ["D3", "D4", "F#4", "A4", "D5"],
    ],
    melody: [
      [
        [0, "D5", 2],
        [2, "F#5", 2, 0.85],
        [4, "A5", 3],
        [8, "D6", 4, 0.9],
        [12, "C#6", 2, 0.8],
        [14, "B5", 2, 0.8],
      ],
      [
        [0, "G5", 2],
        [2, "B5", 2, 0.85],
        [4, "D6", 4, 0.9],
        [8, "B5", 3],
        [12, "A5", 2],
        [14, "G5", 2, 0.8],
      ],
      [
        [0, "A5", 2],
        [2, "C#6", 2, 0.85],
        [4, "E6", 4, 0.85],
        [8, "D6", 2, 0.9],
        [10, "C#6", 2, 0.8],
        [12, "A5", 4],
      ],
      [
        [0, "D6", 6, 0.9],
        [8, "A5", 2],
        [10, "F#5", 2, 0.85],
        [12, "D5", 3],
      ],
      [
        [0, "F#5", 4],
        [4, "B5", 4, 0.9],
        [8, "A5", 3],
        [12, "F#5", 3],
      ],
      [
        [0, "G5", 4],
        [4, "D5", 3],
        [8, "B4", 4],
        [14, "D5", 2, 0.75],
      ],
      [
        [0, "E5", 3],
        [4, "G5", 3],
        [8, "A5", 4],
        [12, "C#5", 3],
      ],
      [
        [0, "D5", 10],
        [12, "A4", 2, 0.8],
        [14, "C#5", 2, 0.7],
      ],
    ],
    bass: [
      [0, 0, 3],
      [4, 7, 3],
      [8, 12, 3],
      [12, 7, 3],
    ],
    arp: [0, 1, 2, 3, 2, 1, 2, 3],
    drums: [
      [0, "kick", 0.8],
      [8, "kick", 0.7],
      [4, "snare", 0.6],
      [12, "snare", 0.65],
      [2, "hat", 0.45],
      [6, "hat", 0.45],
      [10, "hat", 0.45],
      [14, "open", 0.4],
    ],
    fill: [[15, "snare", 0.35]],
    variations: {
      3: { fill: [] },
      4: {
        bass: LONG_BASS,
        arp: QUIET_ARP,
        drums: HALF_TIME,
        leadLevel: 0.071,
      },
      5: {
        bass: LONG_BASS,
        arp: QUIET_ARP,
        drums: HALF_TIME,
        leadLevel: 0.071,
      },
      6: { bass: LONG_BASS, arp: [0, 1, 2, 3], leadLevel: 0.072 },
      7: {
        bass: [
          [0, 0, 10],
          [12, 7, 2],
        ],
        arp: [0, 1, 2, null],
        drums: [
          [0, "kick", 0.65],
          [4, "hat", 0.3],
          [8, "hat", 0.3],
          [12, "snare", 0.4],
        ],
        fill: [],
        leadLevel: 0.07,
      },
    },
  }),

  // "Every Little Light": 96 BPM, sixteen bars. Rounded reprise, new bridge, soft homecoming.
  ending: compose({
    bpm: 96,
    cutoff: 3900,
    lead: "triangle",
    leadLevel: 0.135,
    arpLevel: 0.019,
    pad: true,
    chords: [
      ["D3", "D4", "F#4", "A4", "D5"],
      ["A2", "C#4", "E4", "A4", "C#5"],
      ["B2", "D4", "F#4", "B4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["D3", "D4", "F#4", "A4", "D5"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["A2", "C#4", "E4", "A4", "C#5"],
      ["D3", "D4", "F#4", "A4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["D3", "D4", "F#4", "A4", "D5"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["B2", "D4", "F#4", "B4", "D5"],
      ["G2", "D4", "G4", "B4", "D5"],
      ["E3", "B3", "E4", "G4", "B4"],
      ["A2", "C#4", "E4", "G4", "A4"],
      ["D3", "D4", "F#4", "A4", "D5"],
    ],
    melody: [
      [
        [0, "D5", 3],
        [3, "F#5", 1, 0.8],
        [4, "A5", 4],
        [8, "B5", 3],
        [11, "A5", 1, 0.8],
        [12, "F#5", 4],
      ],
      [
        [0, "E5", 4],
        [4, "C#5", 4, 0.9],
        [8, "A4", 4],
        [12, "C#5", 2],
        [14, "E5", 2, 0.8],
      ],
      [
        [0, "F#5", 4],
        [4, "D5", 4, 0.9],
        [8, "B4", 3],
        [12, "D5", 2],
        [14, "F#5", 2, 0.8],
      ],
      [
        [0, "G5", 4],
        [4, "B5", 4, 0.9],
        [8, "A5", 2],
        [10, "G5", 2, 0.85],
        [12, "F#5", 2],
        [14, "E5", 2, 0.8],
      ],
      [
        [0, "D5", 3],
        [3, "F#5", 1, 0.8],
        [4, "A5", 4],
        [8, "D6", 6, 0.9],
        [14, "A5", 2, 0.8],
      ],
      [
        [0, "G5", 4],
        [4, "E5", 4, 0.9],
        [8, "F#5", 2],
        [10, "G5", 2, 0.85],
        [12, "B5", 4],
      ],
      [
        [0, "A5", 4],
        [4, "E5", 4, 0.9],
        [8, "C#5", 4],
        [12, "E5", 3, 0.85],
      ],
      [
        [0, "D5", 10],
        [12, "E5", 2, 0.8],
        [14, "F#5", 2, 0.75],
      ],
      [
        [0, "G5", 6],
        [6, "B5", 2, 0.8],
        [8, "A5", 4],
        [12, "G5", 3, 0.85],
      ],
      [
        [0, "F#5", 6],
        [8, "D5", 4],
        [12, "A4", 3, 0.85],
      ],
      [
        [0, "B4", 4],
        [4, "E5", 4, 0.9],
        [8, "G5", 6],
      ],
      [
        [0, "F#5", 6],
        [8, "D5", 3],
        [12, "F#5", 2],
        [14, "A5", 2, 0.8],
      ],
      [
        [0, "B5", 4, 0.9],
        [4, "A5", 3],
        [8, "G5", 3],
        [12, "D5", 3, 0.85],
      ],
      [
        [0, "E5", 6],
        [8, "G5", 4],
        [12, "B5", 3, 0.9],
      ],
      [
        [0, "A5", 4],
        [4, "G5", 3, 0.9],
        [8, "E5", 4],
        [12, "C#5", 3, 0.85],
      ],
      [
        [0, "D5", 10],
        [12, "A4", 2, 0.75],
        [14, "C#5", 2, 0.7],
      ],
    ],
    bass: LONG_BASS,
    arp: [0, 1, 2, 1, 3, 2, 1, 2],
    drums: [
      [0, "kick", 0.45],
      [8, "kick", 0.4],
      [4, "snare", 0.27],
      [12, "snare", 0.3],
      [2, "hat", 0.28],
      [6, "hat", 0.25],
      [10, "hat", 0.28],
      [14, "hat", 0.25],
    ],
    variations: {
      3: { fill: [[15, "tom", 0.23]] },
      7: {
        arp: [0, 1, 2, null],
        drums: [
          [0, "kick", 0.4],
          [8, "hat", 0.25],
          [12, "snare", 0.22],
        ],
      },
      8: {
        arp: QUIET_ARP,
        arpLevel: 0.016,
        drums: [
          [0, "kick", 0.4],
          [6, "hat", 0.24],
          [8, "snare", 0.28],
          [14, "hat", 0.24],
        ],
        leadLevel: 0.128,
      },
      9: {
        arp: QUIET_ARP,
        arpLevel: 0.016,
        drums: [
          [0, "kick", 0.4],
          [6, "hat", 0.24],
          [8, "snare", 0.28],
          [14, "hat", 0.24],
        ],
        leadLevel: 0.128,
      },
      10: { arp: [0, 1, 2, 3], arpLevel: 0.017 },
      11: { fill: [[15, "tom", 0.25]] },
      15: {
        bass: [
          [0, 0, 10],
          [12, 7, 2],
        ],
        arp: [0, 1, 2, null],
        drums: [
          [0, "kick", 0.4],
          [8, "hat", 0.24],
        ],
        leadLevel: 0.128,
      },
    },
  }),
};

// Biome arrangements use scale degrees, not transposed audio. Chord inversions stay
// in one octave; each written B section changes register, response voice and groove.
const MODES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};
function islandTheme({
  tonic, mode, roots, a, b, home = a,
  replyLead, replyArp, replyDrums, variations = {}, ...arrangement
}) {
  const base = pitch(tonic);
  const scale = MODES[mode];
  const degree = (value) => scale[((value % 7) + 7) % 7] + 12 * Math.floor(value / 7);
  const chords = roots.map((root) => {
    const voices = [root, root + 2, root + 4].map((d) => base + ((degree(d) % 12 + 12) % 12)).sort((x, y) => x - y);
    const low = base - 12 + degree(root) - (root > 2 ? 12 : 0);
    return [low, ...voices, voices[0] + 12];
  });
  const melody = [...a, ...a, ...b, ...home].map((bar) =>
    bar.map(([step, note, length, accent = 1]) => [step, base + 12 + degree(note), length, accent]));
  const parts = {};
  for (let bar = 4; bar < 8; bar++) parts[bar] = {
    arpLevel: arrangement.arpLevel * 0.82,
    leadLevel: arrangement.leadLevel * 0.94,
  };
  for (let bar = 8; bar < 12; bar++) parts[bar] = {
    lead: replyLead ?? arrangement.lead,
    arp: replyArp ?? arrangement.arp,
    drums: replyDrums ?? arrangement.drums,
    arpLevel: arrangement.arpLevel * 0.78,
    leadLevel: arrangement.leadLevel * 0.92,
  };
  for (const [bar, part] of Object.entries(variations)) parts[bar] = { ...parts[bar], ...part };
  return compose({ ...arrangement, chords, melody, variations: parts });
}

Object.assign(SCORES, {
  title: islandTheme({
    tonic: "D4", mode: "major", bpm: 84, cutoff: 3600,
    lead: "flute", leadLevel: 0.115, arpWave: "bell", arpLevel: 0.044,
    bassLevel: 0.10, padLevel: 0.022, echo: 0.18,
    roots: [0, 5, 3, 4, 0, 5, 3, 4, 1, 5, 3, 4, 0, 3, 1, 4],
    a: [
      [[0, 0, 3], [3, 2, 1, 0.8], [4, 4, 4], [8, 5, 3], [11, 4, 1, 0.8], [12, 2, 4]],
      [[0, 2, 6], [6, 1, 2, 0.8], [8, 0, 4], [12, 4, 3]],
      [[0, 3, 4], [4, 5, 4], [8, 7, 3], [12, 5, 2], [14, 4, 2, 0.8]],
      [[0, 4, 6], [8, 1, 4], [12, -1, 2], [14, 1, 2, 0.8]],
    ],
    b: [
      [[0, -3, 6], [6, 0, 2], [8, 1, 6]],
      [[0, 2, 6], [8, 0, 4], [12, -2, 3]],
      [[0, -2, 4], [4, 0, 4], [8, 3, 4], [12, 2, 2], [14, 1, 2]],
      [[0, 1, 6], [8, 4, 4], [12, 2, 2], [14, -1, 2]],
    ],
    bass: [[0, 0, 7], [8, 7, 6]], arp: [0, 2, 1, 3],
    drums: [[0, "kick", 0.32], [6, "shaker", 0.26], [8, "rim", 0.24], [14, "shaker", 0.22]],
    replyLead: "triangle", replyArp: [0, null, 1, 2],
    replyDrums: [[0, "kick", 0.24], [8, "shaker", 0.2]],
    fill: [[15, "metal", 0.12]],
  }),

  meadow: islandTheme({
    tonic: "D4", mode: "major", bpm: 116, cutoff: 4700, swing: 0.10,
    lead: "softPulse", leadLevel: 0.084, arpWave: "pluck", arpLevel: 0.055,
    bassLevel: 0.125, padLevel: 0.013,
    roots: [0, 5, 3, 4, 0, 5, 3, 4, 1, 4, 5, 3, 0, 3, 1, 4],
    a: [
      [[0, 0, 3], [3, 2, 1, 0.8], [4, 4, 3], [8, 5, 3], [11, 4, 1], [12, 2, 2], [14, 1, 2, 0.8]],
      [[0, 2, 3], [4, 0, 2], [6, 1, 2, 0.8], [8, 2, 3], [12, 5, 2], [14, 4, 2]],
      [[0, 3, 3], [3, 4, 1, 0.8], [4, 5, 4], [8, 7, 2], [10, 5, 2], [12, 4, 2], [14, 3, 2]],
      [[0, 4, 3], [4, 1, 3], [8, -1, 4], [12, 1, 2], [14, 2, 2, 0.8]],
    ],
    b: [
      [[0, -3, 6], [6, 0, 2], [8, 1, 4], [14, 2, 2, 0.8]],
      [[0, 1, 4], [4, -1, 3], [8, -3, 4], [12, -1, 2], [14, 1, 2]],
      [[0, 2, 6], [6, 4, 2], [8, 5, 3], [12, 4, 2], [14, 2, 2]],
      [[0, 3, 4], [4, 5, 3], [8, 4, 3], [12, 3, 2], [14, 1, 2]],
    ],
    bass: [[0, 0, 3], [4, 7, 2], [6, 12, 1], [8, 0, 3], [12, 7, 3]],
    arp: [0, 1, 2, 1, 3, 2, 1, 2],
    drums: [[0, "kick", 0.62], [4, "rim", 0.55], [8, "kick", 0.5], [12, "rim", 0.58], [2, "shaker", 0.55], [6, "shaker", 0.4], [10, "shaker", 0.5], [14, "shaker", 0.48]],
    replyLead: "flute", replyArp: [0, null, 1, 2],
    replyDrums: [[0, "kick", 0.45], [8, "rim", 0.42], [6, "shaker", 0.4], [14, "shaker", 0.4]],
    fill: [[15, "conga", 0.3]],
  }),

  grove: islandTheme({
    tonic: "D4", mode: "dorian", bpm: 90, barSteps: 12, cutoff: 3300,
    lead: "bell", leadLevel: 0.15, arpWave: "flute", arpLevel: 0.045,
    bassLevel: 0.10, padLevel: 0.025, echo: 0.15,
    roots: [0, 3, 6, 0, 0, 3, 5, 4, 2, 6, 3, 4, 0, 3, 6, 4],
    a: [
      [[0, 0, 2], [2, 2, 2, 0.85], [4, 4, 3], [7, 5, 1], [8, 4, 2], [10, 2, 2]],
      [[0, 3, 4], [4, 5, 3], [8, 4, 2], [10, 3, 2, 0.8]],
      [[0, 2, 4], [4, 1, 3], [8, -1, 2], [10, 1, 2]],
      [[0, 0, 5], [6, 2, 2], [8, 1, 2], [10, -1, 2, 0.8]],
    ],
    b: [
      [[0, -3, 6], [6, -1, 2], [8, 2, 4]],
      [[0, 1, 4], [4, 2, 2], [6, 4, 2], [8, 1, 4]],
      [[0, 3, 5], [6, 5, 2], [8, 4, 2], [10, 3, 2]],
      [[0, 4, 4], [4, 1, 4], [8, -1, 4]],
    ],
    bass: [[0, 0, 5], [8, 7, 3]], arp: [0, 2, 1, 3, 2, 1],
    drums: [[0, "kick", 0.3], [4, "rim", 0.24], [8, "rim", 0.20], [10, "shaker", 0.22]],
    replyLead: "flute", replyArp: [0, 1, 2],
    replyDrums: [[0, "kick", 0.24], [8, "shaker", 0.24]],
    fill: [[11, "metal", 0.22]],
  }),

  cove: islandTheme({
    tonic: "G3", mode: "mixolydian", bpm: 108, cutoff: 4800, swing: 0.055,
    lead: "pluck", leadLevel: 0.17, arpWave: "bell", arpLevel: 0.052,
    bassLevel: 0.14, padLevel: 0.015,
    roots: [0, 6, 3, 4, 0, 6, 3, 4, 5, 3, 0, 6, 0, 3, 6, 4],
    a: [
      [[0, 0, 2], [3, 2, 1], [4, 4, 2], [6, 5, 2, 0.9], [9, 4, 2], [12, 2, 3]],
      [[0, 1, 3], [3, 2, 1], [6, 4, 2], [8, 6, 3], [12, 4, 2], [14, 2, 2]],
      [[0, 3, 2], [3, 5, 2], [6, 7, 2], [9, 5, 2], [12, 4, 2], [14, 3, 2]],
      [[0, 4, 3], [4, 1, 2], [7, -1, 2], [10, 1, 2], [12, 4, 3]],
    ],
    b: [
      [[0, 2, 5], [6, 0, 2], [9, -2, 3], [12, 0, 3]],
      [[0, 3, 4], [6, 2, 2], [8, 0, 3], [12, -2, 2], [14, 0, 2]],
      [[0, 0, 4], [6, 2, 2], [9, 4, 3], [12, 7, 3]],
      [[0, 6, 3], [4, 4, 3], [8, 2, 3], [12, 1, 3]],
    ],
    bass: [[0, 0, 2], [3, 7, 2], [6, 12, 2], [10, 7, 2], [12, 0, 3]],
    arp: [null, 0, null, 2, null, 1, null, 3],
    drums: [[0, "kick", 0.6], [6, "kick", 0.36], [8, "rim", 0.5], [3, "conga", 0.42], [10, "conga", 0.35], [14, "conga", 0.47], [2, "shaker", 0.6], [6, "shaker", 0.48], [10, "shaker", 0.57], [14, "shaker", 0.45]],
    replyLead: "flute", replyArp: [0, null, 2, 1],
    replyDrums: [[0, "kick", 0.5], [6, "conga", 0.4], [8, "rim", 0.35], [14, "shaker", 0.5]],
    fill: [[15, "conga", 0.38]],
  }),

  heights: islandTheme({
    tonic: "A3", mode: "lydian", bpm: 94, cutoff: 4100,
    lead: "flute", leadLevel: 0.135, arpWave: "bell", arpLevel: 0.041,
    bassLevel: 0.105, padLevel: 0.027, echo: 0.22,
    roots: [0, 1, 4, 0, 0, 1, 5, 4, 5, 2, 1, 4, 0, 1, 4, 4],
    a: [
      [[0, 0, 4], [4, 2, 2], [6, 4, 2], [8, 5, 4], [12, 4, 2], [14, 2, 2]],
      [[0, 3, 6], [6, 4, 2], [8, 6, 4], [12, 5, 3]],
      [[0, 4, 6], [8, 1, 4], [12, -1, 2], [14, 1, 2]],
      [[0, 2, 6], [6, 0, 2], [8, 4, 6]],
    ],
    b: [
      [[0, -2, 6], [8, 0, 4], [12, 2, 4]],
      [[0, 2, 8], [8, 4, 4], [12, 6, 3]],
      [[0, 5, 6], [6, 3, 2], [8, 1, 4], [12, 3, 4]],
      [[0, 4, 8], [10, 1, 3], [14, -1, 2]],
    ],
    bass: [[0, 0, 7], [8, 7, 6]], arp: [0, 1, 2, 3, 2, 1, 0, 2],
    drums: [[0, "kick", 0.35], [8, "rim", 0.23], [6, "shaker", 0.32], [14, "shaker", 0.27]],
    replyLead: "triangle", replyArp: [0, null, 1, 2],
    replyDrums: [[0, "kick", 0.27], [12, "shaker", 0.24]],
    fill: [[15, "metal", 0.17]],
  }),

  forge: islandTheme({
    tonic: "E4", mode: "dorian", bpm: 128, cutoff: 3200,
    lead: "reed", leadLevel: 0.09, arpWave: "softPulse", arpLevel: 0.028,
    bassWave: "reed", bassLevel: 0.125, padLevel: 0.017,
    roots: [0, 6, 3, 4, 0, 6, 3, 4, 2, 5, 3, 4, 0, 6, 3, 4],
    a: [
      [[0, 0, 2], [3, 2, 2], [6, 4, 2], [8, 5, 3], [12, 4, 2], [14, 2, 2]],
      [[0, -1, 3], [3, 1, 2], [6, 4, 2], [8, 2, 3], [12, 1, 3]],
      [[0, 3, 3], [3, 3, 2, 0.8], [6, 5, 2], [8, 7, 3], [12, 5, 3]],
      [[0, 4, 3], [3, 1, 2], [6, -1, 2], [8, 1, 3], [12, 4, 2], [14, -1, 2]],
    ],
    b: [
      [[0, 2, 6], [6, 4, 2], [8, 6, 6]],
      [[0, 5, 6], [8, 2, 4], [12, 0, 3]],
      [[0, 3, 4], [4, 5, 3], [8, 4, 4], [12, 3, 3]],
      [[0, 1, 6], [8, -1, 4], [12, 1, 2], [14, 2, 2]],
    ],
    bass: [[0, 0, 2], [3, 0, 2], [6, 12, 2], [8, 7, 3], [12, 0, 3]],
    arp: [0, null, 1, null, 2, null, 3, 1],
    drums: [[0, "kick", 0.73], [6, "kick", 0.48], [8, "kick", 0.55], [4, "snare", 0.46], [12, "snare", 0.48], [3, "metal", 0.55], [10, "metal", 0.42], [2, "hat", 0.5], [6, "hat", 0.4], [14, "open", 0.4]],
    replyLead: "softPulse", replyArp: [0, 1, 2, 3],
    replyDrums: [[0, "kick", 0.58], [8, "snare", 0.4], [6, "metal", 0.36], [14, "metal", 0.4]],
    fill: [[14, "tom", 0.45], [15, "metal", 0.4]],
  }),

  archives: islandTheme({
    tonic: "B3", mode: "minor", bpm: 72, barSteps: 12, cutoff: 2900,
    lead: "triangle", leadLevel: 0.12, arpWave: "pluck", arpLevel: 0.048,
    bassLevel: 0.09, padLevel: 0.022, echo: 0.12,
    roots: [0, 5, 3, 4, 0, 5, 6, 4, 2, 6, 5, 4, 0, 3, 6, 4],
    a: [
      [[0, 0, 3], [3, 2, 1, 0.8], [4, 4, 3], [7, 5, 1], [8, 4, 2], [10, 2, 2]],
      [[0, 2, 5], [6, 0, 2], [8, -2, 4]],
      [[0, 3, 4], [4, 5, 4], [8, 4, 2], [10, 3, 2]],
      [[0, 1, 6], [6, -1, 2], [8, 1, 4]],
    ],
    b: [
      [[0, -3, 6], [6, -1, 2], [8, 2, 4]],
      [[0, 1, 5], [6, -1, 2], [8, -3, 4]],
      [[0, -2, 4], [4, 0, 4], [8, 2, 4]],
      [[0, 1, 4], [4, 4, 4], [8, -1, 4]],
    ],
    bass: [[0, 0, 7], [8, 7, 3]], arp: [0, 1, 2, 3, 2, 1],
    drums: [[0, "kick", 0.22], [8, "shaker", 0.22]],
    replyLead: "flute", replyArp: [0, null, 1, 2, null, 1],
    replyDrums: [[0, "kick", 0.18]],
    fill: [[11, "rim", 0.16]],
  }),

  spire: islandTheme({
    tonic: "D4", mode: "lydian", bpm: 100, cutoff: 4400,
    lead: "softPulse", leadLevel: 0.092, arpWave: "bell", arpLevel: 0.051,
    bassLevel: 0.135, padLevel: 0.027, echo: 0.14,
    roots: [0, 1, 5, 4, 0, 1, 5, 4, 5, 2, 1, 4, 0, 1, 4, 4],
    a: [
      [[0, 0, 3], [3, 2, 1], [4, 4, 4], [8, 5, 3], [11, 4, 1], [12, 2, 4]],
      [[0, 3, 6], [6, 5, 2], [8, 6, 4], [12, 5, 2], [14, 3, 2]],
      [[0, 2, 4], [4, 5, 4], [8, 7, 4], [12, 5, 2], [14, 4, 2]],
      [[0, 4, 6], [8, 1, 4], [12, -1, 2], [14, 1, 2]],
    ],
    b: [
      [[0, -2, 6], [6, 0, 2], [8, 2, 6]],
      [[0, 2, 6], [6, 4, 2], [8, 6, 6]],
      [[0, 5, 4], [4, 3, 4], [8, 1, 4], [12, 3, 4]],
      [[0, 4, 6], [8, 1, 3], [12, 2, 2], [14, -1, 2]],
    ],
    bass: [[0, 0, 6], [6, 7, 2], [8, 12, 6]], arp: [0, 1, 2, 3, 2, 1, 0, 2],
    drums: [[0, "kick", 0.65], [8, "kick", 0.5], [4, "snare", 0.28], [12, "snare", 0.35], [6, "metal", 0.24], [14, "shaker", 0.44]],
    replyLead: "flute", replyArp: [0, null, 1, 3],
    replyDrums: [[0, "kick", 0.42], [8, "tom", 0.3], [14, "metal", 0.22]],
    fill: [[14, "tom", 0.35], [15, "snare", 0.3]],
  }),
});

// Score notes are kept beside the source so a musical review need not reverse-
// engineer the sequencer. A′ changes backing density; B is a written new melody.
export const SCORE_INFO = Object.freeze({
  overworld: { title: "Lantern Steps", key: "D major", meter: "4/4", form: "16 bars: A A′ B home", sound: "Skipping square lead, walking triangle bass, brushed backbeat" },
  battle: { title: "Packet Skirmish", key: "B minor, D-major B section", meter: "4/4", form: "16 bars: A A′ B rebuild", sound: "Syncopated pulse, running bass, half-time answer" },
  boss: { title: "Guardian Current", key: "E minor with harmonic-minor dominant", meter: "4/4", form: "16 bars: A A′ broad B dominant return", sound: "Saw lead, 3+3+2 ostinato, tom turnarounds" },
  victory: { title: "A New Friend", key: "D major", meter: "4/4", form: "8 bars: fanfare A, answering B", sound: "Bright square fanfare, buoyant cadence" },
  ending: { title: "All the Colours Home", key: "D major", meter: "4/4", form: "16 bars: A A′ quiet B home", sound: "Triangle melody, soft arpeggios, sustained warm bed" },
  title: { title: "The Lighthouse Remembers", key: "D major", meter: "4/4", form: "16 bars: A A′ low B A", sound: "Flute invitation, bell reflections, unhurried heartbeat" },
  meadow: { title: "Bitleaf Skip", key: "D major", meter: "4/4", form: "16 bars: A A′ low B A", sound: "Lightly swung soft pulse, plucked leaves, rim and shaker" },
  grove: { title: "Zero at Midnight", key: "D Dorian", meter: "3/4", form: "16 bars: A A′ flute B A", sound: "Bell waltz, dusky flute arpeggio, delicate metallic fireflies" },
  cove: { title: "Tide in the Buckets", key: "G Mixolydian", meter: "4/4", form: "16 bars: A A′ flute B A", sound: "Syncopated pluck, offbeat bells, conga/rim calypso-like groove" },
  heights: { title: "Three Threads of Air", key: "A Lydian", meter: "4/4", form: "16 bars: A A′ low B A", sound: "Airy flute and bell echo, suspended raised-fourth harmony" },
  forge: { title: "Little Engines", key: "E Dorian", meter: "4/4", form: "16 bars: A A′ broad B A", sound: "Woody reed, 3+3+2 bass, pitched metal and machine backbeat" },
  archives: { title: "Margins After Dark", key: "B natural minor", meter: "3/4", form: "16 bars: A A′ low B A", sound: "Triangle nocturne, plucked broken chords, nearly bare percussion" },
  spire: { title: "A Staircase of Stars", key: "D Lydian", meter: "4/4", form: "16 bars: A A′ lyrical B A", sound: "Broad pulse melody, bell staircase, processional drums" },
});
