import substances from '../../data/substances.json' with { type: 'json' };
import reactions from '../../data/reactions.json' with { type: 'json' };
import discoveries from '../../data/discoveries.json' with { type: 'json' };
import { EL, molarMass } from './formula.js';

// Everything the chemistry knows comes from the JSON files in /data.
// Element substances inherit real melting point, boiling point, density and mass from elements.json.
export const SUB = {};
for (const raw of substances) {
  const s = { tags: [], ...raw };
  if (s.el) {
    const e = EL[s.el];
    const diatomic = ['H', 'N', 'O', 'F', 'Cl'].includes(s.el);
    s.formula = s.formula || (diatomic ? s.el + '2' : s.el);
    if (s.mp === undefined) s.mp = e.mp;
    if (s.bp === undefined) s.bp = e.bp;
    if (s.density === undefined) s.density = e.density;
    if (s.flame === undefined && e.flame) s.flame = e.flame;
    s.z = e.z;
  }
  if (s.M === undefined) s.M = molarMass(s.formula);
  if (!s.state) s.state = s.mp !== null && s.mp > 20 ? 's' : s.bp !== null && s.bp > 20 ? 'l' : 'g';
  SUB[s.id] = s;
}
export const RX = reactions;
export const RXI = Object.fromEntries(reactions.map((r) => [r.id, r]));
export const DISC = Object.fromEntries(discoveries.map((d) => [d.id, d]));
// every non-supply substance is also a discovery the first time it is made
for (const s of Object.values(SUB)) {
  if (s.supply) continue;
  DISC['sub_' + s.id] = { id: 'sub_' + s.id, name: s.name, formula: s.formula, cat: s.cat || 'Compounds', fact: s.fact, hint: 'A product of some reaction you have not tried yet.', sub: s.id };
}
// The balanced equation for a reaction, written the way a textbook would ("2 Na + 2 H₂O → 2 NaOH + H₂")
const SUBS = '₀₁₂₃₄₅₆₇₈₉';
export const pretty = (f) => (f || '').replace(/\d/g, (d) => SUBS[d]).replace(/·([₀-₉]+)/, (m, n) => '·' + n.replace(/[₀-₉]/g, (c) => SUBS.indexOf(c)));
export function equationOf(rx) {
  const side = (list) => list.map(({ id, mol }) => (mol === 1 ? '' : mol + ' ') + pretty(SUB[id].display || SUB[id].formula || SUB[id].name)).join(' + ');
  return side(rx.inputs) + ' → ' + side(rx.outputs);
}
// attach equation and reaction type to each reaction's discovery (the first reaction that leads to it)
for (const rx of RX) {
  const d = DISC[rx.discovery];
  if (d && !d.eq) { d.eq = equationOf(rx); d.kind = rx.kind; }
}
export const DISC_LIST = Object.values(DISC);

// pairs of substances that have a reaction together (used to decide whether a solid dropped in a puddle joins it)
const pairs = new Set();
for (const r of RX) {
  const ids = r.inputs.filter((i) => i.from !== 'air').map((i) => i.id);
  for (const a of ids) for (const b of ids) if (a !== b) pairs.add(a + '|' + b);
}
export const canReact = (a, b) => pairs.has(a + '|' + b);

// state of a substance at temperature T (C)
export function stateAt(s, T) {
  if (s.aerosol) return 'g';
  if (s.state === 'g' && (s.bp === undefined || s.bp === null)) return 'g';
  if (s.mp !== null && s.mp !== undefined && T < s.mp) return 's';
  if (s.bp !== null && s.bp !== undefined && T >= s.bp) return 'g';
  if (s.mp === null || s.mp === undefined) return s.state;
  return 'l';
}
