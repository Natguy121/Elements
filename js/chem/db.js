import substances from '../../data/substances.json' with { type: 'json' };
import reactions from '../../data/reactions.json' with { type: 'json' };
import discoveries from '../../data/discoveries.json' with { type: 'json' };
import compounds from '../../data/compounds.json' with { type: 'json' };
import genReactions from '../../data/reactions-gen.json' with { type: 'json' };
import stock from '../../data/stock.json' with { type: 'json' };
import { EL, molarMass } from './formula.js';

// Everything the chemistry knows comes from the JSON files in /data.
// Element substances inherit real melting point, boiling point, density and mass from elements.json.
export const SUB = {};
for (const raw of [...substances, ...compounds.elements, ...compounds.substances]) {
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
// other names for substances the game already had (minerals, IUPAC names): "Halite" is table salt
for (const id in compounds.aliases) if (SUB[id]) SUB[id].aka = compounds.aliases[id];
export const STOCK = stock.reagents.filter((id) => SUB[id]);
export const CATALYSTS = (stock.catalysts || []).filter((id) => SUB[id]);
export const RX = [...reactions, ...genReactions];
export const RXI = Object.fromEntries(reactions.map((r) => [r.id, r]));
export const DISC = Object.fromEntries([...discoveries, ...stock.discoveries].map((d) => [d.id, d]));
// every non-supply substance is also a discovery the first time it is made
for (const s of Object.values(SUB)) {
  if (s.supply) continue;
  DISC['sub_' + s.id] = { id: 'sub_' + s.id, name: s.name, formula: s.display || s.formula, cat: s.cat || 'Compounds', fact: s.fact, hint: 'A product of some reaction you have not tried yet.', sub: s.id };
}
// reactions indexed by what goes in, so the engine only looks at reactions that could happen
export const RX_BY_INPUT = {};
RX.forEach((r, i) => { r.idx = i; for (const inp of r.inputs) if (inp.from !== 'air') (RX_BY_INPUT[inp.id] ||= []).push(r); });
export const MADE_BY = {}; // substance id -> reactions that make it
for (const r of RX) for (const o of r.outputs) (MADE_BY[o.id] ||= []).push(r);
// hints that point at a real route
const nm = (id) => (SUB[id] ? SUB[id].name.toLowerCase() : id);
for (const s of Object.values(SUB)) {
  const d = DISC['sub_' + s.id];
  if (!d) continue;
  const r = (MADE_BY[s.id] || [])[0];
  if (r) d.hint = `Try ${r.inputs.filter((i) => i.from !== 'air').map((i) => nm(i.id)).join(' with ')}${r.conditions && r.conditions.minTemp ? ', heated' : ''}${r.inputs.some((i) => i.from === 'air') ? ', in air' : ''}.`;
  else if (s.banned || s.reference) d.hint = s.fact;
  else d.hint = 'Not made by any reaction in the lab yet. ' + (s.fact || '');
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
  if (d && !d.eq && !rx.gen) { d.eq = equationOf(rx); d.kind = rx.kind; }
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

// ---------- recipes: the shortest chain of steps from the lab's starting chemicals to a substance ----------
export const LAB_START = ['water', 'nahco3', 'acetic_acid', 'h2o2', 'yeast', 'sucrose', 'nacl', 'starch', 'oil', 'ethanol', 'hcl', 'naoh', 'citric', 'caco3', 'cuso4', 'alum', 'sodium', 'potassium', 'lithium', 'calcium', 'magnesium', 'iron', 'copper', 'carbon', 'aluminium', 'sulfur', 'phosphorus_red', 'mercury', 'silicon', 'gold', 'o2'];
// catalysts are on the table to speed things up; as ingredients they still have to be made
const START = new Set([...LAB_START, ...STOCK, 'nitrogen_gas']);
const CAT_OK = new Set([...START, ...CATALYSTS]);
const via = new Map(); // substance -> { rx, depth }
for (const id of START) via.set(id, { rx: null, depth: 0 });
// prefer the classic routes when several are equally short
const FAV = ['neutral', 'metal_acid', 'carbonate_acid', 'oxide_acid', 'precip', 'synth', 'smelt', 'halogen', 'ester', 'org_oxidise'];
const pref = (r) => { const i = FAV.indexOf((r.discovery || '').replace('rx_gen_', '')); return r.gen ? (i < 0 ? 20 : i) : -1; };
const ordered = [...RX].filter((r) => !r.phase).sort((a, b) => pref(a) - pref(b));
for (let round = 1; round < 14; round++) {
  let grew = false;
  for (const r of ordered) {
    const ins = r.inputs.filter((x) => x.from !== 'air').map((x) => x.id);
    if (!ins.every((id) => via.has(id) && via.get(id).depth < round)) continue;
    if (r.requires && !r.requires.every((x) => via.has(x.id))) continue;
    if (r.catalysts && r.rate.k < 0.001 && !r.catalysts.some((c) => via.has(c.id) || CAT_OK.has(c.id))) continue;
    for (const o of r.outputs) if (!via.has(o.id)) { via.set(o.id, { rx: r, depth: round }); grew = true; }
  }
  if (!grew) break;
}
export const isStarter = (id) => START.has(id);
export const stepsTo = (id) => (via.has(id) ? via.get(id).depth : null);
// the reactions to do, in order (each ingredient is made before it is used)
export function recipe(id) {
  if (!via.has(id) || START.has(id)) return via.has(id) ? [] : null;
  const out = [], done = new Set();
  (function walk(x) {
    const v = via.get(x);
    if (!v || !v.rx || done.has(v.rx.id)) return;
    for (const i of v.rx.inputs) if (i.from !== 'air') walk(i.id);
    if (v.rx.requires) for (const i of v.rx.requires) walk(i.id);
    done.add(v.rx.id); out.push(v.rx);
  })(id);
  return out;
}
