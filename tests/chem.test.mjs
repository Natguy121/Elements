import test from 'node:test';
import assert from 'node:assert/strict';
import { SUB, RX, DISC } from '../js/chem/db.js';
import { parseFormula } from '../js/chem/formula.js';
import { Mixture, CHUNK } from '../js/chem/mixture.js';
import { stepMixture, stepBoil, burnGas, observe } from '../js/chem/engine.js';

test('formula parser', () => {
  assert.deepEqual(parseFormula('Mg(CH3COO)2'), { Mg: 1, C: 4, H: 6, O: 4 });
  assert.deepEqual(parseFormula('C12H22O11'), { C: 12, H: 22, O: 11 });
  assert.ok(Math.abs(SUB.water.M - 18.015) < 0.01);
});

test('element substances use the real dataset', () => {
  assert.ok(Math.abs(SUB.sodium.mp - 97.8) < 1.5, 'sodium melts near 98 C: ' + SUB.sodium.mp);
  assert.ok(Math.abs(SUB.mercury.density - 13.53) < 0.05);
  assert.equal(SUB.mercury.state, 'l');
  assert.equal(SUB.h2.state, 'g');
});

for (const rx of RX) {
  test(`reaction ${rx.id}: atoms and mass balance`, () => {
    const side = (list) => {
      const atoms = {}; let mass = 0;
      for (const { id, mol } of list) {
        const s = SUB[id];
        assert.ok(s, 'unknown substance ' + id);
        assert.ok(s.formula, id + ' needs a formula to take part in a reaction');
        const a = parseFormula(s.formula);
        for (const el in a) atoms[el] = (atoms[el] || 0) + a[el] * mol;
        mass += s.M * mol;
      }
      return { atoms, mass };
    };
    const L = side(rx.inputs), R = side(rx.outputs);
    assert.deepEqual(Object.keys(L.atoms).sort(), Object.keys(R.atoms).sort());
    for (const el in L.atoms) assert.ok(Math.abs(L.atoms[el] - R.atoms[el]) < 1e-9, `${el}: ${L.atoms[el]} vs ${R.atoms[el]}`);
    assert.ok(Math.abs(L.mass - R.mass) / L.mass < 1e-6);
    assert.ok(DISC[rx.discovery], 'missing discovery ' + rx.discovery);
    assert.equal(typeof rx.enthalpy_kJ, 'number');
  });
}

test('sodium in water: limiting reagent, mass conserved, heat released', () => {
  const m = new Mixture(20);
  m.add('water', 5.55);           // 100 g
  m.add('sodium', 0.05, 20, CHUNK); // 1.15 g
  const m0 = m.massG();
  let h2 = 0;
  for (let i = 0; i < 4000; i++) for (const e of stepMixture(m, 0.05, { air: 0.5 })) h2 += e.emit.h2 || 0;
  assert.ok(m.get('sodium') < 1e-6, 'sodium is the limiting reagent and is used up');
  assert.ok(Math.abs(m.get('naoh') - 0.05) < 1e-4);
  assert.ok(Math.abs(h2 - 0.025) < 1e-4, '2 Na give 1 H2');
  assert.ok(Math.abs(m.get('water') - 5.5) < 1e-3);
  assert.ok(Math.abs(m.massG() + h2 * SUB.h2.M - m0) < 1e-6, 'mass is conserved');
  assert.ok(m.T > 25, 'exothermic');
  assert.ok(m.pH() > 12, 'solution is strongly alkaline');
});

test('baking soda and vinegar is endothermic and gives 1:1 CO2', () => {
  const m = new Mixture(20);
  m.add('water', 5); m.add('acetic_acid', 0.08); m.add('nahco3', 0.05);
  let co2 = 0;
  for (let i = 0; i < 600; i++) for (const e of stepMixture(m, 0.05, {})) co2 += e.emit.co2 || 0;
  assert.ok(Math.abs(co2 - 0.05) < 1e-4);
  assert.ok(Math.abs(m.get('acetic_acid') - 0.03) < 1e-4, 'excess acid is left over');
  assert.ok(m.T < 20);
});

test('activation energy: magnesium needs heat, then sustains itself', () => {
  const m = new Mixture(20);
  m.add('magnesium', 0.02, 20, CHUNK);
  assert.equal(stepMixture(m, 0.1, { air: 1 }).length, 0);
  m.T = 650;
  assert.ok(stepMixture(m, 0.1, { air: 1 }).length > 0);
  m.T = 300; // cooled, but already burning
  assert.ok(stepMixture(m, 0.1, { air: 1 }).length > 0);
  assert.equal(stepMixture(m, 0.1, { open: false }).length, 0, 'no air, no fire');
});

test('aluminium only burns as powder', () => {
  const lump = new Mixture(900); lump.add('aluminium', 0.1, 900, CHUNK);
  assert.equal(stepMixture(lump, 0.1, { air: 1 }).length, 0);
  const dust = new Mixture(900); dust.add('aluminium', 0.1, 900, 1);
  assert.ok(stepMixture(dust, 0.1, { air: 1 }).length > 0);
});

test('catalyst: peroxide barely decomposes without yeast', () => {
  const a = new Mixture(20); a.add('water', 5); a.add('h2o2', 0.1);
  stepMixture(a, 10, {});
  assert.ok(a.get('h2o2') > 0.0999);
  a.add('yeast', 0.01);
  for (let i = 0; i < 400; i++) stepMixture(a, 0.1, {});
  assert.ok(a.get('h2o2') < 0.01);
});

test('boiling holds water at 100 C and leaves the salt behind', () => {
  const m = new Mixture(20); m.add('water', 1); m.add('nacl', 0.05);
  let steam = 0;
  for (let i = 0; i < 4000; i++) { m.addHeat(60); steam += stepBoil(m, 0.1).water || 0; if (m.get('water') > 0.01) assert.ok(m.T <= 100.001); }
  assert.ok(m.get('water') < 1e-6 && Math.abs(steam - 1) < 1e-6);
  assert.ok(Math.abs(m.get('nacl') - 0.05) < 1e-9);
});

test('solubility, layers and pH', () => {
  const m = new Mixture(20); m.add('water', 5.55); m.add('nacl', 1); // 100 g water, 58 g salt
  assert.ok(Math.abs(m.dissolvedMol('nacl') * SUB.nacl.M - 36) < 0.1);
  assert.ok(observe(m).includes('obs_saturated'));
  m.add('oil', 0.05);
  const a = m.analyse();
  assert.equal(a.layers[a.layers.length - 1].key, 'org', 'oil is the top layer');
  const v = new Mixture(20); v.add('water', 5.27); v.add('acetic_acid', 0.083); // 5% vinegar
  assert.ok(Math.abs(v.pH() - 2.4) < 0.3, 'vinegar pH ' + v.pH());
});

test('hydrogen burn energy', () => {
  const r = burnGas({ h2: 0.02 }, 'h2');
  assert.ok(Math.abs(r.kJ - 4.84) < 0.01);
  assert.ok(Math.abs(r.products.water - 0.02) < 1e-9);
});

test('pouring conserves mass and leaves lumps behind', () => {
  const m = new Mixture(20); m.add('water', 5); m.add('nacl', 0.1); m.add('gold', 0.05, 20, CHUNK);
  const m0 = m.massG(), p = m.split(0.4);
  assert.ok(Math.abs(p.massG() + m.massG() - m0) < 1e-9);
  assert.equal(p.get('gold'), 0);
});

test('strong acid pH, titration through neutral, and indicator colours', async () => {
  const { indicatorColor } = await import('../js/chem/mixture.js');
  const m = new Mixture(20); m.add('water', 5.55); m.add('hcl', 0.01); // 0.1 M HCl in 100 mL
  assert.ok(Math.abs(m.pH() - 1) < 0.1, 'pH ' + m.pH());
  m.add('naoh', 0.02);
  for (let i = 0; i < 200; i++) stepMixture(m, 0.05, {});
  assert.ok(m.pH() > 12.5, 'excess NaOH makes it alkaline ' + m.pH());
  assert.ok(Math.abs(m.get('nacl') - 0.01) < 1e-4);
  assert.equal(indicatorColor('phph', 5)[1], 0, 'phenolphthalein is colourless in acid');
  assert.ok(indicatorColor('phph', 11)[1] > 0.9, 'and pink in alkali');
});

test('copper sulfate crystallises when a hot saturated solution cools', () => {
  const m = new Mixture(80); m.add('water', 5.55); m.add('cuso4', 0.3); // 75 g in 100 g water
  assert.ok(m.dissolvedMol('cuso4') > 0.299, 'all dissolves hot');
  m.T = 20;
  const left = (m.n.cuso4 - m.dissolvedMol('cuso4')) * SUB.cuso4.M;
  assert.ok(Math.abs(left - 43) < 2, 'about 43 g comes out at 20 C, got ' + left.toFixed(1));
});
