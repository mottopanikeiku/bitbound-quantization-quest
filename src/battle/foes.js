// Foe definitions. Owned by Battle (stub below).
import { GUARDIANS } from '../content/game-data.js';

export const FOES = Object.fromEntries([
  ...GUARDIANS.map((g) => [g.key, { id: g.key, name: g.name, guardian: true, zone: g.zone, hp: 60 + g.id * 15, background: ['meadow', 'grove', 'cove', 'heights', 'forge', 'archives', 'final'][g.id] }]),
  ...[0, 1, 2, 3, 4, 5, 6].map((z) => [`static-${z}`, { id: `static-${z}`, name: 'Staticling', guardian: false, zone: z, hp: 20, background: 'static' }]),
]);
