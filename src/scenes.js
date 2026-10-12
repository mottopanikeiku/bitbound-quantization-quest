import { drawSprite } from './art.js';

export const SCENE_CAPTIONS = [
  'Stepping stones: outlined heights are the original numbers; solid stones are their reconstructions.',
  'The offset dock: the flag marks the integer code for real zero. Parcels outside the ruler are clipped.',
  'The storm net: each vessel holds a validation signal. Pink overflow marks values outside the fitted range.',
  'The channel loom: every independent ruler gets its own spool. More spools mean more stored metadata.',
  'The echo relay: each terminal reports an actual toy-inference constraint, not a speed or accuracy bonus.',
  'The balancing pulley: inverse channel scaling preserves the original product before rounding. Test the rounded result.',
  'The beacon pack: payload and metadata occupy different compartments. The cache estimate is a separate notebook.',
];

export function drawEncounterScene(canvas, lesson, result, config, tested) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const rect = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const outline = (color, x, y, w, h) => { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h)); };
  const text = (value, x, y, color = '#f7eac9') => { ctx.fillStyle = color; ctx.font = '10px monospace'; ctx.fillText(value, x, y); };
  const sky = ['#24483b', '#393e37', '#224c51', '#34354c', '#4b3630', '#363047', '#3b4335'][lesson.id];
  rect(sky, 0, 0, 560, 126);
  for (let i = 0; i < 18; i++) rect('#f0d99a', (i * 83 + 12) % 560, 12 + (i * 19 % 40), 1, 1);
  rect('#263b30', 0, 108, 560, 18);
  rect('#5b7751', 0, 107, 560, 2);
  for (let x = 4; x < 560; x += 17) rect('#3f5940', x, 114 + x % 5, 2, 3);
  drawSprite(ctx, lesson.sprite, 8, 56, 2, tested && result.passed ? 1 : 0);
  const points = result.points;
  const max = Math.max(0.001, ...points.map(p => Math.abs(p.value)), ...points.map(p => Math.abs(p.reconstructed)));
  if (lesson.id === 0) {
    rect('#315d56', 68, 94, 480, 14);
    for (let i = 0; i < Math.min(points.length, 16); i++) {
      const p = points[i];
      const x = 80 + i * 28;
      const oy = 72 - p.value / max * 22;
      const qy = 72 - p.reconstructed / max * 22;
      outline('#f7eac9', x, oy, 19, 8);
      rect('#597a58', x, qy + 7, 20, 10);
      rect('#b6db8c', x, qy, 20, 7);
      rect('#7ba169', x + 3, qy + 9, 14, 3);
    }
    text('ORIGINAL → CODE → STONE', 78, 24);
  } else if (lesson.id === 1) {
    const p = result.params[0];
    rect('#315d56', 66, 91, 481, 18);
    rect('#ac9766', 82, 72, 442, 9);
    for (let q = p.qmin; q <= p.qmax; q++) {
      const x = 88 + (q - p.qmin) / (p.qmax - p.qmin) * 424;
      rect('#e6bc6a', x, 70, 2, 11);
      if (q === p.zero) { rect('#e6bc6a', x, 43, 2, 27); rect('#f7eac9', x + 2, 44, 20, 9); text('0', x + 8, 52, '#142923'); }
    }
    points.forEach((point, i) => {
      const x = Math.max(82, Math.min(518, 88 + (point.reconstructed - p.min) / (p.max - p.min) * 424));
      rect(point.clipped ? '#d99593' : '#b6db8c', x, 58 - i % 3 * 7, 5, 6);
    });
    text(`ZERO LIVES AT CODE ${p.zero}`, 78, 24);
  } else if (lesson.id === 2) {
    const bound = Math.max(Math.abs(result.params[0].min), Math.abs(result.params[0].max));
    const total = Math.min(16, points.length);
    const step = 448 / total;
    const level = value => 96 - Math.abs(value) / Math.max(max, bound) * 58;
    const net = level(bound);
    for (let i = 0; i < total; i++) {
      const point = points[i];
      const x = 82 + i * step;
      outline('#8dbbb4', x, 33, step - 8, 64);
      rect(point.clipped ? '#d99593' : '#88c6c3', x + 2, level(point.value), step - 11, 95 - level(point.value));
      rect('#f7eac9', x, level(point.reconstructed), step - 8, 2);
    }
    for (let x = 77; x < 537; x += 6) rect('#e6bc6a', x, net, 4, 2);
    text(`${result.clipped ?? points.filter(p => p.clipped).length} OVERFLOW SIGNALS`, 78, 24);
  } else if (lesson.id === 3) {
    const palette = ['#b6db8c', '#88c6c3', '#e6bc6a', '#b0a7d6', '#d99593', '#dfab74', '#c3a1d3', '#a3c795'];
    rect('#816d4c', 89, 35, 5, 69); rect('#816d4c', 375, 35, 5, 69);
    rect('#b59b6a', 84, 33, 301, 5); rect('#b59b6a', 84, 98, 301, 5);
    points.slice(0, 32).forEach((point, i) => {
      const x = 103 + i % 8 * 32;
      const y = 44 + Math.floor(i / 8) * 12;
      rect('#42604c', x, y, 27, 8);
      rect(palette[(point.group ?? 0) % palette.length], x, y, 3 + Math.abs(point.reconstructed) / max * 24, 8);
      outline('#f7eac9', x, y, 3 + Math.abs(point.value) / max * 24, 8);
    });
    result.params.forEach((_, i) => {
      const x = 410 + i % 4 * 28;
      const y = 46 + Math.floor(i / 4) * 23;
      rect('#e6bc6a', x, y, 15, 14); rect('#816d4c', x + 4, y - 3, 7, 20); rect(palette[i % palette.length], x + 1, y + 3, 13, 7);
    });
    text(`${result.params.length} RULER SPOOLS`, 402, 25);
  } else if (lesson.id === 4) {
    const checks = result.checks;
    text('TOY FORWARD-PASS RELAY', 78, 24);
    for (let i = 0; i < checks.length; i++) {
      const y = 47 + i * 19;
      rect('#497366', 82, y, 349, 2);
      for (let x = 84; x < 421; x += 28) rect('#b6db8c', x, y - 2, 7, 6);
      rect('#e6bc6a', 432, y - 8, 72, 17);
      rect(tested ? checks[i].ok ? '#b6db8c' : '#d99593' : '#8ca78f', 438, y - 4, 9, 9);
      text(tested ? checks[i].ok ? 'HOLDS' : 'CHECK' : 'READY', 454, y + 4, '#142923');
    }
  } else if (lesson.id === 5) {
    text('EQUAL BEFORE ROUNDING · APPROXIMATE AFTER', 78, 24);
    rect('#b59b6a', 300, 32, 8, 71); rect('#e6bc6a', 227, 34, 154, 4);
    const factor = Number(Object.values(config).find(value => typeof value === 'number')) || 1;
    const tilt = Math.max(-14, Math.min(14, Math.log2(factor) * 5 - 8));
    const buckets = [{ x: 229, y: 61 + tilt, color: '#88c6c3', label: 'X / s' }, { x: 364, y: 61 - tilt, color: '#b0a7d6', label: 's · W' }];
    buckets.forEach(bucket => {
      rect('#d3c28b', bucket.x + 5, 36, 2, bucket.y - 36);
      outline('#f7eac9', bucket.x - 8, bucket.y, 30, 22);
      rect(bucket.color, bucket.x - 6, bucket.y + 8, 27, 13);
      text(bucket.label, bucket.x - 8, 101);
    });
    rect('#e6bc6a', 295, 27, 18, 18); rect('#142923', 300, 32, 8, 8);
  } else {
    text('CARRY WHAT MATTERS', 78, 24);
    rect('#816d4c', 94, 41, 302, 61); rect('#b59b6a', 99, 46, 292, 51);
    const payloadWidth = 280 * result.storage.payload / result.storage.total;
    rect('#b6db8c', 105, 52, payloadWidth, 39); rect('#b0a7d6', 105 + payloadWidth, 52, 280 - payloadWidth, 39);
    for (let x = 108; x < 383; x += 17) rect('#436442', x, 65, 1, 13);
    rect('#e6bc6a', 427, 43, 66, 54); rect('#f7eac9', 434, 47, 52, 45); rect('#8e7854', 458, 47, 2, 45);
    for (let y = 53; y < 88; y += 7) rect('#a0b6a0', 440, y, 37, 1);
    text('KV NOTEBOOK', 420, 111);
  }
}
