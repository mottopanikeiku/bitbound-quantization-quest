import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SPECIES, WARDENS } from '../src/content/static-dex.js';
import { MOTIFS, WARDEN_MOTIFS, createMotifEssence, createWardenEssence, motifIntendedGear, motifPar, motifHp } from '../src/battle/species.js';
import { FOES, createEssence } from '../src/battle/foes.js';
import { buildSpell, defaultLocks, rangeTargets, lockDomains } from '../src/battle/spell.js';
import { dot } from '../src/quantization.js';

// Expensive full-domain/picker enumeration belongs to node scripts/motif-audit.mjs.
// These deterministic examples exercise the actual live arithmetic, not a mock optimizer.
const rng = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const minimum = spell => Math.min(...(spell.threadFidelities ?? [spell.fidelity]));
const providerOf = entry => MOTIFS[entry.id] ? createMotifEssence : createWardenEssence;
function locksOf(essence, gear, alpha = 0.5) {
  const locks = defaultLocks(essence, gear);
  if (gear.balance) {
    locks.alpha = alpha;
    const targets = rangeTargets(essence, gear, locks);
    locks.ranges = targets.map(target => target.amax || 1);
    locks.lows = targets.map(target => target.min);
    locks.highs = targets.map(target => target.max);
  }
  if (essence.hidden) locks.ranges = [essence.storm ? 2.1 : 0.49];
  return locks;
}
function cornersOf(essence, gear) {
  return (gear.balance ? [0.47, 0.5, 0.53] : [0.5]).flatMap(alpha => {
    const locks = locksOf(essence, gear, alpha);
    const coordinates = (gear.zero ? ['lows', 'highs'] : ['ranges']).flatMap(key => locks[key].map((_, i) => [key, i]));
    return Array.from({ length: 2 ** coordinates.length }, (_, mask) => {
      const copy = structuredClone(locks);
      coordinates.forEach(([key, i], bit) => { copy[key][i] *= mask & (1 << bit) ? 1.03 : 0.97; });
      return copy;
    });
  });
}

for (const entry of [...SPECIES, ...WARDENS]) test(`${entry.id}: deterministic valid essence and useful representative locks`, () => {
  const provider = providerOf(entry);
  for (let seed = 1; seed <= 32; seed++) {
    assert.deepEqual(provider(entry.id, 3, rng(seed), 1, { successes: 2 }), provider(entry.id, 3, rng(seed), 1, { successes: 2 }));
  }
  for (const successes of [0, 2]) for (const randomValue of [0, 0.5, 1]) {
    const essence = provider(entry.id, successes, () => randomValue, 1, { successes });
    const gear = motifIntendedGear(entry.id, 1, { successes });
    const floor = FOES[`static-${entry.zone}`].floor;
    assert.equal(essence.kind, entry.family);
    assert.equal(typeof essence.hidden, 'boolean');
    assert.equal(typeof essence.turn, 'number');
    assert.ok(essence.rows.every(row => typeof row.label === 'string' && row.values.length > 0 && row.values.every(Number.isFinite)));
    const nominal = buildSpell(essence, gear, locksOf(essence, gear), 22, floor);
    if (!entry.origin) assert.ok(minimum(nominal) >= 0.95 - 1e-12);
    for (const locks of cornersOf(essence, gear)) {
      const domains = lockDomains(essence, gear, locks);
      for (const [i, domain] of domains.entries()) {
        assert.ok(gear.zero ? locks.lows[i] >= domain.lo[0] - 1e-12 && locks.lows[i] <= domain.lo[1] + 1e-12 && locks.highs[i] >= domain.hi[0] - 1e-12 && locks.highs[i] <= domain.hi[1] + 1e-12 : locks.ranges[i] >= domain.r[0] - 1e-12 && locks.ranges[i] <= domain.r[1] + 1e-12);
      }
      const spell = buildSpell(essence, gear, locks, 22, floor);
      if (!entry.origin) assert.ok(minimum(spell) >= Math.min(0.95, floor + 0.15) - 1e-12);
    }
    if (WARDEN_MOTIFS[entry.id] && successes >= 2) { assert.equal(essence.morphStage, 1); assert.ok(essence.morphHint.length > 0); }
  }
  if (entry.origin) assert.deepEqual(provider(entry.id, 3, rng(9), 2, { successes: 3 }), createEssence(`static-${entry.zone}`, 3, rng(9), 2, { successes: 3 }));
});

test('new HP and packet pars describe two species casts or four warden casts at run power 22', () => {
  for (const entry of [...SPECIES, ...WARDENS]) {
    if (entry.origin) { assert.equal(motifHp(entry.id), null); continue; }
    const provider = providerOf(entry);
    const par = motifPar(entry.id);
    let hp = motifHp(entry.id);
    let bytes = 0;
    for (let turn = 0; turn < par.turns; turn++) {
      assert.ok(hp > 0);
      const essence = provider(entry.id, turn, () => 0.5, 1, { successes: turn });
      const gear = motifIntendedGear(entry.id, 1, { successes: turn });
      const spell = buildSpell(essence, gear, locksOf(essence, gear), 22, FOES[`static-${entry.zone}`].floor);
      hp -= spell.damage;
      bytes += spell.cost;
    }
    assert.ok(hp <= 0, `${entry.id} must clear by par`);
    assert.equal(bytes, par.bytes);
  }
});

test('Crosswind preserves paired products and head sensitivities; forecasts stay independent and truthful', () => {
  for (const id of ['kiln-cricket', 'margin-mote', 'index-wisp', 'furnace-witness', 'index-shade']) {
    const entry = [...SPECIES, ...WARDENS].find(entry => entry.id === id);
    const provider = providerOf(entry);
    const original = provider(id, 4, rng(71), 1, { successes: 2 });
    const moved = provider(id, 4, rng(71), 1, { successes: 2, crosswind: true });
    original.inputs.forEach((token, i) => assert.ok(Math.abs(dot(token, original.weights) - dot(moved.inputs[i], moved.weights)) < 1e-9));
  }
  for (const entry of [...SPECIES, ...WARDENS].filter(entry => entry.zone === 6)) {
    const essence = providerOf(entry)(entry.id, 3, rng(71), 1, { successes: 2, crosswind: true });
    const gear = motifIntendedGear(entry.id, 1, { successes: 2, crosswind: true });
    assert.ok(buildSpell(essence, gear, locksOf(essence, gear), 22, 0.88).fidelity >= 0.95);
  }
  for (const entry of [...SPECIES, ...WARDENS].filter(entry => entry.zone === 2)) for (const regime of ['calm', 'storm']) {
    const essence = providerOf(entry)(entry.id, 4, rng(71), 1, { regime });
    assert.equal(essence.storm, regime === 'storm');
    assert.ok(essence.forecast.startsWith(regime === 'storm' ? 'Storm' : 'Calm'));
    assert.deepEqual(lockDomains(essence, { bits: 4 })[0].r, [0.15, 2.4]);
    assert.notDeepEqual(essence.rows[0].values, essence.archive[regime]);
  }
});

test('fixed roster, finite banks and two short flavour sentences', () => {
  assert.equal(Object.keys(MOTIFS).length, 21);
  assert.equal(Object.keys(WARDEN_MOTIFS).length, 7);
  for (const entry of [...SPECIES, ...WARDENS]) {
    assert.equal((MOTIFS[entry.id] ?? WARDEN_MOTIFS[entry.id]).fixtures.length, 64);
    assert.equal(entry.lines.length, 2);
    for (const line of entry.lines) assert.ok(line.length <= 140 && /[.!?]$/.test(line));
  }
  assert.throws(() => createMotifEssence('unknown'), RangeError);
  assert.throws(() => createWardenEssence('bit-sprig'), RangeError);
});
// Captured from a passing node scripts/motif-audit.mjs run.
// Hash guards prevent stale earlier-tool evidence after a fixture/math change.
const AUDITED_MATH = '43398db6007834c87ed85236417c8f23ee7bc9ce329c2b78b1bf660d9baaf7e3';
const CERTIFIED_EARLIER = {
  "stepbud:0:0": ["4531f53f1479acc84200ca48f6b52303f013ed5acf71a3f4195d12e630a54387",13,8],
  "stepbud:0:1": ["4531f53f1479acc84200ca48f6b52303f013ed5acf71a3f4195d12e630a54387",13,8],
  "stepbud:2:0": ["589466f8be89f24b3da0fd2a30d8b8668ab476809e57d9a229dfd694f83ca686",13,8],
  "stepbud:2:1": ["589466f8be89f24b3da0fd2a30d8b8668ab476809e57d9a229dfd694f83ca686",13,8],
  "ripple-seed:0:0": ["971c091f2eb0125e68ebf1c832b4eb6938d1ea783405af1c08562c16ddfe71e6",28,18],
  "ripple-seed:0:1": ["971c091f2eb0125e68ebf1c832b4eb6938d1ea783405af1c08562c16ddfe71e6",28,18],
  "ripple-seed:2:0": ["71600b78ec2d3470622391e159bfa343ca40ac85eace8551aef57c4b671c46ea",28,18],
  "ripple-seed:2:1": ["71600b78ec2d3470622391e159bfa343ca40ac85eace8551aef57c4b671c46ea",28,18],
  "crooked-pebble:0:0": ["a7f6ca78c433166e04f84e47db8484b3b73c30bca3d80d70df884951d2f13849",28,26],
  "crooked-pebble:0:1": ["ec6b87eb5aca8fbf4b16573f29e05db12ce85bd6a1b2d4c0beeffb641ce621c0",28,26],
  "crooked-pebble:2:0": ["713b7a05ed4933461b0551db9f9282395cd62c0485e415cfe3de4f7a5d269a27",28,26],
  "crooked-pebble:2:1": ["07125191585add3548c3fc4e1f5d98d0b788efaca98bfae104f49f18e965c50b",28,26],
  "lantern-sliver:0:0": ["de16263dc03a52ca33d6062e80d3a1e0721d1f47f7511046d8eeca93efff0012",27,26],
  "lantern-sliver:0:1": ["2af765eda53f80f1b01f6af2bf35180a7389e3feb7190a22ac5d5738861e9941",27,26],
  "lantern-sliver:2:0": ["df8ec6dc11b84008ebe9d6f3a9b83e6de5b90112c384f8f75892897babf38e18",27,26],
  "lantern-sliver:2:1": ["0ac73f6b49ac10d18112e22a93528f8946a4e7cf85d67324b431c3bbb34628a5",27,26],
  "whisper-knot:0:0": ["266a5934de58d34b55d40da716c0b35fd00bebf951629fbc150eb06a2d1a0624",27,26],
  "whisper-knot:0:1": ["2d8fc7e0919016fa8a9ccc3fc3e734b5e878c8818ae33e411b7114d856edb62e",27,26],
  "whisper-knot:2:0": ["c94907d5a7f10e67d2ce5c6fd521d3d192228864240a23c74f72167b8b727e21",23,26],
  "whisper-knot:2:1": ["c48b4257025263a5c7caf75988cb7b6d7666fb4f4d4cc36e06c30c60c788974e",23,26],
  "loomlet:0:0": ["112b025e4a741186e77e7a581c0972da2f23211a343deff1c82ca59190a44a00",9,11],
  "loomlet:0:1": ["6dad2db14a6a8dbf512cc8d25fa16c11140a2af73a8967a8ed6933dc74aa9bf5",9,11],
  "loomlet:2:0": ["9acbac30324ec9dfeffa984b90120c50a95ff8cf6e7616783fda06739e109af9",18,26],
  "loomlet:2:1": ["880c516edd60ed01dfc29f5a4258112ae47c2f35349d597e7f1f3eb8de97319e",18,26],
  "kiln-cricket:0:0": ["41ab5648598952efdd5fa3f8981b05caab43333c1a5999b87bb5981428be858d",27,18],
  "kiln-cricket:0:1": ["375bf5c47ceebfb026709fa90647358739d64c2b4b734d8acbf2a868052b40d6",27,18],
  "kiln-cricket:2:0": ["7835ec0d23d2eeb470c5745298fd303d7bbe740872f2c784963ce9e31c613070",28,18],
  "kiln-cricket:2:1": ["606ea5c773d7e71c1cb1e0e64355481b1374abb8b112ba2b07fcb05f64057d4e",28,18],
  "ember-chip:0:0": ["00f31e23a783ca7b49bacdba216993b9aadda201664744c99b0fa884111a4f18",27,18],
  "ember-chip:0:1": ["fc6f6fc46129fce95aa82585bfe356582059f692a30b5792db25eacdbef70011",27,18],
  "ember-chip:2:0": ["0caa7247fafd9cbfa860987f8af6b1affc069187b90ab6e431a5349bb3b96cc6",27,18],
  "ember-chip:2:1": ["f685b7eccf38ac26f181b88c71b257ec3cdb38421ed0aebbac46d571bb78dfe5",27,18],
  "margin-mote:0:0": ["dd9c796f5b776604fa139637cd9bd3785982bc8c659ed670f1c52eba57192311",27,70],
  "margin-mote:0:1": ["b9a0bad6c87d349d0b01e449b173531188adcd3f1e670343ef799f9eb1c33325",27,70],
  "margin-mote:2:0": ["fcccdd32794104bc2e835b48fc3009ad04428f0f290d93eb7bd633e099bfb161",27,72],
  "margin-mote:2:1": ["7c97b5de78ab442922f7d45bdd42690d16a6dc03afc105f2bceaf494eb7ce47d",27,72],
  "index-wisp:0:0": ["d4915115e7052a71eee5e7b4251f90ae945e26bea49bef0a0b10bcd844ec5492",27,52],
  "index-wisp:0:1": ["7fd7b97252ba167af7e81720c78379355573fead4de423e35ef8642f977c4231",27,52],
  "index-wisp:2:0": ["da9d5c171deb95fe51911466519737778cd1e58a585bb93f1200d443450aebc6",20,39],
  "index-wisp:2:1": ["88288e2b1958ed2cd7b669c269779a6a3b822b42e00ad05e141a2d8ad52cdddb",20,39],
  "crown-crumb:0:0": ["40b3c3bc8fb69ecbc306743772ef3b067ade3e498c4ce7924670b13ead20f388",27,48],
  "crown-crumb:0:1": ["129f23489d736cfb9049b6a05cc6c4018d526babb733254823819915b6fff31b",27,48],
  "crown-crumb:2:0": ["0378ab0dcdf8928c4d32138283bb3d0742b2d6699eb9c1257287c835b8feb606",27,48],
  "crown-crumb:2:1": ["359ce8a7b53316d39f0b311336b512b2832c0df979ec6f07d2dd7dadf43b16c6",27,48],
  "prism-pip:0:0": ["8923ff170d4226c46dbaed8a8b8f55fea9f20e1da2b5ee3daf9bd36dd0e3ed33",27,48],
  "prism-pip:0:1": ["039de1cc0194e29c608bda6b615bf2d55013a9f9dd3638d6cdbed5400b049ab2",27,48],
  "prism-pip:2:0": ["6c9c3456aafe3bd355d4bdb74554fbe9cf906346cd77ba9232c3e39cb858d529",27,48],
  "prism-pip:2:1": ["9e19ffe1539a9b5b92d4fb3363378d1781b69eb9ed5be4eee04d1707cade3e08",27,48],
  "root-raster:0:0": ["43b14b31a27e99b971b785666e5c21022c8820c71124f6f78fed813e1b646bc0",13,8],
  "root-raster:0:1": ["43b14b31a27e99b971b785666e5c21022c8820c71124f6f78fed813e1b646bc0",13,8],
  "root-raster:2:0": ["d13a2280c14c7154db7042fd97ee1df088ccaa5b3db1093093ad119dbfe5402e",28,18],
  "root-raster:2:1": ["d13a2280c14c7154db7042fd97ee1df088ccaa5b3db1093093ad119dbfe5402e",28,18],
  "offbeat-bell:0:0": ["fbf517087f049a31e8dc61239e32f568d6c44988374ff86c98f9a628e241c0c4",28,26],
  "offbeat-bell:0:1": ["7fa307c88676ad741edd5734390f507b300b29679b9c468c3ab07a4fee22eb4f",28,26],
  "offbeat-bell:2:0": ["1647bea8505d9ea923c26c1ed188d2e03379e17d2e6ba2b0d865d9de95c19d57",28,26],
  "offbeat-bell:2:1": ["12a87ee9ff3b580d8ceecc2cea2fbf3654edda4dff0620597f875ed0a1608364",28,26],
  "loom-of-three:0:0": ["b95defbd87a10b55dc90df7d87cd488c5fdcea320fec90bfaafc7801add0e7a2",9,11],
  "loom-of-three:0:1": ["adeeda05bc240c613940f728b8af2db0588d8e922d573b81e7695ef2c91921c2",9,11],
  "loom-of-three:2:0": ["ea3f93ee49ebbd6d34ffea071e3e346866d503aabb50559d1c789b48c44185e2",18,26],
  "loom-of-three:2:1": ["342a47cbfac15eb4ae4c3c91824832e34223be8f907240267178abfa5fd41f2c",18,26],
  "furnace-witness:0:0": ["a526e3c6067e1548885fa810108b3683ae1bcbf1987d8ddf5ee4296aece02c0e",27,18],
  "furnace-witness:0:1": ["00661cb3245251929f3f7ccd3694a2e9724818d60b3daf44cf0050648a44eb3c",27,18],
  "furnace-witness:2:0": ["11c66fae7e530846ea22f179ef9808545c7c43f4ba2941738cb1469b03b40880",27,18],
  "furnace-witness:2:1": ["8aeceb63e7be81441a819b95023581f8d30634fe0fc933b633a9df3519a19778",27,18],
  "index-shade:0:0": ["fee76a358e6c9c51d073454a4c018a0b23f83507bb24228d7a894d19308db7a7",27,73],
  "index-shade:0:1": ["c0a26ad7b9813520cc032eaff960dccdbbc77148a77439946eb60379f799fe0c",27,73],
  "index-shade:2:0": ["32ffbacedb233006872ce373016b90df2f1081b6f4e350875d9bd9e7743ae9b1",27,46],
  "index-shade:2:1": ["d8c205aa7314f65dd03096cfc09f2f043e5399f36f4fb8815cf6eb9cdccd6370",27,42],
  "crown-allocator:0:0": ["d42ceeddf434c09856da29ddb0b4fc5c86a86125412def1ff87db562e8ba70c0",27,48],
  "crown-allocator:0:1": ["66ce9b7784d33ad8a0fc8779deb5120dc59c9e59aa3f03b91bfe2f1d45519e22",27,48],
  "crown-allocator:2:0": ["796a8a07bcf0c1ab1178ec2175f9ea6460ff0a6331a15f0f164867e93606b48c",27,48],
  "crown-allocator:2:1": ["7627a883493e2827b01137c64af8edd5df79d704a5f697d1d0ddd27548bde9fe",27,48],
  "foam-flicker:0:0": ["2efc09f55c1c9aacbe77f0d66c69c4d5625a89cd4a87fc2a2109c09eacb0e192",18,10],
  "foam-flicker:0:1": ["b93a00aa0355059065fd04cffcfeee40a6e1af7b9f365fa26733a5a6e19c6432",18,10],
  "foam-flicker:2:0": ["2efc09f55c1c9aacbe77f0d66c69c4d5625a89cd4a87fc2a2109c09eacb0e192",18,10],
  "foam-flicker:2:1": ["b93a00aa0355059065fd04cffcfeee40a6e1af7b9f365fa26733a5a6e19c6432",18,10],
  "undertow-dot:0:0": ["49073314bc24174efc8d9fc44bf1c8ea244341324bd423fb64fd9fce54916410",18,10],
  "undertow-dot:0:1": ["7ea7416691ce26cd09c01445bf363212c411b574e3c3eef4f4abde56351eedcd",18,10],
  "undertow-dot:2:0": ["49073314bc24174efc8d9fc44bf1c8ea244341324bd423fb64fd9fce54916410",18,10],
  "undertow-dot:2:1": ["7ea7416691ce26cd09c01445bf363212c411b574e3c3eef4f4abde56351eedcd",18,10],
  "undertow-ledger:0:0": ["6b36faae902aea4e58b290dc6175371edd09440e8de20f1fc17245be3a44961c",27,18],
  "undertow-ledger:0:1": ["b0de87ecedd15e5e6c19c44ab94f57237409e826a05774c378b06926b3e67142",27,18],
  "undertow-ledger:2:0": ["11e46720f247551157da38330c9f7c48fabeccdcc58844f8a92d5dec0346f58f",27,18],
  "undertow-ledger:2:1": ["f0a272e4fee0d6145cd2081f9219df0faef7590b05b9fbd4bc5df74809a6eb9e",27,18],
};
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('audited earlier-tool certificates remain valid for fixed representatives', () => {
  const math = createHash('sha256').update(['quantization.js', 'battle/spell.js', 'battle/metrics.js'].map(path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')).join('\\n')).digest('hex');
  assert.equal(math, AUDITED_MATH, 'Math changed: rerun the offline audit before refreshing certificates.');
  for (const [key, [expected, earlierDamage, earlierCost]] of Object.entries(CERTIFIED_EARLIER)) {
    const [id, stageText, shapeText] = key.split(':');
    const successes = Number(stageText), shape = Number(shapeText);
    const entry = [...SPECIES, ...WARDENS].find(entry => entry.id === id);
    const provider = providerOf(entry);
    const gear = motifIntendedGear(id, 1, { successes });
    const floor = FOES[`static-${entry.zone}`].floor;
    const make = turn => { let draw = 0; return provider(id, turn, () => draw++ === 0 ? (shape + 0.5) / 64 : 0.5, 1, { successes }); };
    const source = entry.zone === 2 ? Array.from({ length: 12 }, (_, turn) => make(turn)) : make(successes);
    assert.equal(fingerprint([source, gear, floor]), expected, `${key}: fixture changed; rerun the audit.`);
    const samples = Array.isArray(source) ? source : [source];
    const models = samples.map(essence => buildSpell(essence, gear, locksOf(essence, gear), 22, floor));
    const nominal = models.reduce((sum, spell) => sum + spell.damage, 0) / models.reduce((sum, spell) => sum + spell.cost, 0);
    const robust = samples.reduce((sum, essence) => sum + Math.min(...cornersOf(essence, gear).map(locks => buildSpell(essence, gear, locks, 22, floor).damage)), 0) / models.reduce((sum, spell) => sum + spell.cost, 0);
    const earlier = earlierDamage / earlierCost;
    assert.ok(nominal >= 1.2 * earlier - 1e-12, `${key}: nominal advantage`);
    assert.ok(robust >= earlier - 1e-12, `${key}: robust advantage`);
  }
});
