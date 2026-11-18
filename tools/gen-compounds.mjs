// Turns tools/compounds-source.md (1,701 compounds) into game data:
//   data/compounds.json      substances (new ones, plus alias names for ones the game already had)
//   data/reactions-gen.json  reactions that make them, generated from real chemistry rules
//   data/stock.json          the starting reagents you can order in Normal Mode
// Every generated equation is balanced by solving for the coefficients, and dropped if it will not balance.
// Run: node tools/gen-compounds.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFormula, EL } from '../js/chem/formula.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(resolve(root, 'tools/compounds-source.md'), 'utf8');
const BASE = JSON.parse(readFileSync(resolve(root, 'data/substances.json'), 'utf8'));
const BASE_RX = JSON.parse(readFileSync(resolve(root, 'data/reactions.json'), 'utf8'));

// ---------- reading formulas ----------
function normalise(raw) {
  let f = raw.trim().replace(/\[/g, '(').replace(/\]/g, ')').replace(/=/g, '').replace(/PPh3/g, 'P(C6H5)3').replace(/PCy3/g, 'P(C6H11)3').replace(/Ph\b|Ph\)/g, (m) => m.replace('Ph', 'C6H5'));
  const notes = {};
  if (/:/.test(f)) { f = f.split(':')[0]; notes.doped = true; }
  f = f.replace(/\(([A-Z][a-z]?),[A-Za-z]+\)/g, '$1').replace(/\(([A-Z]),([A-Z]H)\)/g, '$1'); // (Fe,Mn) -> Fe, (F,OH) -> F
  const poly = /^\((.+)\)n$/.exec(f);
  if (poly) { f = poly[1]; notes.polymer = true; }
  if (/n|m\b/.test(f.replace(/Mn|Zn|Sn|In|Rn|Mo|Mg|Cm|Am|Pm|Sm|Tm/g, ''))) notes.fuzzy = true;
  const parts = f.split('·');
  let out = '';
  for (const [i, p] of parts.entries()) {
    const m = /^(\d*\.?\d*|n)(.+)$/.exec(p);
    let k = m[1], body = m[2];
    if (i === 0) { out += k + body; continue; }
    if (k === 'n') { notes.fuzzy = true; continue; }
    if (k.includes('.')) { notes.fuzzy = true; continue; }
    out += '(' + body + ')' + (k || '');
  }
  if (/[^A-Za-z0-9()]/.test(out) || /^\d/.test(out)) notes.bad = true;
  return { f: out, notes };
}
function comp(f) { try { const c = parseFormula(f); for (const e in c) if (!EL[e] || !Number.isFinite(c[e])) return null; return Object.keys(c).length ? c : null; } catch { return null; } }
const key = (c) => Object.keys(c).sort().map((e) => e + c[e]).join('');
const massOf = (c) => Object.entries(c).reduce((m, [e, n]) => m + EL[e].mass * n, 0);
const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

// ---------- the list ----------
const CAT_MAP = {
  'Acids': 'Acids & Bases', 'Bases': 'Acids & Bases', 'Oxides': 'Oxides', 'Hydrides, nitrides and carbides': 'Compounds', 'Coordination compounds and complexes': 'Complexes',
  'Elements and diatomic or molecular forms': 'Molecules', 'Gases and common molecules': 'Gases', 'Sugars and carbohydrates': 'Food & Life', 'Amino acids and peptides': 'Food & Life',
  'Nucleic acid components': 'Food & Life', 'Vitamins and cofactors': 'Food & Life', 'Lipids and steroids': 'Food & Life', 'Pharmaceuticals': 'Medicines', 'Natural products and plant compounds': 'Natural products',
  'Polymers and monomers': 'Materials', 'Minerals and ceramics': 'Minerals', 'Pigments, dyes and materials': 'Pigments & Dyes',
};
const ORGANIC = new Set(['Alkanes and cycloalkanes', 'Alkenes, alkynes and dienes', 'Aromatic hydrocarbons', 'Alcohols and phenols', 'Aldehydes and ketones', 'Carboxylic acids', 'Esters and ethers', 'Amines, amides and nitrogen compounds', 'Halogenated organics and solvents']);
// made only by living things or by drug companies: in the book, never made in the lab
const NO_ROUTES = new Set(['Pharmaceuticals', 'Natural products and plant compounds', 'Vitamins and cofactors', 'Nucleic acid components', 'Amino acids and peptides', 'Lipids and steroids', 'Coordination compounds and complexes']);
const HOW_MADE = {
  'Pharmaceuticals': 'Medicines are made by pharmaceutical companies in many tightly controlled steps, then tested for years. It is in the book for reference, not something to make in the lab.',
  'Natural products and plant compounds': 'Made by living plants, fungi or animals, and extracted from them. It is in the book for reference.',
  'Vitamins and cofactors': 'Made by living things (or by industrial fermentation). Your body needs it in tiny amounts.',
  'Nucleic acid components': 'A building block of DNA and RNA, made inside living cells.',
  'Amino acids and peptides': 'A building block of proteins, made by living things and by industrial fermentation.',
  'Lipids and steroids': 'Made by living things. Fats, oils, waxes and hormones belong to this family.',
  'Coordination compounds and complexes': 'A metal ion held by surrounding molecules. Made in research labs; in the book for reference.',
};
// dangerous to make or to know how to make: in the book, never made in the lab
const BANNED = (name, c, f) => /cyan|azide|arsen|thallium|cadmium|beryllium|osmium|perchlor|chlorate|nitroglycer|trinitro|nitrocellul|picric|fulmin|phosgene|mustard|sarin|tabun|ricin|plutonium|uranium|radon|polonium|chlorine trifluoride|nitrogen trichloride|dichlorine heptoxide|hydrofluoric|hydrazoic|hydrazine|strychnine|nitromethane|nitroethane|dinitro|diazomethane|isocyanate|dimethyl sulfate|diethyl sulfate|white phosphorus|tetraarsenic|ammonium nitrate|ammonium perchlorate|nitrogen triiodide/i.test(name)
  || ['As', 'Tl', 'Cd', 'Be', 'Pu', 'U', 'Po', 'Ra', 'Rn', 'Os'].some((e) => c && c[e]) || (c && c.Hg && Object.keys(c).length > 1) || /CN|N3$/.test(f);
const TOXIC = (name, c) => /lead|mercury|chrom|nickel|cobalt|barium|fluor|chlor(?!ide)|brom|iod|nitrogen dioxide|sulfur dioxide|hydrogen sulfide|carbon monoxide|ammonia|formaldehyde|benzene|methanol|toluene|phenol|aniline|dichromate|permanganate/i.test(name) || (c && (c.Pb || c.Hg || c.Cr || c.Ni || c.Co));

const entries = [];
let cat = '';
for (const line of md.split('\n')) {
  const h = /^## (.+?) \(\d+\)/.exec(line); if (h) { cat = h[1]; continue; }
  const m = /^\| (.+?) \| (.+?) \|$/.exec(line);
  if (!m || m[1] === 'Name' || m[1].startsWith('---')) continue;
  const { f, notes } = normalise(m[2]);
  const c = notes.bad ? null : comp(f);
  entries.push({ name: m[1], raw: m[2], f, c, notes, cat });
}

// two real soaps, so oil + lye has something to make
for (const [name, f] of [['Sodium stearate', 'C18H35NaO2'], ['Sodium oleate', 'C18H33NaO2'], ['Sodium palmitate', 'C16H31NaO2']]) entries.push({ name, raw: f, f, c: comp(f), notes: {}, cat: 'Soaps' });
CAT_MAP.Soaps = 'Materials';
// ---------- matching what the game already has ----------
const base = BASE.map((s) => { const f = s.formula || (s.el ? (['H', 'N', 'O', 'F', 'Cl'].includes(s.el) ? s.el + '2' : s.el) : null); return { ...s, formula: f, c: f ? comp(f) : null }; });
const byKeyBase = new Map();
for (const s of base) if (s.c) { const k = key(s.c); if (!byKeyBase.has(k)) byKeyBase.set(k, []); byKeyBase.get(k).push(s); }
const words = (s) => new Set(s.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 3));
const ELEMENT_NAMES = { H2: 'h2', O2: 'o2', Na: 'sodium', K: 'potassium', Li: 'lithium', Ca: 'calcium', Mg: 'magnesium', Al: 'aluminium', Fe: 'iron', Cu: 'copper', Au: 'gold', Hg: 'mercury', S: 'sulfur', C: 'carbon', Si: 'silicon' };

const SUBS = new Map(); // id -> substance (new and old)
for (const s of base) SUBS.set(s.id, s);
const aliasOf = {}; // base id -> extra names
const out = []; // new substances
const used = new Set(base.map((s) => s.id));
const byKey = new Map(); // composition key -> [ids] (inorganic dedupe)
for (const s of base) if (s.c) { const k = key(s.c); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(s.id); }
const organic = (e) => ORGANIC.has(e.cat) || ['Sugars and carbohydrates', 'Polymers and monomers'].includes(e.cat) || NO_ROUTES.has(e.cat);

for (const e of entries) {
  const k = e.c ? key(e.c) : null;
  // the same thing the game already has, or a mineral name for a compound already listed
  if (k) {
    const sameBase = (byKeyBase.get(k) || []).find((s) => { const w = words(s.name), v = words(e.name); return [...v].some((x) => w.has(x)) || (!organic(e) && s.formula.replace(/[()]/g, '') === e.f.replace(/[()]/g, '')); });
    if (sameBase && !(e.notes.polymer && sameBase.id === 'wood')) { (aliasOf[sameBase.id] ||= []).push(e.name); e.id = sameBase.id; continue; }
    if (!organic(e) && byKey.has(k) && !e.notes.fuzzy) { const id = byKey.get(k)[0]; const s = SUBS.get(id); if (s && !s.formula.includes('H2O') === !e.f.includes('H2O')) { (aliasOf[id] ||= []).push(e.name); e.id = id; continue; } }
  }
  let id = slug(e.name) || 'compound';
  if (used.has(id)) { let n = 2; while (used.has(id + '_' + n)) n++; id = id + '_' + n; }
  used.add(id); e.id = id;
  if (k && !organic(e)) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(id); }
  e.banned = BANNED(e.name, e.c, e.f);
  out.push(e);
  SUBS.set(id, { id, name: e.name, formula: e.f, c: e.c, cat: e.cat, entry: e });
}

// ---------- ions ----------
const CATIONS = [
  ['Li', 1, 'Li'], ['Na', 1, 'Na'], ['K', 1, 'K'], ['Rb', 1, 'Rb'], ['Cs', 1, 'Cs'], ['NH4', 1, null], ['Ag', 1, 'Ag'], ['Cu', 1, 'Cu'],
  ['Mg', 2, 'Mg'], ['Ca', 2, 'Ca'], ['Sr', 2, 'Sr'], ['Ba', 2, 'Ba'], ['Zn', 2, 'Zn'], ['Fe', 2, 'Fe'], ['Cu', 2, 'Cu'], ['Ni', 2, 'Ni'], ['Co', 2, 'Co'], ['Mn', 2, 'Mn'], ['Pb', 2, 'Pb'], ['Sn', 2, 'Sn'],
  ['Al', 3, 'Al'], ['Fe', 3, 'Fe'], ['Cr', 3, 'Cr'], ['Bi', 3, 'Bi'], ['Ce', 3, 'Ce'], ['La', 3, 'La'], ['Ga', 3, 'Ga'],
].map(([f, z, m]) => ({ f, z, metal: m, c: comp(f) }));
const ANIONS = [
  ['F', 1, 'fluoride'], ['Cl', 1, 'chloride'], ['Br', 1, 'bromide'], ['I', 1, 'iodide'], ['OH', 1, 'hydroxide'], ['NO3', 1, 'nitrate'], ['NO2', 1, 'nitrite'], ['HCO3', 1, 'hydrogencarbonate'],
  ['HSO4', 1, 'hydrogensulfate'], ['H2PO4', 1, 'dihydrogenphosphate'], ['C2H3O2', 1, 'acetate'], ['CHO2', 1, 'formate'], ['ClO', 1, 'hypochlorite'], ['MnO4', 1, 'permanganate'], ['SCN', 1, 'thiocyanate'], ['IO3', 1, 'iodate'], ['BrO3', 1, 'bromate'],
  ['SO4', 2, 'sulfate'], ['SO3', 2, 'sulfite'], ['CO3', 2, 'carbonate'], ['S', 2, 'sulfide'], ['O', 2, 'oxide'], ['O2', 2, 'peroxide'], ['CrO4', 2, 'chromate'], ['Cr2O7', 2, 'dichromate'], ['HPO4', 2, 'hydrogenphosphate'],
  ['S2O3', 2, 'thiosulfate'], ['C2O4', 2, 'oxalate'], ['SiO3', 2, 'silicate'], ['MoO4', 2, 'molybdate'], ['WO4', 2, 'tungstate'], ['PO4', 3, 'phosphate'],
].map(([f, z, n]) => ({ f, z, n, c: comp(f) }));
const add = (a, b, k = 1) => { const o = { ...a }; for (const e in b) o[e] = (o[e] || 0) + b[e] * k; return o; };
const eq = (a, b) => { const ka = Object.keys(a).filter((e) => a[e]), kb = Object.keys(b).filter((e) => b[e]); return ka.length === kb.length && ka.every((e) => Math.abs(a[e] - (b[e] || 0)) < 1e-9); };
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// split a compound into cation + anion (+ water of crystallisation)
function ionsOf(c, name) {
  if (!c) return null;
  const nm = name.toLowerCase();
  for (const an of ANIONS) for (const ca of CATIONS) {
    if (ca.metal && !c[ca.metal]) continue;
    if (ca.f === 'NH4' && !(c.N && c.H)) continue;
    const L = ca.z * an.z / gcd(ca.z, an.z), x = L / ca.z, y = L / an.z;
    const ion = add(add({}, ca.c, x), an.c, y);
    for (let w = 0; w <= 12; w++) {
      const t = add(ion, { H: 2, O: 1 }, w);
      if (!eq(t, c)) continue;
      // multi-valent metals: the name's Roman numeral must agree
      const rn = /\((i{1,3}|iv)\)/.exec(nm), val = rn ? { i: 1, ii: 2, iii: 3, iv: 4 }[rn[1]] : null;
      if (val && val !== ca.z) continue;
      if (an.n === 'oxide' && /peroxide|superoxide/.test(nm)) continue;
      return { cat: ca, an, x, y, w };
    }
  }
  return null;
}

// ---------- what we know about each substance ----------
const pool = new Map(); // id -> { id, name, c, ions, entry }
for (const [id, s] of SUBS) { if (!s.c) continue; pool.set(id, { id, name: s.name, c: s.c, ions: ionsOf(s.c, s.name), cat: s.cat || (s.entry && s.entry.cat), banned: s.entry && s.entry.banned }); }
const find = (pred) => [...pool.values()].filter(pred);
const ionKey = (ca, an, w = 0) => `${ca.f}${ca.z}|${an.f}|${w}`;
const salts = new Map(); // ion key -> id
for (const p of pool.values()) if (p.ions && !p.banned) { const k = ionKey(p.ions.cat, p.ions.an, p.ions.w); if (!salts.has(k) || SUBS.get(p.id).supply) salts.set(k, p.id); }
const salt = (ca, an, w = 0) => (ca && an ? salts.get(ionKey(ca, an, w)) : undefined);
const elementId = { Bi: 'bismuth', Pt: 'platinum', Li: 'lithium', Na: 'sodium', K: 'potassium', Mg: 'magnesium', Ca: 'calcium', Al: 'aluminium', Fe: 'iron', Cu: 'copper', Au: 'gold', Hg: 'mercury', Zn: 'zinc', Sn: 'tin', Pb: 'lead', Ni: 'nickel', Ag: 'silver', Mn: 'manganese', Cr: 'chromium', Co: 'cobalt', Ba: 'barium', Sr: 'strontium' };
const NEW_ELEMENTS = [
  { id: 'zinc', name: 'Zinc', el: 'Zn', cp: 25.4, color: '#a8b0b8', look: 'metal', cat: 'Elements', supply: true, fact: 'Zinc coats steel to stop it rusting (galvanising). It reacts steadily with acids, giving off hydrogen.' },
  { id: 'tin', name: 'Tin', el: 'Sn', cp: 27, color: '#c4c6c8', look: 'metal', cat: 'Elements', supply: true, fact: 'A bar of tin "cries": it crackles when bent as its crystals slide past each other.' },
  { id: 'lead', name: 'Lead', el: 'Pb', cp: 26.6, color: '#7d8288', look: 'metal', cat: 'Elements', supply: true, tags: ['toxic'], fact: 'Lead is soft, heavy and poisonous. Romans used it for water pipes, which is where the word plumbing comes from (plumbum).' },
  { id: 'nickel', name: 'Nickel', el: 'Ni', cp: 26.1, color: '#b8b4a8', look: 'metal', cat: 'Elements', supply: true, fact: 'Nickel is magnetic, like iron and cobalt.' },
  { id: 'silver', name: 'Silver', el: 'Ag', cp: 25.4, color: '#dfe2e6', look: 'metal', cat: 'Elements', supply: true, fact: 'Silver conducts heat and electricity better than any other metal.' },
  { id: 'manganese', name: 'Manganese', el: 'Mn', cp: 26.3, color: '#9a9690', look: 'metal', cat: 'Elements', supply: true, fact: 'Manganese makes steel tough. Its compounds come in pink, green and deep purple.' },
  { id: 'chromium', name: 'Chromium', el: 'Cr', cp: 23.4, color: '#c9d0d8', look: 'metal', cat: 'Elements', supply: true, fact: 'Chromium gives stainless steel its shine and its resistance to rust.' },
  { id: 'cobalt', name: 'Cobalt', el: 'Co', cp: 24.8, color: '#a7aab0', look: 'metal', cat: 'Elements', supply: true, fact: 'Cobalt compounds give glass and pottery their deep blue.' },
  { id: 'barium', name: 'Barium', el: 'Ba', cp: 28.1, color: '#c8c6be', look: 'metal', handle: 'tongs', store: 'oil', tags: ['water_reactive'], cat: 'Elements', supply: true, fact: 'Barium burns with an apple-green flame, used in green fireworks.' },
  { id: 'platinum', name: 'Platinum', el: 'Pt', cp: 25.9, color: '#d8d6d0', look: 'metal', cat: 'Elements', supply: true, fact: 'Platinum is a superb catalyst: ammonia and oxygen burn on a red-hot platinum gauze to make nitric oxide, the first step to nitric acid.' },
  { id: 'bismuth', name: 'Bismuth', el: 'Bi', cp: 25.5, color: '#d8c8d0', look: 'metal', cat: 'Elements', supply: true, fact: 'Bismuth grows into rainbow-coloured staircase crystals when it cools from a melt.' },
  { id: 'strontium', name: 'Strontium', el: 'Sr', cp: 26.4, color: '#d8d0b8', look: 'metal', handle: 'tongs', store: 'oil', tags: ['water_reactive'], cat: 'Elements', supply: true, fact: 'Strontium burns crimson red: it is the red in fireworks and flares.' },
];
for (const s of NEW_ELEMENTS) pool.set(s.id, { id: s.id, name: s.name, c: { [s.el]: 1 }, ions: null });
const has = (id) => id && pool.has(id) && !pool.get(id).banned;
const byName = new Map();
for (const p of pool.values()) { byName.set(p.name.toLowerCase().trim(), p.id); byName.set(p.name.toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim(), p.id); const alt = /\(([^)]+)\)/.exec(p.name); if (alt && !/^[a-z0-9,-]{1,6}$/i.test(alt[1])) byName.set(alt[1].toLowerCase().trim(), p.id); }
for (const id in aliasOf) for (const n of aliasOf[id]) byName.set(n.toLowerCase().replace(/\(.*?\)/g, '').trim(), id);
const named = (...names) => { for (const n of names) { if (!n) continue; const k = n.toLowerCase().trim(); for (const key of [k, k.replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim()]) { const id = byName.get(key); if (has(id)) return id; } } return null; };

const ACID = { HSO4: named('sulfuric acid'), H2PO4: named('phosphoric acid'), HPO4: named('phosphoric acid'), Cl: 'hcl', Br: named('hydrobromic acid'), I: named('hydroiodic acid'), NO3: named('nitric acid'), SO4: named('sulfuric acid'), PO4: named('phosphoric acid'), C2H3O2: 'acetic_acid', CHO2: named('formic acid'), NO2: null, CO3: null, S: null, SO3: null };
const ACID_H = { Cl: 1, Br: 1, I: 1, NO3: 1, SO4: 2, PO4: 3, C2H3O2: 1, CHO2: 1 };
const WATER = 'water', CO2 = 'co2', H2 = 'h2', O2 = 'o2';
// how readily metals give up electrons (the reactivity series): higher = more reactive
const REACT = { K: 10, Na: 9, Li: 8.5, Ba: 8.2, Sr: 8.1, Ca: 8, Mg: 7, Al: 6, Mn: 5.5, Zn: 5, Cr: 4.8, Fe: 4.5, Co: 4.2, Ni: 4, Sn: 3.5, Pb: 3.2, H: 3, Cu: 2, Ag: 1, Hg: 0.8, Au: 0 };

// solubility in water, by the textbook rules
function solubility(ions) {
  const m = ions.cat.f, a = ions.an.f, g1 = ['Li', 'Na', 'K', 'Rb', 'Cs', 'NH4'].includes(m);
  if (['NO3', 'C2H3O2', 'CHO2', 'HCO3', 'H2PO4', 'MnO4', 'SCN'].includes(a)) return g1 || a !== 'HCO3' ? 40 : 10;
  if (['Cl', 'Br', 'I'].includes(a)) return ['Ag'].includes(m) || (m === 'Cu' && ions.cat.z === 1) ? 0.0001 : m === 'Pb' ? (a === 'I' ? 0.07 : 1) : 50;
  if (a === 'F') return ['Ca', 'Mg', 'Sr', 'Ba', 'Pb', 'Li'].includes(m) ? 0.01 : 4;
  if (a === 'SO4' || a === 'HSO4') return ['Ba', 'Sr', 'Pb'].includes(m) ? 0.0003 : m === 'Ca' ? 0.2 : m === 'Ag' ? 0.8 : 40;
  if (a === 'OH') return g1 ? 100 : m === 'Ba' ? 4 : m === 'Sr' ? 0.8 : m === 'Ca' ? 0.17 : 0.0002;
  if (['CrO4', 'Cr2O7'].includes(a)) return g1 || ['Mg', 'Ca'].includes(m) ? 30 : 0.001;
  if (['CO3', 'PO4', 'S', 'SO3', 'C2O4', 'SiO3', 'HPO4', 'O', 'O2', 'MoO4', 'WO4', 'IO3', 'BrO3'].includes(a)) return g1 ? 25 : 0.001;
  return g1 ? 30 : 1;
}
// colours you would actually see
function colourOf(p) {
  const n = p.name.toLowerCase(), i = p.ions;
  const fixed = [[/permanganate/, '#5a1680'], [/dichromate/, '#e0661c'], [/chromate/, '#f2c81c'], [/lead\(ii\) iodide|lead iodide/, '#f6c71a'], [/silver iodide/, '#f2e48a'], [/silver bromide/, '#efe6c4'],
    [/copper\(ii\) oxide|cupric oxide/, '#1c1a18'], [/copper\(i\) oxide/, '#b33a22'], [/iron\(iii\) oxide|hematite/, '#7a2e1a'], [/iron\(ii,iii\)|magnetite/, '#262422'], [/manganese dioxide|manganese\(iv\) oxide/, '#25221f'],
    [/chromium\(iii\) oxide/, '#3f7a34'], [/zinc sulfide/, '#f4f2ea'], [/cadmium sulfide/, '#f0b818'], [/sulfide/, '#1f1d1b'], [/lead\(ii\) oxide/, '#e8b830'], [/mercury\(ii\) oxide/, '#c43a1c'], [/nickel/, '#4f9c5a'], [/cobalt/, '#c43f6a'],
    [/copper\(ii\) carbonate|basic copper|malachite/, '#2e9a6a'], [/copper\(ii\) hydroxide/, '#3a8ed8'], [/copper\(ii\)/, '#2f7fd8'], [/iron\(iii\) hydroxide/, '#a8521e'], [/iron\(ii\) hydroxide/, '#6c8a4c'], [/iron\(iii\)/, '#c8781e'], [/iron\(ii\)/, '#a8c88a'],
    [/chromium\(iii\)/, '#3f8a5a'], [/manganese\(ii\)/, '#efc8d0'], [/sulfur/, '#e8d24a'], [/iodine/, '#4a2a3a'], [/bromine/, '#8a2a12'], [/carbon|graphite|soot/, '#1e1e1e'], [/silver oxide/, '#3a2a20'], [/prussian/, '#1c3a8a']];
  for (const [re, c] of fixed) if (re.test(n)) return c;
  if (i && i.cat.f === 'Cu' && i.cat.z === 2) return '#2f7fd8';
  return '#f2f2ee';
}
// a short fact for compounds that have none
function factOf(e, p, routes, depth) {
  const ORIGIN = {
    'Alkanes and cycloalkanes': 'In real life it comes from crude oil or natural gas, separated by distillation at a refinery.',
    'Alkenes, alkynes and dienes': 'In real life it is made by cracking oil fractions at a refinery, or taken from plants.',
    'Aromatic hydrocarbons': 'In real life it is distilled from crude oil or coal tar.',
    'Minerals and ceramics': 'In real life it is mined from the ground, or fired in a kiln.',
    'Gases and common molecules': 'In real life it is separated from liquefied air or natural gas.',
    'Pigments, dyes and materials': 'In real life it is made in specialist chemical plants (or, for old pigments, dug from the ground).',
    'Hydrides, nitrides and carbides': 'In real life it needs very high temperatures, pure gases or electricity that the lab does not have.',
    'Sugars and carbohydrates': 'In real life plants make it by photosynthesis.',
    'Polymers and monomers': 'In real life it is made in chemical plants from oil-based chemicals.',
  };
  const how = e.banned ? 'It is too dangerous to make in this game, so it is here for reference only.' : NO_ROUTES.has(e.cat) ? HOW_MADE[e.cat] : stockIds.has(e.id) ? `It is one of the starting chemicals in the storage room (Normal Mode).` : routes && depth ? `There ${routes === 1 ? 'is 1 way' : 'are ' + routes + ' ways'} to make it. From the starting chemicals it takes ${depth} step${depth > 1 ? 's' : ''}.` : routes ? `There ${routes === 1 ? 'is a reaction' : 'are reactions'} that make it, but their ingredients cannot be made from the lab's starting chemicals yet. ${ORIGIN[e.cat] || ''}` : `It cannot be made in the lab yet. ${ORIGIN[e.cat] || 'In real life it is made in industrial chemical plants.'}`;
  const kind = p && p.ions ? `A ${p.ions.an.n === 'oxide' ? 'metal oxide' : 'salt'} of ${p.ions.cat.f === 'NH4' ? 'ammonium' : EL[p.ions.cat.metal].name.toLowerCase()} ${p.ions.cat.metal && ['Fe', 'Cu', 'Sn', 'Pb', 'Mn', 'Co', 'Ni', 'Cr'].includes(p.ions.cat.metal) ? '(' + ['', 'I', 'II', 'III'][p.ions.cat.z] + ')' : ''} and ${p.ions.an.n}${p.ions.w ? ` with ${p.ions.w} water molecule${p.ions.w > 1 ? 's' : ''} in each crystal unit` : ''}.`.replace(' )', ')').replace(/ \(/, '(').replace(/\s+/g, ' ').replace(' and', ' and') : '';
  return [kind, `Category: ${e.cat.toLowerCase()}.`, how].filter(Boolean).join(' ');
}

// ---------- balancing ----------
class Q { constructor(n, d = 1) { const g = gcd(Math.abs(n), Math.abs(d)) || 1; this.n = (d < 0 ? -n : n) / g; this.d = Math.abs(d) / g; }
  sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); } mul(o) { return new Q(this.n * o.n, this.d * o.d); } div(o) { return new Q(this.n * o.d, this.d * o.n); } get z() { return this.n === 0; } }
function balance(ins, outs) {
  const sp = [...ins, ...outs].map((id) => pool.get(id).c), sign = [...ins.map(() => 1), ...outs.map(() => -1)];
  const els = [...new Set(sp.flatMap((c) => Object.keys(c)))];
  const n = sp.length, M = els.map((e) => sp.map((c, j) => new Q((c[e] || 0) * sign[j] * 1000 | 0 ? Math.round((c[e] || 0) * sign[j]) : 0)));
  if (sp.some((c) => Object.values(c).some((v) => !Number.isInteger(v)))) return null;
  // reduced row echelon form
  let r = 0; const piv = [];
  for (let col = 0; col < n && r < M.length; col++) {
    let p = r; while (p < M.length && M[p][col].z) p++;
    if (p === M.length) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const pv = M[r][col]; M[r] = M[r].map((x) => x.div(pv));
    for (let i = 0; i < M.length; i++) if (i !== r && !M[i][col].z) { const f = M[i][col]; M[i] = M[i].map((x, j) => x.sub(f.mul(M[r][j]))); }
    piv.push(col); r++;
  }
  const free = [...Array(n).keys()].filter((j) => !piv.includes(j));
  if (free.length < 1 || free.length > 2) return null;
  // a basis vector of the solutions for each free coefficient
  const basis = free.map((fj) => { const v = new Array(n).fill(null); v[fj] = new Q(1); for (const f2 of free) if (f2 !== fj) v[f2] = new Q(0); piv.forEach((col, i) => { v[col] = new Q(0).sub(M[i][fj]); }); return v.map((q) => q.n / q.d); });
  // the simplest all-positive whole-number combination
  let ints = null, best = Infinity;
  const ranges = basis.length === 1 ? [[1], [-1]] : (() => { const r = []; for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) if (a || b) r.push([a, b]); return r; })();
  for (const k of ranges) {
    const v = basis[0].map((x, j) => k.reduce((acc, kk, bi) => acc + kk * basis[bi][j], 0));
    let L = 1; for (const x of v) { let d = 1; while (Math.abs(x * d - Math.round(x * d)) > 1e-9 && d < 1000) d++; L = L * d / gcd(L, d); }
    const w = v.map((x) => Math.round(x * L));
    if (!w.every((x) => x > 0)) continue;
    const g = w.reduce((a, b) => gcd(a, b)), z = w.map((x) => x / g), sum = z.reduce((a, b) => a + b, 0);
    if (sum < best) { best = sum; ints = z; }
  }
  if (!ints) return null;
  const g = ints.reduce((a, b) => gcd(a, b));
  ints = ints.map((x) => x / g);
  if (Math.max(...ints) > 24) return null;
  return { ins: ins.map((id, i) => ({ id, mol: ints[i] })), outs: outs.map((id, i) => ({ id, mol: ints[ins.length + i] })) };
}

// ---------- the generated reactions ----------
const RXS = [], seen = new Set(), discOut = [];
const madeBy = new Map(); // product id -> count of routes
const nameOf = (id) => (NEW_ELEMENTS.find((s) => s.id === id) || SUBS.get(id) || {}).name || id;
function rx(kind, family, ins, outs, o = {}) {
  if (![...ins, ...outs].every(has)) return;
  if (o.target && pool.get(o.target).banned) return;
  const airIns = o.air ? [O2] : [];
  const b = balance([...ins, ...airIns], outs);
  if (!b) return;
  const sig = b.ins.map((x) => x.mol + x.id).sort().join('+') + '>' + b.outs.map((x) => x.mol + x.id).sort().join('+');
  if (seen.has(sig)) return;
  seen.add(sig);
  const id = 'g_' + family + '_' + RXS.length;
  const inputs = b.ins.map((x) => (o.air && x.id === O2 ? { ...x, from: 'air' } : x));
  const r = { id, name: o.name || `${nameOf(o.target || outs[0])} from ${ins.map((i) => nameOf(i).toLowerCase()).join(' and ')}`, kind, inputs, outputs: b.outs, enthalpy_kJ: o.dH ?? -50, rate: o.rate || { k: 0.6 }, effects: o.fx || [], discovery: 'rx_gen_' + family, gen: true };
  if (o.water) r.requires = [{ id: WATER }];
  if (o.cond) r.conditions = o.cond;
  if (o.cat) r.catalysts = o.cat;
  if (o.surf) r.productSurf = o.surf;
  RXS.push(r);
  for (const x of b.outs) madeBy.set(x.id, (madeBy.get(x.id) || 0) + 1);
}
const gasOut = (ids) => ids.some((id) => ['co2', 'h2', 'o2', 'so2', named('nitrogen dioxide'), named('hydrogen sulfide'), named('nitric oxide', 'nitrogen monoxide'), named('ammonia')].includes(id)) ? [{ fx: 'fizz', amount: 1 }] : [];

const saltList = [...pool.values()].filter((p) => p.ions && !p.banned);
const hydroxideOf = (ca) => salt(ca, ANIONS.find((a) => a.f === 'OH'));
const oxideOf = (ca) => salt(ca, ANIONS.find((a) => a.f === 'O'));
const carbonateOf = (ca) => salt(ca, ANIONS.find((a) => a.f === 'CO3'));
const anion = (f) => ANIONS.find((a) => a.f === f);
const cation = (f, z) => CATIONS.find((c) => c.f === f && c.z === z);
const isSoluble = (id) => { const p = pool.get(id); return p && p.ions ? solubility(p.ions) >= 1 : false; };
const sodiumSalt = (an) => salt(cation('Na', 1), an) || salt(cation('K', 1), an);

for (const p of saltList) {
  const { cat: ca, an, w } = p.ions;
  if (w) continue; // hydrates come from their dry salt below
  const target = p.id, metal = ca.metal && elementId[ca.metal];
  const insol = solubility(p.ions) < 0.5;
  const fxP = insol ? [{ fx: 'smoke', amount: 0.05, color: colourOf(p) }] : [];
  // 1. acid + alkali (neutralisation)
  if (ACID[an.f] && hydroxideOf(ca)) rx('Neutralisation', 'neutral', [hydroxideOf(ca), ACID[an.f]], [target, WATER], { target, water: true, dH: -57 * an.z, rate: { k: isSoluble(hydroxideOf(ca)) ? 6 : 0.3, surface: true } });
  if (ca.f === 'NH4' && ACID[an.f] && named('ammonium hydroxide')) rx('Neutralisation', 'neutral', [named('ammonium hydroxide'), ACID[an.f]], [target, WATER], { target, water: true, dH: -52, rate: { k: 6 } });
  // 2. acid + metal oxide
  if (ACID[an.f] && oxideOf(ca)) rx('Acid + metal oxide', 'oxide_acid', [oxideOf(ca), ACID[an.f]], [target, WATER], { target, water: true, dH: -60, rate: { k: 0.08, surface: true, q10: 1.8 } });
  // 3. acid + carbonate: fizzes
  if (ACID[an.f] && carbonateOf(ca) && an.f !== 'CO3') rx('Acid + carbonate', 'carbonate_acid', [carbonateOf(ca), ACID[an.f]], [target, WATER, CO2], { target, water: true, dH: -20, rate: { k: 0.4, surface: true }, fx: [{ fx: 'fizz', amount: 1 }] });
  // 4. acid + metal: metals above hydrogen in the reactivity series give hydrogen
  if (metal && ACID[an.f] && REACT[ca.metal] > REACT.H && REACT[ca.metal] < 8 && ['Cl', 'Br', 'I', 'SO4', 'C2H3O2', 'CHO2', 'PO4'].includes(an.f) && !(ca.metal === 'Fe' && ca.z === 3) && !(ca.metal === 'Cr' && ca.z === 3) && ca.metal !== 'Pb')
    rx('Acid + metal', 'metal_acid', [metal, ACID[an.f]], [target, H2], { target, water: true, dH: -120 * ca.z, rate: { k: 0.05 * (REACT[ca.metal] - 2.5), surface: true }, fx: [{ fx: 'fizz', amount: 1 }] });
  // 5. copper and silver dissolve in nitric acid, giving brown nitrogen dioxide... we use dilute: nitrogen monoxide
  if (metal && an.f === 'NO3' && ['Cu', 'Ag', 'Pb'].includes(ca.metal) && ca.z === (ca.metal === 'Ag' ? 1 : 2) && named('nitric oxide', 'nitrogen monoxide')) rx('Metal + nitric acid', 'metal_nitric', [metal, ACID.NO3], [target, named('nitric oxide', 'nitrogen monoxide'), WATER], { target, water: true, dH: -140, rate: { k: 0.03, surface: true }, fx: [{ fx: 'fizz', amount: 0.6 }] });
  // 6. precipitation: two dissolved salts swap partners and the insoluble one drops out
  if (insol && an.f !== 'O' && an.f !== 'O2') {
    const srcCat = ['NO3', 'Cl', 'SO4', 'C2H3O2'].map((f) => salt(ca, anion(f))).filter((id) => id && isSoluble(id) && id !== target);
    const srcAn = an.f === 'OH' ? ['naoh', 'koh'].filter(has) : [salt(cation('Na', 1), an), salt(cation('K', 1), an), salt(cation('NH4', 1), an)].filter((id) => id && isSoluble(id));
    let made = 0;
    for (const a of srcCat) for (const b of srcAn) {
      if (made >= 5) break;
      const pa = pool.get(a).ions, pb = pool.get(b).ions || { cat: cation('Na', 1) };
      const by = salt(pb.cat, pa.an);
      if (!by || by === target) continue;
      rx('Precipitation', 'precip', [a, b], [target, by], { target, water: true, dH: -25, rate: { k: 8 }, fx: fxP, surf: 1, name: `${nameOf(target)} precipitate` });
      made++;
    }
  }
  // 7. metal + non-metal, heated (synthesis): sulfides, halides
  if (metal && an.f === 'S' && ca.z <= 2) rx('Synthesis', 'synth', [metal, 'sulfur'], [target], { target, dH: -100, cond: { minTemp: 350, minSurf: 0.9 }, rate: { k: 0.25, q10: 1 }, fx: [{ fx: 'smoke', amount: 0.3, color: '#d8d0a0' }] });
  if (metal && ['Br', 'I'].includes(an.f) && named(an.f === 'Br' ? 'bromine' : 'iodine') && ca.z === ({ Fe: 3, Cu: 2, Sn: 4 }[ca.metal] || ca.z) && REACT[ca.metal] >= 2)
    rx('Synthesis', 'synth', [metal, named(an.f === 'Br' ? 'bromine' : 'iodine')], [target], { target, water: an.f === 'I' && ca.metal === 'Al', dH: -200, cond: { minTemp: an.f === 'I' && ca.metal === 'Al' ? 20 : 60 }, rate: { k: 0.15 }, fx: [{ fx: 'smoke', amount: 0.6, color: an.f === 'I' ? '#8a3aa8' : '#a8501e' }] });
  // 8. metal + oxygen, heated: oxides
  if (metal && an.f === 'O' && REACT[ca.metal] >= 2 && !['Na', 'K', 'Li', 'Mg', 'Al', 'Cu', 'Fe'].includes(ca.metal) && ca.z === ({ Fe: 3, Co: 2, Mn: 2, Cr: 3, Sn: 2, Pb: 2, Ni: 2 }[ca.metal] || ca.z))
    rx('Oxidation', 'oxidise', [metal], [target], { target, air: true, dH: -250, cond: { minTemp: 400 }, rate: { k: 0.04 }, fx: [{ fx: 'smoke', amount: 0.15, color: '#cfcfc8' }] });
  // 9. displacement: a more reactive metal pushes a less reactive one out of solution
  if (metal && !insol && ['SO4', 'NO3', 'Cl'].includes(an.f) && ca.metal !== 'Na' && ca.metal !== 'K') {
    for (const m of ['Mg', 'Zn', 'Fe', 'Cu', 'Al']) {
      if (REACT[m] >= REACT[ca.metal] - 0.3 && m !== ca.metal) continue; // must be more reactive... checked below
    }
    for (const [m, z] of [['Mg', 2], ['Zn', 2], ['Fe', 2], ['Cu', 2], ['Al', 3]]) {
      if (!(REACT[m] > REACT[ca.metal] + 0.3)) continue;
      const prod = salt(cation(m, z), an);
      if (prod && has(elementId[ca.metal])) rx('Displacement', 'displace', [elementId[m], target], [prod, elementId[ca.metal]], { water: true, dH: -60 * (REACT[m] - REACT[ca.metal]), rate: { k: 0.02, surface: true }, surf: 0.25, name: `${EL[m].name} pushes ${EL[ca.metal].name.toLowerCase()} out of ${nameOf(target).toLowerCase()}` });
    }
  }
}
// thermal decomposition and hydration, for everything with the right ions
for (const p of saltList) {
  const { cat: ca, an, w } = p.ions;
  const g1 = ['Li', 'Na', 'K', 'Rb', 'Cs'].includes(ca.f);
  if (w) { const dry = salt(ca, an, 0); if (dry) { rx('Thermal decomposition', 'dehydrate', [p.id], [dry, WATER], { target: dry, dH: 50 * w, cond: { minTemp: 110 }, rate: { k: 0.05, q10: 1.3 }, name: `Drying ${nameOf(p.id).toLowerCase()}` }); rx('Hydration', 'hydrate', [dry, WATER], [p.id], { target: p.id, dH: -12 * w, cond: { maxTemp: 95 }, rate: { k: 0.5 }, name: `${nameOf(dry)} takes up water` }); } continue; }
  const ox = oxideOf(ca);
  if (an.f === 'CO3' && !g1 && ox) rx('Thermal decomposition', 'decomp', [p.id], [ox, CO2], { target: ox, dH: 120, cond: { minTemp: Math.round(250 + 70 * (REACT[ca.f] || 4)) }, rate: { k: 0.05, q10: 1.4 }, fx: [{ fx: 'fizz', amount: 0.3 }], name: `Heating ${nameOf(p.id).toLowerCase()}` });
  if (an.f === 'OH' && !g1 && ca.f !== 'NH4' && ox) rx('Thermal decomposition', 'decomp', [p.id], [ox, WATER], { target: ox, dH: 50, cond: { minTemp: ca.f === 'Cu' ? 80 : 200 }, rate: { k: 0.06, q10: 1.4 }, name: `Heating ${nameOf(p.id).toLowerCase()}` });
  if (an.f === 'HCO3') { const c = carbonateOf(ca); if (c) rx('Thermal decomposition', 'decomp', [p.id], [c, WATER, CO2], { target: c, dH: 65, cond: { minTemp: 110 }, rate: { k: 0.08, q10: 1.4 }, fx: [{ fx: 'fizz', amount: 0.4 }], name: `Heating ${nameOf(p.id).toLowerCase()}` }); }
  if (an.f === 'NO3' && !g1 && ca.f !== 'NH4' && ox && named('nitrogen dioxide')) rx('Thermal decomposition', 'decomp', [p.id], [ox, named('nitrogen dioxide'), O2], { target: ox, dH: 200, cond: { minTemp: 300 }, rate: { k: 0.04, q10: 1.3 }, fx: [{ fx: 'smoke', amount: 0.4, color: '#a8501e' }], name: `Heating ${nameOf(p.id).toLowerCase()}` });
  if (an.f === 'NO3' && g1) { const n2 = salt(ca, anion('NO2')); if (n2) rx('Thermal decomposition', 'decomp', [p.id], [n2, O2], { target: n2, dH: 120, cond: { minTemp: 500 }, rate: { k: 0.03 }, name: `Heating ${nameOf(p.id).toLowerCase()}` }); }
  if (an.f === 'O' && (g1 || ['Ca', 'Ba', 'Sr', 'Mg'].includes(ca.f))) { const h = hydroxideOf(ca); if (h) rx('Hydration', 'oxide_water', [p.id, WATER], [h], { target: h, dH: -65, rate: { k: ca.f === 'Mg' ? 0.01 : 0.5, surface: true }, name: `${nameOf(p.id)} meets water` }); }
}
// acids from non-metal oxides, and from salts with sulfuric acid
for (const [oxName, acid] of [['sulfur trioxide', 'sulfuric acid'], ['dinitrogen pentoxide', 'nitric acid'], ['phosphorus pentoxide', 'phosphoric acid'], ['tetraphosphorus decoxide', 'phosphoric acid'], ['boron trioxide', 'boric acid'], ['selenium dioxide', 'selenous acid']])
  { const o = named(oxName) || (oxName.startsWith('phosph') ? 'p4o10' : null), a = named(acid); if (o && a) rx('Hydration', 'oxide_water', [o, WATER], [a], { target: a, dH: -100, rate: { k: 0.5 }, name: `${nameOf(o)} in water` }); }
{
  const nahso4 = named('sodium bisulfate', 'sodium hydrogen sulfate', 'sodium hydrogensulfate'), h2so4 = ACID.SO4;
  for (const [s, a] of [['nacl', 'hcl'], [named('sodium nitrate'), ACID.NO3]]) if (s && a && nahso4) rx('Acid displacement', 'acid_make', [s, h2so4], [nahso4, a], { target: a, dH: 10, cond: { minTemp: 150 }, rate: { k: 0.05 }, fx: [{ fx: 'smoke', amount: 0.4, color: '#e8eee8' }], name: `${nameOf(a)} from ${nameOf(s).toLowerCase()} and sulfuric acid` });
  // sulfur burns to sulfur dioxide (in the game already); sulfide + acid gives rotten-egg hydrogen sulfide
  const h2s = named('hydrogen sulfide');
  for (const p of saltList) if (p.ions.an.f === 'S' && !p.ions.w && h2s) { const s2 = salt(p.ions.cat, anion('Cl')); if (s2) rx('Acid + sulfide', 'sulfide_acid', [p.id, 'hcl'], [s2, h2s], { target: h2s, water: true, dH: -30, rate: { k: 0.2, surface: true }, fx: [{ fx: 'fizz', amount: 0.6 }] }); }
  // ammonium salt + alkali, warmed: ammonia
  const nh3 = named('ammonia');
  for (const p of saltList) if (p.ions.cat.f === 'NH4' && !p.ions.w && nh3) { const by = salt(cation('Na', 1), p.ions.an); if (by) rx('Ammonium salt + alkali', 'ammonia', [p.id, 'naoh'], [by, nh3, WATER], { target: nh3, dH: 20, cond: { minTemp: 40 }, rate: { k: 0.3 }, fx: [{ fx: 'fizz', amount: 0.3 }] }); }
  // manganese dioxide splits hydrogen peroxide (a second way to make oxygen)
  const mno2 = named('manganese dioxide', 'manganese(iv) oxide');
  if (mno2) RXS.push({ id: 'g_catalyst_mno2', name: 'Peroxide split by manganese dioxide', kind: 'Catalysed decomposition', inputs: [{ id: 'h2o2', mol: 2 }], outputs: [{ id: 'water', mol: 2 }, { id: 'o2', mol: 1 }], enthalpy_kJ: -196, rate: { k: 0.00002 }, catalysts: [{ id: mno2, boost: 20000 }], effects: [{ fx: 'fizz', amount: 1.2 }], discovery: 'rx_gen_catalyst', gen: true });
}
// ---------- organic chemistry ----------
const ALC = { methyl: ['methanol'], ethyl: ['ethanol'], propyl: ['1-propanol', 'propan-1-ol', 'n-propanol'], isopropyl: ['isopropanol', '2-propanol', 'isopropyl alcohol'], butyl: ['1-butanol', 'butan-1-ol', 'n-butanol'], pentyl: ['1-pentanol', 'pentan-1-ol'], amyl: ['1-pentanol'], isoamyl: ['isoamyl alcohol', '3-methyl-1-butanol', '3-methylbutan-1-ol'], isopentyl: ['isoamyl alcohol', '3-methyl-1-butanol'], benzyl: ['benzyl alcohol'], octyl: ['1-octanol', 'octan-1-ol'], hexyl: ['1-hexanol', 'hexan-1-ol'], phenyl: ['phenol'], vinyl: [] };
const ACIDS_ORG = { acetate: ['acetic acid'], formate: ['formic acid'], propanoate: ['propanoic acid', 'propionic acid'], propionate: ['propanoic acid', 'propionic acid'], butanoate: ['butanoic acid', 'butyric acid'], butyrate: ['butanoic acid', 'butyric acid'], benzoate: ['benzoic acid'], salicylate: ['salicylic acid'], lactate: ['lactic acid'], pentanoate: ['pentanoic acid', 'valeric acid'], valerate: ['pentanoic acid', 'valeric acid'], hexanoate: ['hexanoic acid'], octanoate: ['octanoic acid'], cinnamate: ['cinnamic acid'], anthranilate: ['anthranilic acid'], oxalate: ['oxalic acid'], acrylate: ['acrylic acid'], methacrylate: ['methacrylic acid'], stearate: ['stearic acid'], oleate: ['oleic acid'], palmitate: ['palmitic acid'], laurate: ['lauric acid'], citrate: ['citric acid'] };
byName.set('acetic acid', 'acetic_acid'); byName.set('ethanol', 'ethanol'); byName.set('citric acid', 'citric');
const H2SO4 = ACID.SO4;
const orgEntries = out.filter((e) => ORGANIC.has(e.cat) || e.cat === 'Sugars and carbohydrates' || e.cat === 'Polymers and monomers');
for (const e of orgEntries) {
  if (e.banned || !e.c) continue;
  const n = e.name.toLowerCase().replace(/\(.*?\)/g, '').trim();
  // esters: acid + alcohol, warmed with a little sulfuric acid
  const m = /^(\w+) (\w+)$/.exec(n);
  if (m && ALC[m[1]] && ACIDS_ORG[m[2]]) {
    const al = named(...ALC[m[1]]), ac = named(...ACIDS_ORG[m[2]]);
    if (al && ac) rx('Esterification', 'ester', [ac, al], [e.id, WATER], { target: e.id, dH: -5, cond: { minTemp: 60 }, rate: { k: 0.004, q10: 2 }, cat: H2SO4 ? [{ id: H2SO4, boost: 20 }] : undefined, name: `Making ${e.name.toLowerCase()} (an ester)` });
    const sodium = named('sodium ' + m[2]);
    if (sodium && al) rx('Saponification', 'ester_split', [e.id, 'naoh'], [sodium, al], { target: sodium, water: true, dH: -20, cond: { minTemp: 40 }, rate: { k: 0.05 }, name: `Splitting ${e.name.toLowerCase()} with alkali` });
  }
}
// alcohol -> aldehyde/ketone -> acid, with hot copper oxide or with air over a hot catalyst
for (const [alc, ald, acid] of [[['methanol'], ['formaldehyde', 'methanal'], ['formic acid']], [['ethanol'], ['acetaldehyde', 'ethanal'], ['acetic acid']], [['1-propanol', 'propan-1-ol'], ['propanal', 'propionaldehyde'], ['propanoic acid', 'propionic acid']], [['1-butanol', 'butan-1-ol'], ['butanal', 'butyraldehyde'], ['butanoic acid', 'butyric acid']], [['benzyl alcohol'], ['benzaldehyde'], ['benzoic acid']], [['isopropanol', '2-propanol', 'isopropyl alcohol'], ['acetone', 'propanone'], []], [['2-butanol', 'butan-2-ol'], ['butanone', 'methyl ethyl ketone', '2-butanone'], []], [['cyclohexanol'], ['cyclohexanone'], []]]) {
  const a = named(...alc), b = named(...ald), c = acid.length ? named(...acid) : null;
  if (a && b) { rx('Oxidation', 'org_oxidise', [a, 'cuo'], [b, 'copper', WATER], { target: b, dH: -30, cond: { minTemp: 250 }, rate: { k: 0.05 }, name: `${nameOf(a)} over hot copper oxide` }); rx('Oxidation', 'org_oxidise', [a], [b, WATER], { target: b, air: true, dH: -180, cond: { minTemp: 60 }, rate: { k: 0.01 }, cat: named('potassium dichromate') ? [{ id: named('potassium dichromate'), boost: 1 }] : undefined, name: `Oxidising ${nameOf(a).toLowerCase()}` }); }
  if (b && c) rx('Oxidation', 'org_oxidise', [b], [c], { target: c, air: true, dH: -250, cond: { minTemp: 40 }, rate: { k: 0.01 }, name: `${nameOf(b)} to ${nameOf(c).toLowerCase()}` });
}
// sugars: fermentation and splitting
{
  const glu = named('glucose', 'd-glucose'), fru = named('fructose', 'd-fructose');
  if (glu) rx('Fermentation', 'ferment', [glu], ['ethanol', CO2], { target: 'ethanol', water: true, dH: -70, cond: { maxTemp: 45, minTemp: 15 }, rate: { k: 0.00001 }, cat: [{ id: 'yeast', boost: 5000, perGram: true }], fx: [{ fx: 'fizz', amount: 0.3 }], name: 'Fermentation (yeast turns sugar into alcohol)' });
  if (glu && fru) rx('Hydrolysis', 'sugar_split', ['sucrose', WATER], [glu, fru], { target: glu, dH: -15, cond: { minTemp: 60 }, rate: { k: 0.002 }, cat: [{ id: 'hcl', boost: 30 }, { id: 'citric', boost: 10 }], name: 'Splitting sugar into glucose and fructose' });
  if (glu) rx('Hydrolysis', 'sugar_split', ['starch', WATER], [glu], { target: glu, dH: -10, cond: { minTemp: 70 }, rate: { k: 0.001 }, cat: [{ id: 'hcl', boost: 40 }], name: 'Breaking starch into glucose' });
  const glyc = named('glycerol', 'glycerin'), sodOle = named('sodium oleate');
  if (glyc && sodOle) rx('Saponification', 'soap', ['oil', 'naoh'], [glyc, sodOle], { target: sodOle, water: true, dH: -30, cond: { minTemp: 60 }, rate: { k: 0.01 }, name: 'Making soap from oil and lye' });
}
// salts of organic acids with alkalis and carbonates
for (const e of orgEntries) {
  if (e.cat !== 'Carboxylic acids' || e.banned) continue;
  const stem = e.name.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/ic acid$/, 'ate').replace(/oic acid$/, 'oate');
  for (const [pre, base, by] of [['sodium', 'naoh', [WATER]], ['potassium', 'koh', [WATER]], ['sodium', 'nahco3', [WATER, CO2]], ['calcium', 'caco3', [WATER, CO2]]]) {
    const s = named(pre + ' ' + stem);
    if (s) rx(base === 'nahco3' || base === 'caco3' ? 'Acid + carbonate' : 'Neutralisation', base === 'nahco3' || base === 'caco3' ? 'carbonate_acid' : 'neutral', [e.id, base], [s, ...by], { target: s, water: true, dH: -45, rate: { k: base === 'caco3' ? 0.06 : 4, surface: base === 'caco3' }, fx: by.includes(CO2) ? [{ fx: 'fizz', amount: 0.8 }] : [] });
  }
}
// polymers from monomers
for (const [mon, pol, extra] of [[['styrene'], ['polystyrene'], []], [['methyl methacrylate'], ['polymethyl methacrylate'], []], [['vinyl acetate'], ['polyvinyl acetate'], []], [['lactic acid'], ['polylactic acid'], [WATER]], [['caprolactam'], ['nylon 6'], []], [['glycolic acid'], ['polyglycolic acid'], [WATER]], [['isoprene'], ['polyisoprene'], []], [['acrylonitrile'], ['polyacrylonitrile'], []], [['1,3-butadiene', 'butadiene'], ['polybutadiene'], []]]) {
  const a = named(...mon), b = named(...pol);
  if (a && b) rx('Polymerisation', 'polymer', [a], [b, ...extra], { target: b, dH: -60, cond: { minTemp: 90 }, rate: { k: 0.003, q10: 1.6 }, name: `${nameOf(a)} links into ${nameOf(b).toLowerCase()}` });
}
for (const [x, y, pol] of [[['adipic acid', 'hexanedioic acid'], ['hexamethylenediamine', '1,6-diaminohexane'], ['nylon 6,6']], [['terephthalic acid'], ['ethylene glycol'], ['polyethylene terephthalate']]]) {
  const a = named(...x), b = named(...y), c = named(...pol);
  if (a && b && c) rx('Polymerisation', 'polymer', [a, b], [c, WATER], { target: c, dH: -40, cond: { minTemp: 220 }, rate: { k: 0.003 }, name: `${nameOf(c)} from ${nameOf(a).toLowerCase()} and ${nameOf(b).toLowerCase()}` });
}
// burning: anything made of C, H and O (and N) that is flammable burns to carbon dioxide and water
const N2 = named('nitrogen gas', 'nitrogen');
for (const e of out) {
  if (e.banned || !e.c || e.notes.fuzzy || !(ORGANIC.has(e.cat) || e.cat === 'Sugars and carbohydrates')) continue;
  const els = Object.keys(e.c);
  if (!els.includes('C') || !els.includes('H') || els.some((x) => !['C', 'H', 'O', 'N'].includes(x))) continue;
  if (els.includes('N') && !N2) continue;
  const dH = -(415 * e.c.C + 110 * e.c.H - 200 * (e.c.O || 0));
  rx('Combustion', 'combust', [e.id], els.includes('N') ? [CO2, WATER, N2] : [CO2, WATER], { air: true, dH: Math.round(dH), cond: { minTemp: e.cat === 'Sugars and carbohydrates' ? 400 : 250 }, rate: { k: 0.4, q10: 1 }, fx: [{ fx: 'flame', color: '#ffb040', size: 0.8 }, { fx: 'smoke', amount: 0.2, color: '#9a9a9a' }], name: `Burning ${e.name.toLowerCase()}` });
}

// ---------- more real routes ----------
{
  const N = (...n) => named(...n);
  const R = (kind, fam, ins, outs, o) => rx(kind, fam, ins.map((x) => (Array.isArray(x) ? N(...x) : x)), outs.map((x) => (Array.isArray(x) ? N(...x) : x)), o);
  // metals from their oxides with carbon (smelting), a real way to make zinc, lead, tin, nickel, cobalt
  for (const m of ['Zn', 'Pb', 'Sn', 'Ni', 'Co', 'Cu', 'Fe']) for (const z of [1, 2, 3]) { const ox = salt(cation(m, z), anion('O')); if (ox && has(elementId[m])) rx('Reduction (smelting)', 'smelt', [ox, 'carbon'], [elementId[m], CO2], { target: elementId[m], dH: 60, cond: { minTemp: m === 'Cu' ? 560 : m === 'Pb' ? 600 : 900, minSurf: 0.4 }, rate: { k: 0.05 }, fx: [{ fx: 'glow', color: '#ff7a2a' }], name: `Smelting ${EL[m].name.toLowerCase()} from ${nameOf(ox).toLowerCase()}` }); }
  // halogens and gases the classic way
  const mno2 = N('manganese dioxide', 'manganese(iv) oxide'), mncl2 = N('manganese(ii) chloride', 'manganese chloride'), mnso4 = N('manganese(ii) sulfate', 'manganese sulfate');
  R('Oxidation', 'halogen', [mno2, 'hcl'], [mncl2, ['chlorine gas', 'chlorine'], WATER], { target: N('chlorine gas', 'chlorine'), water: true, dH: 30, cond: { minTemp: 60 }, rate: { k: 0.03 }, fx: [{ fx: 'smoke', amount: 0.3, color: '#cfe8a0' }], name: 'Chlorine from manganese dioxide and hydrochloric acid' });
  for (const [hal, salts2] of [['bromine', ['sodium bromide', 'potassium bromide']], ['iodine', ['potassium iodide', 'sodium iodide']]]) for (const sn of salts2) {
    const sx = N(sn), sulf = sn.startsWith('sodium') ? N('sodium sulfate') : N('potassium sulfate');
    R('Oxidation', 'halogen', [sx, mno2, ACID.SO4], [sulf, mnso4, [hal], WATER], { target: N(hal), water: true, dH: 20, cond: { minTemp: 50 }, rate: { k: 0.05 }, fx: [{ fx: 'smoke', amount: 0.5, color: hal === 'iodine' ? '#8a3aa8' : '#a8501e' }], name: `${hal === 'iodine' ? 'Iodine' : 'Bromine'} from ${sn} (with manganese dioxide and sulfuric acid)` });
    if (hal === 'iodine') R('Oxidation', 'halogen', [sx, 'h2o2', ACID.SO4], [sulf, ['iodine'], WATER], { target: N('iodine'), water: true, dH: -150, rate: { k: 0.3 }, name: `Iodine from ${sn} and hydrogen peroxide` });
  }
  R('Thermal decomposition', 'decomp', [['potassium permanganate']], [['potassium manganate'], mno2, O2], { target: N('potassium manganate'), dH: 50, cond: { minTemp: 240 }, rate: { k: 0.05 }, name: 'Heating potassium permanganate (gives oxygen)' });
  R('Thermal decomposition', 'decomp', [['ammonium nitrite']], [['nitrogen gas', 'nitrogen'], WATER], { target: N('nitrogen gas', 'nitrogen'), dH: -300, cond: { minTemp: 70 }, rate: { k: 0.05 }, fx: [{ fx: 'fizz', amount: 0.6 }], name: 'Nitrogen from ammonium nitrite' });
  R('Thermal decomposition', 'decomp', [['mercury(ii) oxide', 'mercuric oxide']], ['mercury', O2], { target: O2, dH: 90, cond: { minTemp: 500 }, rate: { k: 0.03 }, name: 'Priestley\'s oxygen: heating mercury oxide' });
  // chromate and dichromate: yellow to orange and back
  R('Acid + chromate', 'chromate', [['potassium chromate'], ACID.SO4], [['potassium dichromate'], ['potassium sulfate'], WATER], { target: N('potassium dichromate'), water: true, dH: -10, rate: { k: 5 }, name: 'Chromate turns to orange dichromate in acid' });
  R('Alkali + dichromate', 'chromate', [['potassium dichromate'], 'koh'], [['potassium chromate'], WATER], { target: N('potassium chromate'), water: true, dH: -10, rate: { k: 5 }, name: 'Dichromate turns back to yellow chromate in alkali' });
  R('Acid + chromate', 'chromate', [['sodium chromate'], ACID.SO4], [['sodium dichromate'], ['sodium sulfate'], WATER], { target: N('sodium dichromate'), water: true, dH: -10, rate: { k: 5 } });
  // alkoxides: reactive metals in alcohols give hydrogen
  for (const [m, alk, alc] of [['sodium', 'sodium methoxide', 'methanol'], ['potassium', 'potassium methoxide', 'methanol'], ['potassium', 'potassium tert-butoxide', 'tert-butanol'], ['sodium', 'sodium isopropoxide', 'isopropanol']]) R('Metal + alcohol', 'alkoxide', [m, [alc]], [[alk], H2], { target: N(alk), dH: -180, rate: { k: 0.05, surface: true }, fx: [{ fx: 'fizz', amount: 0.8 }] });
  // nitrides: very hot magnesium, lithium or calcium also grab nitrogen from the air
  for (const [m, nit] of [['magnesium', 'magnesium nitride'], ['lithium', 'lithium nitride'], ['calcium', 'calcium nitride']]) { const n = N(nit), n2 = N('nitrogen gas', 'nitrogen'); if (n && n2 && has(m)) { const b = balance([m, n2], [n]); if (b) { const r = { id: 'g_nitride_' + RXS.length, name: `${nameOf(m)} burns in nitrogen`, kind: 'Synthesis', inputs: b.ins.map((x) => (x.id === n2 ? { ...x, from: 'air' } : x)), outputs: b.outs, enthalpy_kJ: -460, rate: { k: 0.02, q10: 1 }, conditions: { minTemp: 700 }, effects: [], discovery: 'rx_gen_synth', gen: true }; RXS.push(r); madeBy.set(n, (madeBy.get(n) || 0) + 1); } } }
  // calcium carbide in an electric-furnace heat, then acetylene from carbide and water
  R('Reduction', 'carbide', ['cao', 'carbon'], [['calcium carbide'], ['carbon monoxide']], { target: N('calcium carbide'), dH: 465, cond: { minTemp: 1800, minSurf: 0.4 }, rate: { k: 0.05 }, name: 'Calcium carbide (needs furnace heat)' });
  R('Hydrolysis', 'carbide', [['calcium carbide'], WATER], [['acetylene'], 'caoh2'], { target: N('acetylene'), dH: -128, rate: { k: 0.4, surface: true }, fx: [{ fx: 'fizz', amount: 1.2 }], name: 'Acetylene from calcium carbide and water' });
  // HBr and HI from their salts with phosphoric acid (sulfuric would oxidise them)
  for (const [sn, a] of [['sodium bromide', 'hydrobromic acid'], ['potassium iodide', 'hydroiodic acid']]) R('Acid displacement', 'acid_make', [[sn], ACID.PO4], [[sn.startsWith('sodium') ? 'monosodium phosphate' : 'monopotassium phosphate', sn.startsWith('sodium') ? 'sodium dihydrogen phosphate' : 'potassium dihydrogen phosphate'], [a]], { target: N(a), dH: 20, cond: { minTemp: 120 }, rate: { k: 0.05 } });
  // double salts crystallise from mixed solutions
  R('Crystallisation', 'double_salt', ['feso4', ['ammonium sulfate'], WATER], [['mohr\'s salt', 'ammonium iron(ii) sulfate']], { target: N('ammonium iron(ii) sulfate'), dH: -20, cond: { maxTemp: 40 }, rate: { k: 0.05 }, name: 'Mohr\'s salt crystallises' });

  // ---- organic ----
  // alcohols lose water (hot acid catalyst) to alkenes, and alkenes take water back
  for (const [alc, alk] of [['ethanol', 'ethylene'], ['1-propanol', 'propylene'], ['isopropanol', 'propylene'], ['1-butanol', '1-butene'], ['2-butanol', '2-butene'], ['tert-butanol', 'isobutylene'], ['1-pentanol', '1-pentene'], ['1-hexanol', '1-hexene'], ['cyclohexanol', 'cyclohexene']]) {
    const a = alc === 'ethanol' ? 'ethanol' : N(alc), b = N(alk);
    if (!a || !b) continue;
    rx('Dehydration', 'dehydrate_org', [a], [b, WATER], { target: b, dH: 45, cond: { minTemp: alc === 'tert-butanol' ? 80 : 170 }, rate: { k: 0.01 }, cat: [{ id: ACID.PO4, boost: 30 }, { id: ACID.SO4, boost: 40 }].filter((x) => x.id), name: `${nameOf(a)} loses water: ${nameOf(b).toLowerCase()}` });
    if (alk !== 'ethylene' && alk !== 'propylene' && !/butene|isobutylene/.test(alk)) rx('Hydration', 'hydrate_org', [b, WATER], [a], { target: a, dH: -45, cond: { minTemp: 60 }, rate: { k: 0.003 }, cat: ACID.PO4 ? [{ id: ACID.PO4, boost: 30 }] : undefined, name: `${nameOf(b)} takes up water: ${nameOf(a).toLowerCase()}` });
  }
  // alkenes decolourise bromine: the test for a double bond
  for (const [alk, prod] of [['cyclohexene', '1,2-dibromocyclohexane'], ['1-hexene', '1,2-dibromohexane'], ['styrene', 'styrene dibromide']]) R('Addition', 'bromine_test', [[alk], ['bromine']], [[prod]], { target: N(prod), dH: -120, rate: { k: 2 }, name: `${alk} decolourises bromine` });
  // haloalkanes from alcohols and hydrogen halides
  for (const [alc, acid, prod] of [['methanol', 'hcl', 'chloromethane'], ['ethanol', 'hcl', 'chloroethane'], ['ethanol', 'hydrobromic acid', 'ethyl bromide'], ['ethanol', 'hydrobromic acid', 'bromoethane'], ['methanol', 'hydrobromic acid', 'bromomethane'], ['methanol', 'hydroiodic acid', 'iodomethane'], ['tert-butanol', 'hcl', 'tert-butyl chloride'], ['benzyl alcohol', 'hcl', 'benzyl chloride']]) {
    const a = alc === 'ethanol' || alc === 'methanol' ? N(alc) || alc : N(alc), b = acid === 'hcl' ? 'hcl' : N(acid), c = N(prod);
    if (a && b && c) rx('Substitution', 'haloalkane', [a, b], [c, WATER], { target: c, dH: -30, cond: { minTemp: alc === 'tert-butanol' ? 20 : 60 }, rate: { k: 0.01 }, cat: N('zinc chloride') ? [{ id: N('zinc chloride'), boost: 10 }] : undefined, name: `${nameOf(c)} from ${nameOf(a).toLowerCase()}` });
  }
  // amines from haloalkanes and ammonia solution; amides from acids and ammonia
  const nh4oh = N('ammonium hydroxide');
  for (const [hal, amine] of [['chloroethane', 'ethylamine'], ['ethyl bromide', 'ethylamine'], ['chloromethane', 'methylamine'], ['benzyl chloride', 'benzylamine']]) { const h = N(hal), a = N(amine); if (h && a && nh4oh) { const by = /brom/.test(hal) ? N('hydrobromic acid') : 'hcl'; rx('Substitution', 'amine', [h, nh4oh], [a, by, WATER], { target: a, dH: -40, cond: { minTemp: 60 }, rate: { k: 0.005 }, name: `${nameOf(a)} from ${nameOf(h).toLowerCase()} and ammonia` }); } }
  for (const [acid, amide] of [['acetic_acid', 'acetamide'], ['formic acid', 'formamide'], ['benzoic acid', 'benzamide']]) { const a = acid === 'acetic_acid' ? acid : N(acid), b = N(amide); if (a && b && nh4oh) rx('Condensation', 'amide', [a, nh4oh], [b, WATER], { target: b, dH: 10, cond: { minTemp: 150 }, rate: { k: 0.005 }, name: `${nameOf(b)} from ${nameOf(a).toLowerCase()} and ammonia` }); }
  // ethers from two alcohols
  for (const [alc, eth] of [['ethanol', 'diethyl ether'], ['methanol', 'dimethyl ether'], ['1-propanol', 'dipropyl ether'], ['1-butanol', 'dibutyl ether']]) { const a = N(alc) || alc, b = N(eth); if (a && b) rx('Condensation', 'ether', [a], [b, WATER], { target: b, dH: -10, cond: { minTemp: 140 }, rate: { k: 0.005 }, cat: ACID.SO4 ? [{ id: ACID.SO4, boost: 40 }] : undefined, name: `${nameOf(b)} from ${nameOf(a).toLowerCase()}` }); }
  // the salt of a weak organic acid gives the acid back with a strong acid
  for (const p of pool.values()) {
    const m = /^(sodium|potassium) (\w+ate)$/.exec(p.name.toLowerCase()); if (!m) continue;
    const stem = m[2];
    const acid = N(stem.replace(/ate$/, 'ic acid'), stem.replace(/oate$/, 'oic acid'), stem === 'acetate' ? 'acetic acid' : '', { stearate: 'stearic acid', oleate: 'oleic acid', palmitate: 'palmitic acid', laurate: 'lauric acid', butyrate: 'butyric acid', propionate: 'propionic acid', benzoate: 'benzoic acid', salicylate: 'salicylic acid', citrate: 'citric acid', lactate: 'lactic acid', formate: 'formic acid', oxalate: 'oxalic acid', tartrate: 'tartaric acid', sorbate: 'sorbic acid', glutamate: '' }[stem] || '');
    const acidId = stem === 'acetate' ? 'acetic_acid' : stem === 'citrate' ? 'citric' : acid;
    if (!acidId || !pool.get(acidId) || pool.get(acidId).ions || !pool.get(acidId).c.C) continue; // only weak organic acids are freed this way
    rx('Acid displacement', 'weak_acid', [p.id, 'hcl'], [acidId, m[1] === 'sodium' ? 'nacl' : N('potassium chloride')], { target: acidId, water: true, dH: -5, rate: { k: 3 }, name: `${nameOf(acidId)} from ${p.name.toLowerCase()} and hydrochloric acid` });
  }
  // more oxidations, by stem
  for (const [alc, ald, acid] of [[['1-pentanol'], ['pentanal'], ['valeric acid', 'pentanoic acid']], [['1-hexanol'], ['hexanal'], ['caproic acid', 'hexanoic acid']], [['1-octanol'], ['octanal'], ['caprylic acid', 'octanoic acid']], [['isobutanol'], ['isobutyraldehyde'], ['isobutyric acid']], [['2-phenylethanol'], ['phenylacetaldehyde'], ['phenylacetic acid']], [['allyl alcohol'], ['acrolein'], ['acrylic acid']], [['furfuryl alcohol'], ['furfural'], ['furoic acid']], [['salicyl alcohol'], ['salicylaldehyde'], ['salicylic acid']], [['ethylene glycol'], ['glyoxal'], ['oxalic acid']]]) {
    const a = N(...alc), b = N(...ald), c = N(...acid);
    if (a && b) rx('Oxidation', 'org_oxidise', [a, 'cuo'], [b, 'copper', WATER], { target: b, dH: -30, cond: { minTemp: 250 }, rate: { k: 0.05 }, name: `${nameOf(a)} over hot copper oxide` });
    if (a && c) rx('Oxidation', 'org_oxidise', [a], [c, WATER], { target: c, air: true, dH: -400, cond: { minTemp: 60 }, rate: { k: 0.004 }, cat: N('potassium permanganate') ? [{ id: N('potassium permanganate'), boost: 3 }] : undefined, name: `${nameOf(a)} oxidised all the way to ${nameOf(c).toLowerCase()}` });
    if (b && c) rx('Oxidation', 'org_oxidise', [b], [c], { target: c, air: true, dH: -250, cond: { minTemp: 40 }, rate: { k: 0.01 } });
  }
  for (const [alc, ket] of [['2-pentanol', '2-pentanone'], ['3-pentanol', '3-pentanone'], ['cyclopentanol', 'cyclopentanone'], ['borneol', 'camphor'], ['menthol', 'menthone'], ['1-phenylethanol', 'acetophenone'], ['hydroquinone', 'benzoquinone']]) { const a = N(alc), b = N(ket); if (a && b) rx('Oxidation', 'org_oxidise', [a], [b, WATER], { target: b, air: true, dH: -180, cond: { minTemp: 60 }, rate: { k: 0.008 }, name: `${nameOf(a)} oxidised to ${nameOf(b).toLowerCase()}` }); }
  // sugars: splitting the double sugars, and glucose to fructose
  for (const [di, parts] of [['lactose', ['glucose', 'galactose']], ['maltose', ['glucose', 'glucose']], ['trehalose', ['glucose', 'glucose']], ['cellobiose', ['glucose', 'glucose']], ['cellulose', ['glucose']], ['glycogen', ['glucose']], ['raffinose', ['galactose', 'glucose', 'fructose']]]) { const d = N(di), ps = [...new Set(parts)].map((x) => N(x)); if (d && ps.every(Boolean)) rx('Hydrolysis', 'sugar_split', [d, WATER], ps, { target: ps[ps.length - 1], dH: -15, cond: { minTemp: 70 }, rate: { k: 0.002 }, cat: [{ id: 'hcl', boost: 40 }], name: `Splitting ${di} into ${parts.join(' and ')}` }); }
  { const g = N('glucose'), f = N('fructose'); if (g && f) rx('Isomerisation', 'sugar_split', [g], [f], { target: f, dH: 3, cond: { minTemp: 50 }, rate: { k: 0.0005 }, cat: [{ id: 'naoh', boost: 20 }], name: 'Glucose rearranges into fructose (mild alkali)' }); }
  { const so = N('sorbitol'), g = N('glucose'); void so; void g; }
  // classic school preparations
  R('Esterification', 'ester', [['salicylic acid'], ['acetic anhydride']], [['aspirin', 'acetylsalicylic acid'], 'acetic_acid'], { target: N('aspirin'), dH: -30, cond: { minTemp: 70 }, rate: { k: 0.01 }, cat: ACID.PO4 ? [{ id: ACID.PO4, boost: 20 }] : undefined, name: 'Aspirin from salicylic acid (a classic school synthesis)' });
  R('Esterification', 'ester', [['glycerol'], 'acetic_acid'], [['triacetin'], WATER], { target: N('triacetin'), dH: -15, cond: { minTemp: 100 }, rate: { k: 0.002 }, cat: ACID.SO4 ? [{ id: ACID.SO4, boost: 20 }] : undefined });
  R('Esterification', 'ester', [['glycerol'], ['stearic acid']], [['tristearin'], WATER], { target: N('tristearin'), dH: -15, cond: { minTemp: 150 }, rate: { k: 0.001 } });
  R('Saponification', 'soap', [['tristearin'], 'naoh'], [['glycerol'], ['sodium stearate']], { target: N('sodium stearate'), water: true, dH: -30, cond: { minTemp: 60 }, rate: { k: 0.01 }, name: 'Soap from tristearin and lye' });
  R('Saponification', 'soap', [['tripalmitin'], 'naoh'], [['glycerol'], ['sodium palmitate']], { target: N('sodium palmitate'), water: true, dH: -30, cond: { minTemp: 60 }, rate: { k: 0.01 } });
  R('Saponification', 'soap', [['triolein'], 'naoh'], [['glycerol'], ['sodium oleate']], { target: N('sodium oleate'), water: true, dH: -30, cond: { minTemp: 60 }, rate: { k: 0.01 } });
  R('Condensation', 'polymer', [['urea'], ['formaldehyde']], [['urea-formaldehyde'], WATER], { target: N('urea-formaldehyde'), dH: -20, cond: { minTemp: 90 }, rate: { k: 0.003 } });
  R('Combustion', 'combust', ['carbon'], [['carbon monoxide']], { air: true, target: N('carbon monoxide'), dH: -110, cond: { minTemp: 900 }, rate: { k: 0.02 }, name: 'Carbon burning short of air (carbon monoxide)' });
  R('Hydrolysis', 'acid_make', [['acetic anhydride'], WATER], ['acetic_acid'], { target: 'acetic_acid', dH: -60, rate: { k: 0.05 } });
  R('Hydrolysis', 'acid_make', [['acetyl chloride'], WATER], ['acetic_acid', 'hcl'], { target: 'acetic_acid', dH: -95, rate: { k: 1 }, fx: [{ fx: 'smoke', amount: 0.4, color: '#e8eee8' }] });
  R('Esterification', 'ester', [['acetyl chloride'], ['methanol']], [['methyl acetate'], 'hcl'], { target: N('methyl acetate'), dH: -60, rate: { k: 0.5 } });
  R('Esterification', 'ester', [['acetyl chloride'], 'ethanol'], [['ethyl acetate'], 'hcl'], { target: N('ethyl acetate'), dH: -60, rate: { k: 0.5 } });
  R('Hydrolysis', 'acid_make', [['benzoyl chloride'], WATER], [['benzoic acid'], 'hcl'], { target: N('benzoic acid'), dH: -90, rate: { k: 0.1 } });
  R('Esterification', 'ester', [['benzoic acid'], ['methanol']], [['methyl benzoate'], WATER], { target: N('methyl benzoate'), dH: -5, cond: { minTemp: 60 }, rate: { k: 0.003 }, cat: ACID.SO4 ? [{ id: ACID.SO4, boost: 20 }] : undefined });
  R('Esterification', 'ester', [['salicylic acid'], ['methanol']], [['methyl salicylate'], WATER], { target: N('methyl salicylate'), dH: -5, cond: { minTemp: 60 }, rate: { k: 0.003 }, cat: ACID.SO4 ? [{ id: ACID.SO4, boost: 20 }] : undefined, name: 'Oil of wintergreen (methyl salicylate)' });
}
// ---------- gases and industry: catalysts make gases react before they escape ----------
{
  const N = (...n) => named(...n);
  // ins/outs: substance names or ids; '@o2' and '@n2' come from the air
  function I(kind, fam, ins, outs, o = {}) {
    const res = (x) => (x === '@o2' ? O2 : x === '@n2' ? N('nitrogen gas', 'nitrogen') : pool.has(x) ? x : N(x));
    const a = ins.map(res), b = outs.map(res);
    if (![...a, ...b].every(has)) return;
    if (b.some((id) => pool.get(id).banned)) return;
    const bal = balance(a, b);
    if (!bal) return;
    const airIds = new Set(ins.map((x, k) => (x.startsWith('@') ? a[k] : null)).filter(Boolean));
    const cat = (o.cat || []).map((c) => (typeof c === 'string' ? { id: res(c), boost: 30 } : { ...c, id: res(c.id) })).filter((c) => has(c.id));
    if (o.cat && o.cat.length && !cat.length) return; // needs a catalyst the game does not have
    const r = { id: 'g_' + fam + '_' + RXS.length, name: o.name || `${nameOf(b[0])} from ${a.filter((x) => !airIds.has(x)).map((x) => nameOf(x).toLowerCase()).join(' and ')}`, kind, inputs: bal.ins.map((x) => (airIds.has(x.id) ? { ...x, from: 'air' } : x)), outputs: bal.outs, enthalpy_kJ: o.dH ?? -80, rate: o.rate || { k: cat.length ? 0.0005 : 0.05 }, effects: o.fx || [], discovery: 'rx_gen_' + fam, gen: true };
    if (cat.length) r.catalysts = cat;
    if (o.minTemp !== undefined || o.maxTemp !== undefined) r.conditions = { ...(o.minTemp !== undefined ? { minTemp: o.minTemp } : {}), ...(o.maxTemp !== undefined ? { maxTemp: o.maxTemp } : {}) };
    if (o.water) r.requires = [{ id: WATER }];
    RXS.push(r);
    for (const x of bal.outs) madeBy.set(x.id, (madeBy.get(x.id) || 0) + 1);
  }
  const C = (id, boost = 400) => ({ id, boost }); // a catalyst that makes an otherwise very slow reaction go
  const V2O5 = 'vanadium(v) oxide', PT = 'platinum', NI = 'nickel', FE = 'iron', ALCL3 = 'aluminum chloride', FECL3 = 'iron(iii) chloride';
  // contact process and nitric acid
  I('Catalytic oxidation', 'contact', ['so2', '@o2'], ['sulfur trioxide'], { cat: [C(V2O5)], minTemp: 400, dH: -198, name: 'Contact process: sulfur dioxide to sulfur trioxide (vanadium oxide catalyst)' });
  I('Catalytic synthesis', 'haber', ['@n2', 'h2'], ['ammonia'], { cat: [C(FE, 300)], minTemp: 400, dH: -92, name: 'Haber process: nitrogen and hydrogen to ammonia (iron catalyst)' });
  I('Catalytic oxidation', 'ostwald', ['ammonia', '@o2'], ['nitric oxide', WATER], { cat: [C(PT, 600)], minTemp: 700, dH: -905, fx: [{ fx: 'glow', color: '#ff7a2a' }], name: 'Ostwald process: ammonia burns on platinum to nitric oxide' });
  I('Oxidation', 'ostwald', ['nitric oxide', '@o2'], ['nitrogen dioxide'], { rate: { k: 0.3 }, dH: -114, fx: [{ fx: 'smoke', amount: 0.3, color: '#a8501e' }], name: 'Nitric oxide turns brown in air (nitrogen dioxide)' });
  I('Absorption', 'ostwald', ['nitrogen dioxide', '@o2', WATER], ['nitric acid'], { rate: { k: 0.3 }, dH: -100, name: 'Nitrogen dioxide in water makes nitric acid' });
  I('Synthesis', 'gas_synth', ['h2', 'chlorine gas'], ['hcl'], { minTemp: 200, rate: { k: 0.5 }, dH: -184, fx: [{ fx: 'flame', color: '#e8f0a0', size: 0.4 }], name: 'Hydrogen burns in chlorine (hydrogen chloride)' });
  I('Synthesis', 'gas_synth', ['h2', 'sulfur'], ['hydrogen sulfide'], { minTemp: 300, rate: { k: 0.02 }, dH: -20 });
  I('Synthesis', 'gas_synth', ['carbon', 'sulfur'], ['carbon disulfide'], { minTemp: 900, rate: { k: 0.02 }, dH: 89 });
  I('Dehydration', 'gas_synth', ['nitric acid', 'p4o10'], ['dinitrogen pentoxide', 'phosphoric acid'], { minTemp: 20, rate: { k: 0.1 }, dH: -20 });
  // hydrogen chemistry on nickel
  for (const [alk, ane] of [['ethylene', 'ethane'], ['propylene', 'propane'], ['1-butene', 'butane'], ['2-butene', 'butane'], ['isobutylene', 'isobutane'], ['1-pentene', 'pentane'], ['1-hexene', 'hexane'], ['cyclohexene', 'cyclohexane'], ['cyclopentene', 'cyclopentane'], ['acetylene', 'ethylene'], ['styrene', 'ethylbenzene'], ['benzene', 'cyclohexane'], ['1,3-butadiene', 'butane'], ['isoprene', 'isopentane'], ['triolein', 'tristearin'], ['oleic acid', 'stearic acid'], ['acetone', 'isopropanol'], ['acetaldehyde', 'ethanol'], ['formaldehyde', 'methanol'], ['benzaldehyde', 'benzyl alcohol'], ['cyclohexanone', 'cyclohexanol'], ['glucose', 'sorbitol'], ['xylose', 'xylitol'], ['mannose', 'mannitol']])
    I('Hydrogenation', 'hydrogenate', [alk, 'h2'], [ane], { cat: [C(NI, 500)], minTemp: 120, dH: -125, name: `${nameOf(N(alk) || alk)} + hydrogen on nickel: ${nameOf(N(ane) || ane).toLowerCase()}` });
  I('Catalytic synthesis', 'syngas', ['co2', 'h2'], ['methane', WATER], { cat: [C(NI, 500)], minTemp: 300, dH: -165, name: 'Sabatier reaction: carbon dioxide + hydrogen to methane (nickel)' });
  I('Catalytic reforming', 'syngas', ['methane', WATER], ['carbon monoxide', 'h2'], { cat: [C(NI, 500)], minTemp: 750, dH: 206, name: 'Steam reforming: methane + steam to carbon monoxide and hydrogen' });
  I('Catalytic synthesis', 'syngas', ['carbon monoxide', 'h2'], ['methanol'], { cat: [C('copper', 300), C('zinc oxide', 300)], minTemp: 220, dH: -91, name: 'Methanol from carbon monoxide and hydrogen (copper catalyst)' });
  I('Catalytic synthesis', 'syngas', ['methanol', 'carbon monoxide'], ['acetic_acid'], { cat: [C('hydroiodic acid', 300), C('iodine', 300)], minTemp: 150, dH: -135, name: 'Acetic acid from methanol and carbon monoxide (iodide catalyst)' });
  I('Water-gas reaction', 'syngas', ['carbon', WATER], ['carbon monoxide', 'h2'], { minTemp: 900, rate: { k: 0.01 }, dH: 131, name: 'Water gas: steam over red-hot carbon' });
  // alkenes and their products
  I('Catalytic hydration', 'hydrate_org', ['ethylene', WATER], ['ethanol'], { cat: [C('phosphoric acid')], minTemp: 250, dH: -45, name: 'Ethanol from ethylene and steam (phosphoric acid catalyst)' });
  I('Catalytic hydration', 'hydrate_org', ['propylene', WATER], ['isopropanol'], { cat: [C('phosphoric acid')], minTemp: 200, dH: -50 });
  I('Catalytic hydration', 'hydrate_org', ['isobutylene', WATER], ['tert-butanol'], { cat: [C('sulfuric acid')], minTemp: 60, dH: -50 });
  I('Catalytic hydration', 'hydrate_org', ['1-butene', WATER], ['2-butanol'], { cat: [C('sulfuric acid')], minTemp: 80, dH: -50 });
  I('Catalytic oxidation', 'epoxide', ['ethylene', '@o2'], ['ethylene oxide'], { cat: [C('silver', 400)], minTemp: 230, dH: -105, name: 'Ethylene oxide (silver catalyst)' });
  I('Hydrolysis', 'epoxide', ['ethylene oxide', WATER], ['ethylene glycol'], { minTemp: 60, rate: { k: 0.02 }, dH: -95 });
  I('Hydrolysis', 'epoxide', ['propylene oxide', WATER], ['propylene glycol'], { minTemp: 60, rate: { k: 0.02 }, dH: -90 });
  I('Addition', 'chlorinate', ['ethylene', 'chlorine gas'], ['1,2-dichloroethane'], { rate: { k: 0.3 }, dH: -180 });
  I('Cracking', 'chlorinate', ['1,2-dichloroethane'], ['vinyl chloride', 'hcl'], { minTemp: 500, rate: { k: 0.02 }, dH: 70, name: 'Vinyl chloride from cracking dichloroethane' });
  I('Addition', 'chlorinate', ['ethylene', 'hcl'], ['chloroethane'], { cat: [C(ALCL3, 50)], minTemp: 20, dH: -65 });
  I('Addition', 'chlorinate', ['acetylene', 'hcl'], ['vinyl chloride'], { cat: [C('zinc chloride', 200)], minTemp: 150, dH: -100 });
  I('Hydration', 'hydrate_org', ['acetylene', WATER], ['acetaldehyde'], { cat: [C('sulfuric acid', 200)], minTemp: 80, dH: -140, name: 'Acetaldehyde from acetylene and water' });
  I('Trimerisation', 'aromatic', ['acetylene'], ['benzene'], { cat: [C(FE, 200), C(NI, 200)], minTemp: 500, dH: -600, name: 'Benzene from three acetylene molecules (hot iron)' });
  // chlorinating with heat (or light)
  for (const [a, b] of [['methane', 'chloromethane'], ['chloromethane', 'dichloromethane'], ['dichloromethane', 'chloroform'], ['chloroform', 'carbon tetrachloride'], ['ethane', 'chloroethane'], ['toluene', 'benzyl chloride'], ['1,2-dichloroethane', '1,1,1-trichloroethane'], ['carbon tetrachloride', 'tetrachloroethylene']])
    I('Free-radical substitution', 'chlorinate', [a, 'chlorine gas'], [b, 'hcl'], { minTemp: 300, rate: { k: 0.03 }, dH: -100, name: `${nameOf(N(a) || a)} + chlorine (heat): ${nameOf(N(b) || b).toLowerCase()}` });
  for (const [a, b] of [['methane', 'bromomethane'], ['ethane', 'ethyl bromide']]) I('Free-radical substitution', 'chlorinate', [a, 'bromine'], [b, 'hydrobromic acid'], { minTemp: 300, rate: { k: 0.02 }, dH: -30 });
  I('Haloform reaction', 'chlorinate', ['acetone', 'iodine', 'naoh'], ['iodoform', 'sodium acetate', 'sodium iodide', WATER], { water: true, rate: { k: 0.2 }, dH: -50, name: 'Iodoform test: yellow crystals from acetone, iodine and alkali' });
  // benzene chemistry
  I('Electrophilic substitution', 'aromatic', ['benzene', 'chlorine gas'], ['chlorobenzene', 'hcl'], { cat: [C(FECL3, 400), C(ALCL3, 400)], minTemp: 20, dH: -130 });
  I('Electrophilic substitution', 'aromatic', ['benzene', 'bromine'], ['bromobenzene', 'hydrobromic acid'], { cat: [C('iron(iii) bromide', 400), C(FE, 200)], minTemp: 20, dH: -40 });
  I('Friedel-Crafts', 'aromatic', ['benzene', 'chloromethane'], ['toluene', 'hcl'], { cat: [C(ALCL3, 400)], minTemp: 20, dH: -40 });
  I('Friedel-Crafts', 'aromatic', ['toluene', 'chloromethane'], ['p-xylene', 'hcl'], { cat: [C(ALCL3, 400)], minTemp: 20, dH: -40 });
  I('Friedel-Crafts', 'aromatic', ['benzene', 'ethylene'], ['ethylbenzene'], { cat: [C(ALCL3, 400)], minTemp: 80, dH: -110 });
  I('Friedel-Crafts', 'aromatic', ['benzene', 'propylene'], ['cumene'], { cat: [C('phosphoric acid', 400), C(ALCL3, 400)], minTemp: 200, dH: -100 });
  I('Friedel-Crafts', 'aromatic', ['benzene', 'acetyl chloride'], ['acetophenone', 'hcl'], { cat: [C(ALCL3, 400)], minTemp: 40, dH: -60 });
  I('Friedel-Crafts', 'aromatic', ['benzene', 'benzoyl chloride'], ['benzophenone', 'hcl'], { cat: [C(ALCL3, 400)], minTemp: 60, dH: -60 });
  I('Catalytic dehydrogenation', 'aromatic', ['ethylbenzene'], ['styrene', 'h2'], { cat: [C('fe2o3', 400)], minTemp: 600, dH: 124, name: 'Styrene from ethylbenzene (iron oxide catalyst)' });
  I('Cumene process', 'aromatic', ['cumene', '@o2'], ['phenol', 'acetone'], { cat: [C('sulfuric acid', 300)], minTemp: 90, dH: -250, name: 'Cumene process: phenol and acetone from cumene and air' });
  I('Catalytic oxidation', 'aromatic', ['toluene', '@o2'], ['benzoic acid', WATER], { cat: [C('cobalt', 300), C('manganese dioxide', 300)], minTemp: 150, dH: -600 });
  I('Catalytic oxidation', 'aromatic', ['p-xylene', '@o2'], ['terephthalic acid', WATER], { cat: [C('cobalt', 300)], minTemp: 180, dH: -1300 });
  I('Catalytic oxidation', 'aromatic', ['naphthalene', '@o2'], ['phthalic anhydride', WATER, 'co2'], { cat: [C(V2O5, 400)], minTemp: 350, dH: -1800 });
  I('Catalytic oxidation', 'aromatic', ['benzene', '@o2'], ['maleic anhydride', WATER, 'co2'], { cat: [C(V2O5, 400)], minTemp: 400, dH: -1800 });
  I('Hydrolysis', 'aromatic', ['phthalic anhydride', WATER], ['phthalic acid'], { minTemp: 60, rate: { k: 0.05 }, dH: -30 });
  I('Hydrolysis', 'aromatic', ['maleic anhydride', WATER], ['maleic acid'], { minTemp: 20, rate: { k: 0.05 }, dH: -30 });
  I('Dehydrogenation', 'aromatic', ['cyclohexane'], ['benzene', 'h2'], { cat: [C(PT, 400)], minTemp: 450, dH: 206 });
  I('Dehydrogenation', 'aromatic', ['butane'], ['1,3-butadiene', 'h2'], { cat: [C('chromium(iii) oxide', 400)], minTemp: 600, dH: 236 });
  I('Dehydrogenation', 'aromatic', ['ethane'], ['ethylene', 'h2'], { minTemp: 800, rate: { k: 0.01 }, dH: 137, name: 'Cracking ethane to ethylene' });
  I('Cracking', 'aromatic', ['hexane'], ['ethylene', 'butane'], { cat: [C('al2o3', 300), C('sio2', 300)], minTemp: 500, dH: 80, name: 'Cracking hexane into smaller molecules' });
  I('Cracking', 'aromatic', ['hexane'], ['propylene', 'propane'], { cat: [C('al2o3', 300), C('sio2', 300)], minTemp: 500, dH: 80 });
  I('Cracking', 'aromatic', ['butane'], ['methane', 'propylene'], { minTemp: 700, rate: { k: 0.01 }, dH: 80 });
  I('Reforming', 'aromatic', ['hexane'], ['benzene', 'h2'], { cat: [C(PT, 400)], minTemp: 500, dH: 250, name: 'Reforming hexane into benzene (platinum catalyst)' });
  I('Reforming', 'aromatic', ['heptane'], ['toluene', 'h2'], { cat: [C(PT, 400)], minTemp: 500, dH: 250 });
  // ammonia chemistry
  I('Synthesis', 'ammonia_chem', ['ammonia', 'co2'], ['urea', WATER], { minTemp: 180, rate: { k: 0.01 }, dH: -100, name: 'Urea from ammonia and carbon dioxide' });
  I('Condensation', 'ammonia_chem', ['urea'], ['melamine', 'ammonia', 'co2'], { minTemp: 390, rate: { k: 0.01 }, dH: 470 });
  for (const [alc, am] of [['methanol', 'methylamine'], ['ethanol', 'ethylamine'], ['1-propanol', 'propylamine'], ['1-butanol', 'butylamine']]) I('Catalytic amination', 'ammonia_chem', [alc, 'ammonia'], [am, WATER], { cat: [C('al2o3', 300)], minTemp: 350, dH: -20 });
  I('Catalytic amination', 'ammonia_chem', ['methanol', 'ammonia'], ['dimethylamine', WATER], { cat: [C('al2o3', 300)], minTemp: 380, dH: -40 });
  I('Catalytic amination', 'ammonia_chem', ['methanol', 'ammonia'], ['trimethylamine', WATER], { cat: [C('al2o3', 300)], minTemp: 400, dH: -60 });
  I('Ring opening', 'ammonia_chem', ['ethylene oxide', 'ammonia'], ['ethanolamine'], { minTemp: 40, rate: { k: 0.02 }, dH: -90 });
  I('Ammoxidation', 'ammonia_chem', ['propylene', 'ammonia', '@o2'], ['acrylonitrile', WATER], { cat: [C('bismuth(iii) oxide', 400), C('molybdenum(vi) oxide', 400)], minTemp: 420, dH: -515 });
  I('Neutralisation', 'neutral', ['ammonia', 'hcl'], ['ammonium chloride'], { rate: { k: 5 }, dH: -176, fx: [{ fx: 'smoke', amount: 0.6, color: '#f4f4f0' }], name: 'Ammonia meets hydrogen chloride: a white smoke of ammonium chloride' });
  // polymers
  for (const [m, pol, cat, T] of [['ethylene', 'polyethylene', 'titanium(iv) chloride', 80], ['propylene', 'polypropylene', 'titanium(iv) chloride', 80], ['vinyl chloride', 'polyvinyl chloride', 'h2o2', 60], ['tetrafluoroethylene', 'polytetrafluoroethylene', 'h2o2', 60], ['chloroprene', 'neoprene', 'h2o2', 50], ['isobutylene', 'polyisobutylene', ALCL3, -50], ['ethylene oxide', 'polyethylene oxide', 'koh', 100], ['propylene oxide', 'polypropylene glycol', 'koh', 100], ['formaldehyde', 'polyoxymethylene', 'sulfuric acid', 20], ['acrylamide', 'polyacrylamide', 'h2o2', 40], ['acrylic acid', 'polyacrylic acid', 'h2o2', 60], ['vinyl alcohol', 'polyvinyl alcohol', 'h2o2', 60]])
    I('Polymerisation', 'polymer', [m], [pol], { cat: [C(cat, 400)], minTemp: Math.max(T, 20), dH: -90, name: `${nameOf(N(m) || m)} links into ${nameOf(N(pol) || pol).toLowerCase()}` });
  I('Hydrolysis', 'polymer', ['polyvinyl acetate', 'naoh'], ['polyvinyl alcohol', 'sodium acetate'], { water: true, minTemp: 50, rate: { k: 0.01 }, dH: -20 });
  I('Polymerisation', 'polymer', ['phenol', 'formaldehyde'], ['bakelite', WATER], { cat: [C('hcl', 300)], minTemp: 90, dH: -60 });
  I('Polymerisation', 'polymer', ['melamine', 'formaldehyde'], ['melamine-formaldehyde', WATER], { minTemp: 80, rate: { k: 0.003 }, dH: -40 });
  I('Polymerisation', 'polymer', ['sodium hydroxide', 'acrylic acid'], ['sodium polyacrylate', WATER], { cat: [C('h2o2', 300)], minTemp: 60, dH: -100 });
  I('Polymerisation', 'polymer', ['1,3-butadiene', 'styrene'], ['styrene-butadiene rubber'], { cat: [C('h2o2', 300)], minTemp: 50, dH: -150 });
  // inorganic helpers that open up whole families
  I('Synthesis', 'synth', ['aluminium', 'chlorine gas'], ['aluminum chloride'], { minTemp: 200, rate: { k: 0.2 }, dH: -1400, fx: [{ fx: 'sparks', amount: 0.6 }] });
  I('Synthesis', 'synth', ['iron', 'chlorine gas'], ['iron(iii) chloride'], { minTemp: 200, rate: { k: 0.2 }, dH: -800, fx: [{ fx: 'smoke', amount: 0.5, color: '#a8521e' }] });
  I('Synthesis', 'synth', ['sodium', 'chlorine gas'], ['nacl'], { minTemp: 20, rate: { k: 0.5 }, dH: -822, fx: [{ fx: 'flame', color: '#ffd400', size: 0.6 }], name: 'Sodium burns in chlorine: table salt' });
  I('Synthesis', 'synth', ['iron', 'bromine'], ['iron(iii) bromide'], { minTemp: 20, rate: { k: 0.1 }, dH: -500 });
  I('Synthesis', 'synth', ['titanium dioxide', 'carbon', 'chlorine gas'], ['titanium(iv) chloride', 'carbon monoxide'], { minTemp: 900, rate: { k: 0.01 }, dH: 80, name: 'Titanium chloride (chloride process)' });
  I('Thermal decomposition', 'decomp', ['ammonium metavanadate'], ['vanadium(v) oxide', 'ammonia', WATER], { minTemp: 200, rate: { k: 0.05 }, dH: 100 });
  I('Thermal decomposition', 'decomp', ['ammonium molybdate'], ['molybdenum(vi) oxide', 'ammonia', WATER], { minTemp: 300, rate: { k: 0.05 }, dH: 100 });
  I('Reduction', 'smelt', ['titanium(iv) chloride', 'magnesium'], ['titanium', 'mgcl2'], { minTemp: 800, rate: { k: 0.02 }, dH: -500 });
  I('Synthesis', 'gas_synth', ['carbon monoxide', 'naoh'], ['sodium formate'], { minTemp: 150, rate: { k: 0.02 }, dH: -60 });
  I('Peroxide', 'gas_synth', ['barium', '@o2'], ['barium peroxide'], { minTemp: 500, rate: { k: 0.02 }, dH: -630 });
  I('Peroxide', 'gas_synth', ['sodium', '@o2'], ['sodium peroxide'], { minTemp: 300, rate: { k: 0.05 }, dH: -510, fx: [{ fx: 'flame', color: '#ffd400', size: 0.5 }] });
  I('Peroxide', 'gas_synth', ['potassium', '@o2'], ['potassium superoxide'], { minTemp: 200, rate: { k: 0.05 }, dH: -285, fx: [{ fx: 'flame', color: '#c88ae0', size: 0.5 }] });
  I('Hydride', 'gas_synth', ['lithium', 'h2'], ['lithium hydride'], { minTemp: 600, rate: { k: 0.02 }, dH: -180 });
  I('Hydride', 'gas_synth', ['sodium', 'h2'], ['sodium hydride'], { minTemp: 300, rate: { k: 0.02 }, dH: -112 });
  I('Hydride', 'gas_synth', ['calcium', 'h2'], ['calcium hydride'], { minTemp: 400, rate: { k: 0.02 }, dH: -186 });
  I('Synthesis', 'gas_synth', ['silicon', 'carbon'], ['silicon carbide'], { minTemp: 1600, rate: { k: 0.01 }, dH: -73, name: 'Carborundum: silicon and carbon in great heat' });
  I('Synthesis', 'gas_synth', ['aluminium', '@n2'], ['aluminum nitride'], { minTemp: 1000, rate: { k: 0.01 }, dH: -318 });
  I('Synthesis', 'gas_synth', ['iron', 'carbon'], ['iron carbide'], { minTemp: 1100, rate: { k: 0.01 }, dH: 25, name: 'Cementite: iron dissolving carbon (the hard part of steel)' });
  I('Synthesis', 'gas_synth', ['silicon', '@n2'], ['silicon nitride'], { minTemp: 1300, rate: { k: 0.01 }, dH: -744 });
  I('Synthesis', 'gas_synth', ['zinc', 'sulfur'], ['zinc sulfide'], { minTemp: 300, rate: { k: 0.3 }, dH: -206, fx: [{ fx: 'flame', color: '#7ad0ff', size: 0.6 }] });
}
// ---------- the big push: real routes for as many of the rest as possible ----------
{
  const N = (...n) => named(...n);
  const res = (x) => (x === '@o2' ? O2 : x === '@n2' ? N('nitrogen gas', 'nitrogen') : pool.has(x) ? x : N(x));
  function J(kind, fam, ins, outs, o = {}) {
    const a = ins.map(res), b = outs.map(res);
    if (![...a, ...b].every(has) || b.some((id) => pool.get(id).banned)) return;
    const bal = balance(a, b); if (!bal) return;
    const airIds = new Set(ins.map((x, k) => (x.startsWith('@') ? a[k] : null)).filter(Boolean));
    const cat = (o.cat || []).map((c) => ({ id: res(c), boost: o.boost || 300 })).filter((c) => has(c.id));
    if (o.cat && o.cat.length && !cat.length) return;
    const sig = bal.ins.map((x) => x.mol + x.id).sort().join('+') + '>' + bal.outs.map((x) => x.mol + x.id).sort().join('+');
    if (seen.has(sig)) return; seen.add(sig);
    const r = { id: 'g_' + fam + '_' + RXS.length, name: o.name || `${nameOf(b[0])} from ${a.filter((x) => !airIds.has(x)).map((x) => nameOf(x).toLowerCase()).join(' and ')}`, kind, inputs: bal.ins.map((x) => (airIds.has(x.id) ? { ...x, from: 'air' } : x)), outputs: bal.outs, enthalpy_kJ: o.dH ?? -60, rate: o.rate || { k: cat.length ? 0.0006 : 0.03 }, effects: o.fx || [], discovery: 'rx_gen_' + fam, gen: true };
    if (cat.length) r.catalysts = cat;
    if (o.T !== undefined || o.maxT !== undefined) r.conditions = { ...(o.T ? { minTemp: o.T } : {}), ...(o.maxT !== undefined ? { maxTemp: o.maxT } : {}) };
    if (o.water) r.requires = [{ id: WATER }];
    RXS.push(r); for (const x of bal.outs) madeBy.set(x.id, (madeBy.get(x.id) || 0) + 1);
  }
  // --- alkanes from paraffin wax by cracking, then everything downstream
  const ALK = ['methane', 'ethane', 'propane', 'butane', 'pentane', 'hexane', 'heptane', 'octane', 'nonane', 'decane', 'undecane', 'dodecane', null, null, null, 'hexadecane', null, null, null, 'eicosane'];
  for (let n = 4; n <= 30; n++) {
    const big = n === 30 ? 'triacontane' : ALK[n - 1];
    if (!big) continue;
    for (const [alkene, k] of [['ethylene', 2], ['propylene', 3]]) for (let m = 1; m <= 3; m++) { const small = ALK[n - k * m - 1]; if (small && n - k * m >= 1) J('Cracking', 'aromatic', [big], [small, alkene], { cat: ['al2o3', 'sio2'], T: 450, dH: 90, name: `Cracking ${big}: ${small} and ${alkene}` }); }
  }
  for (const [ane, ene] of [['pentane', '1-pentene'], ['hexane', '1-hexene'], ['butane', '1-butene'], ['butane', '2-butene'], ['propane', 'propylene'], ['isobutane', 'isobutylene'], ['isopentane', 'isoprene'], ['cyclohexane', 'cyclohexene'], ['cyclopentane', 'cyclopentene']]) J('Catalytic dehydrogenation', 'aromatic', [ane], [ene, 'h2'], { cat: ['platinum', 'chromium(iii) oxide'], T: 550, dH: 125 });
  J('Isomerisation', 'aromatic', ['butane'], ['isobutane'], { cat: ['aluminum chloride'], T: 100, dH: -8 });
  J('Isomerisation', 'aromatic', ['pentane'], ['isopentane'], { cat: ['aluminum chloride'], T: 100, dH: -8 });
  J('Alkylation', 'aromatic', ['isobutane', 'isobutylene'], ['isooctane (2,2,4-trimethylpentane)', 'isooctane'], { cat: ['sulfuric acid'], T: 20, dH: -80, name: 'Isooctane (petrol) from isobutane and isobutylene' });
  for (const [ane, aro] of [['octane', 'o-xylene'], ['octane', 'm-xylene'], ['octane', 'p-xylene'], ['octane', 'ethylbenzene'], ['heptane', 'toluene'], ['nonane', 'mesitylene'], ['nonane', 'cumene']]) J('Reforming', 'aromatic', [ane], [aro, 'h2'], { cat: ['platinum'], T: 500, dH: 250 });
  for (const [aro, sat] of [['toluene', 'methylcyclohexane'], ['naphthalene', 'tetralin'], ['naphthalene', 'decalin'], ['biphenyl', 'cyclohexylbenzene']]) J('Hydrogenation', 'hydrogenate', [aro, 'h2'], [sat], { cat: ['nickel'], T: 150, dH: -200 });
  J('Coupling', 'aromatic', ['benzene', '@o2'], ['biphenyl', WATER], { cat: ['platinum'], T: 700, dH: -100 });
  J('Friedel-Crafts', 'aromatic', ['benzene', 'benzyl chloride'], ['diphenylmethane', 'hcl'], { cat: ['aluminum chloride'], T: 40 });
  J('Friedel-Crafts', 'aromatic', ['toluene', 'propylene'], ['cymene (p-cymene)', 'cymene'], { cat: ['aluminum chloride'], T: 40 });
  J('Friedel-Crafts', 'aromatic', ['benzene', 'chloromethane'], ['hexamethylbenzene', 'hcl'], { cat: ['aluminum chloride'], T: 100 });
  J('Friedel-Crafts', 'aromatic', ['benzene', 'chloromethane'], ['durene', 'hcl'], { cat: ['aluminum chloride'], T: 80 });
  J('Friedel-Crafts', 'aromatic', ['benzene', 'chloroform'], ['triphenylmethane', 'hcl'], { cat: ['aluminum chloride'], T: 60 });
  J('Dehydrogenation', 'aromatic', ['ethylbenzene'], ['stilbene', 'h2'], { cat: ['platinum'], T: 600 });
  // --- alcohols, glycols, ethers
  for (const [ene, alc] of [['ethylene', '1-propanol'], ['propylene', '1-butanol'], ['propylene', 'isobutanol'], ['1-butene', '1-pentanol'], ['1-pentene', '1-hexanol']]) J('Oxo process', 'syngas', [ene, 'carbon monoxide', 'h2'], [alc], { cat: ['cobalt'], T: 150, dH: -200, name: `${nameOf(N(alc))} from ${ene}, carbon monoxide and hydrogen (oxo process)` });
  for (const [fat, acid] of [['triolein', 'oleic acid'], ['tristearin', 'stearic acid'], ['tripalmitin', 'palmitic acid'], ['oil', 'oleic acid'], ['triacetin', 'acetic_acid']]) J('Hydrolysis', 'ester_split', [fat, WATER], ['glycerol', acid], { cat: ['sulfuric acid'], T: 100, dH: -10, name: `Splitting ${nameOf(res(fat)).toLowerCase()} into glycerol and ${nameOf(res(acid)).toLowerCase()}` });
  for (const [acid, alc] of [['caprylic acid', '1-octanol'], ['palmitic acid', 'cetyl alcohol'], ['stearic acid', 'stearyl alcohol'], ['caproic acid', '1-hexanol'], ['valeric acid', '1-pentanol']]) J('Hydrogenation', 'hydrogenate', [acid, 'h2'], [alc, WATER], { cat: ['copper', 'nickel'], T: 250, dH: -60 });
  J('Hydrolysis', 'epoxide', ['ethylene oxide', 'ethylene glycol'], ['diethylene glycol'], { T: 80, dH: -90 });
  J('Hydrolysis', 'epoxide', ['ethylene oxide', 'diethylene glycol'], ['polyethylene glycol (peg)', 'polyethylene glycol'], { T: 100, dH: -90 });
  J('Catalytic oxidation', 'epoxide', ['propylene', 'h2o2'], ['propylene oxide', WATER], { cat: ['titanium dioxide'], T: 40, dH: -200, name: 'Propylene oxide from propylene and hydrogen peroxide' });
  J('Hydrogenation', 'hydrogenate', ['maleic anhydride', 'h2'], ['butanediol (1,4-)', WATER], { cat: ['copper', 'nickel'], T: 200, dH: -200 });
  J('Dehydration', 'ether', ['butanediol (1,4-)'], ['tetrahydrofuran (thf)', WATER], { cat: ['phosphoric acid'], T: 200 });
  J('Dehydrogenation', 'ether', ['butanediol (1,4-)'], ['gamma-butyrolactone', 'h2'], { cat: ['copper'], T: 220 });
  J('Dehydration', 'ether', ['diethylene glycol'], ['1,4-dioxane', WATER], { cat: ['sulfuric acid'], T: 160 });
  J('Condensation', 'ether', ['ethylene glycol', 'formaldehyde'], ['1,3-dioxolane', WATER], { cat: ['sulfuric acid'], T: 80 });
  J('Condensation', 'ether', ['isobutylene', 'methanol'], ['methyl tert-butyl ether (mtbe)', 'methyl tert-butyl ether'], { cat: ['sulfuric acid'], T: 60 });
  J('Condensation', 'ether', ['isopropanol'], ['diisopropyl ether', WATER], { cat: ['sulfuric acid'], T: 140 });
  J('Condensation', 'ether', ['phenol', 'methanol'], ['anisole', WATER], { cat: ['al2o3'], T: 300 });
  J('Ullmann coupling', 'ether', ['chlorobenzene', 'phenol'], ['diphenyl ether', 'hcl'], { cat: ['copper'], T: 200 });
  J('Condensation', 'ether', ['formaldehyde'], ['trioxane'], { cat: ['sulfuric acid'], T: 20 });
  J('Condensation', 'ether', ['acetaldehyde'], ['paraldehyde'], { cat: ['sulfuric acid'], T: 20 });
  J('Condensation', 'ether', ['ethanol', 'chloroethane'], ['diethyl ether', 'hcl'], { T: 60 });
  J('Hydrogenation', 'hydrogenate', ['acrolein', 'h2'], ['allyl alcohol'], { cat: ['nickel'], T: 100 });
  J('Hydrogenation', 'hydrogenate', ['salicylaldehyde', 'h2'], ['salicyl alcohol'], { cat: ['nickel'], T: 80 });
  J('Hydrogenation', 'hydrogenate', ['menthone', 'h2'], ['menthol'], { cat: ['nickel'], T: 100 });
  J('Hydrogenation', 'hydrogenate', ['camphor', 'h2'], ['borneol'], { cat: ['nickel'], T: 100 });
  J('Hydrogenation', 'hydrogenate', ['furfural', 'h2'], ['furfuryl alcohol'], { cat: ['copper'], T: 120 });
  J('Decarbonylation', 'aromatic', ['furfural'], ['furan', 'carbon monoxide'], { cat: ['nickel'], T: 300 });
  J('Dehydration', 'sugar_split', ['xylose'], ['furfural', WATER], { cat: ['sulfuric acid'], T: 150, name: 'Furfural from xylose (oat husks chemistry)' });
  J('Friedel-Crafts', 'aromatic', ['benzene', 'ethylene oxide'], ['2-phenylethanol'], { cat: ['aluminum chloride'], T: 20 });
  J('Condensation', 'aromatic', ['phenol', 'acetone'], ['bisphenol a', WATER], { cat: ['hcl'], T: 60, name: 'Bisphenol A from phenol and acetone' });
  J('Hydroxylation', 'aromatic', ['phenol', 'h2o2'], ['catechol', WATER], { cat: ['iron(iii) chloride'], T: 60 });
  J('Hydroxylation', 'aromatic', ['phenol', 'h2o2'], ['hydroquinone', WATER], { cat: ['iron(iii) chloride'], T: 60 });
  J('Hydroxylation', 'aromatic', ['phenol', 'h2o2'], ['resorcinol', WATER], { cat: ['titanium dioxide'], T: 80 });
  J('Hydroxylation', 'aromatic', ['catechol', 'h2o2'], ['pyrogallol', WATER], { cat: ['iron(iii) chloride'], T: 60 });
  J('Hydroxylation', 'aromatic', ['resorcinol', 'h2o2'], ['phloroglucinol', WATER], { cat: ['iron(iii) chloride'], T: 60 });
  J('Methylation', 'aromatic', ['phenol', 'methanol'], ['cresol (o-, m-, p-)', 'cresol', WATER], { cat: ['al2o3'], T: 300 });
  J('Methylation', 'aromatic', ['cresol', 'propylene'], ['thymol'], { cat: ['al2o3'], T: 300 });
  J('Methylation', 'aromatic', ['cresol', 'propylene'], ['carvacrol'], { cat: ['al2o3'], T: 350 });
  J('Condensation', 'org_oxidise', ['acetaldehyde', 'formaldehyde', 'naoh'], ['pentaerythritol', 'sodium formate'], { water: true, T: 40, name: 'Pentaerythritol from acetaldehyde and formaldehyde' });
  J('Condensation', 'org_oxidise', ['butanal', 'formaldehyde', 'naoh'], ['trimethylolpropane', 'sodium formate'], { water: true, T: 40 });
  J('Hydration', 'hydrate_org', ['propylene oxide', WATER], ['propylene glycol'], { T: 60, rate: { k: 0.02 } });
  // --- aldehydes, ketones, acids
  for (const [a, b] of [['1-pentanol', '2-pentanone'], ['2-butanol', 'butanone (mek)'], ['isobutanol', 'methyl isobutyl ketone'], ['cyclopentanol', 'cyclopentanone']]) void a, void b;
  J('Oxidation', 'org_oxidise', ['cyclohexane', '@o2'], ['cyclohexanone', WATER], { cat: ['cobalt'], T: 150, dH: -300 });
  J('Oxidation', 'org_oxidise', ['cyclohexanone', 'nitric acid'], ['adipic acid', 'nitrogen dioxide', WATER], { T: 60, dH: -300, name: 'Adipic acid from cyclohexanone and nitric acid (for nylon)' });
  J('Ketonisation', 'org_oxidise', ['adipic acid'], ['cyclopentanone', 'co2', WATER], { cat: ['barium hydroxide'], T: 300 });
  J('Condensation', 'org_oxidise', ['acetone'], ['methyl isobutyl ketone', WATER], { cat: ['nickel'], T: 150 });
  J('Condensation', 'org_oxidise', ['acetone', 'acetic anhydride'], ['acetylacetone', WATER], { cat: ['sulfuric acid'], T: 60 });
  J('Condensation', 'org_oxidise', ['acetone', 'formaldehyde'], ['methyl vinyl ketone', WATER], { cat: ['naoh'], T: 60 });
  J('Condensation', 'org_oxidise', ['benzaldehyde', 'acetaldehyde'], ['cinnamaldehyde', WATER], { cat: ['naoh'], T: 20, name: 'Cinnamaldehyde (cinnamon smell)' });
  J('Perkin reaction', 'org_oxidise', ['benzaldehyde', 'acetic anhydride'], ['cinnamic acid', 'acetic_acid'], { cat: ['sodium acetate'], T: 170 });
  J('Oxidation', 'org_oxidise', ['benzene', '@o2'], ['benzoquinone', WATER], { cat: ['vanadium(v) oxide'], T: 400 });
  J('Oxidation', 'org_oxidise', ['naphthalene', '@o2'], ['naphthoquinone', WATER], { cat: ['vanadium(v) oxide'], T: 300 });
  J('Oxidation', 'org_oxidise', ['anthracene', '@o2'], ['anthraquinone', WATER], { cat: ['vanadium(v) oxide'], T: 300 });
  J('Oxidation', 'org_oxidise', ['ethylbenzene', '@o2'], ['acetophenone', WATER], { cat: ['cobalt'], T: 150 });
  J('Oxidation', 'org_oxidise', ['diphenylmethane', '@o2'], ['benzophenone', WATER], { cat: ['cobalt'], T: 150 });
  J('Oxidation', 'org_oxidise', ['ethanol', '@o2'], ['diacetyl', WATER], { cat: ['copper'], T: 300 });
  J('Oxidation', 'org_oxidise', ['propylene', '@o2'], ['acrolein', WATER], { cat: ['bismuth(iii) oxide'], T: 350 });
  J('Oxidation', 'org_oxidise', ['acrolein', '@o2'], ['acrylic acid'], { cat: ['molybdenum(vi) oxide'], T: 280 });
  J('Oxidation', 'org_oxidise', ['m-xylene', '@o2'], ['isophthalic acid', WATER], { cat: ['cobalt'], T: 180 });
  J('Oxidation', 'org_oxidise', ['o-xylene', '@o2'], ['phthalic anhydride', WATER], { cat: ['vanadium(v) oxide'], T: 350 });
  J('Oxidation', 'org_oxidise', ['lactic acid', '@o2'], ['pyruvic acid', WATER], { cat: ['platinum'], T: 80 });
  J('Oxidation', 'org_oxidise', ['glucose', 'bromine', WATER], ['gluconic acid', 'hydrobromic acid'], { T: 20, rate: { k: 0.05 } });
  J('Oxidation', 'org_oxidise', ['ethylene glycol', '@o2'], ['glyoxal', WATER], { cat: ['silver'], T: 300 });
  J('Oxidation', 'org_oxidise', ['glyoxal', '@o2'], ['glycolic acid'], { cat: ['platinum'], T: 60 });
  J('Hydration', 'hydrate_org', ['maleic acid', WATER], ['malic acid'], { T: 180, rate: { k: 0.01 } });
  J('Isomerisation', 'hydrate_org', ['maleic acid'], ['fumaric acid'], { cat: ['hcl'], T: 60 });
  J('Hydrogenation', 'hydrogenate', ['maleic acid', 'h2'], ['succinic acid'], { cat: ['nickel'], T: 100 });
  J('Dehydration', 'org_oxidise', ['succinic acid'], ['succinic anhydride', WATER], { T: 200, rate: { k: 0.02 } });
  J('Chlorination', 'chlorinate', ['acetic_acid', 'chlorine gas'], ['chloroacetic acid', 'hcl'], { cat: ['acetic anhydride'], T: 100 });
  J('Chlorination', 'chlorinate', ['chloroacetic acid', 'chlorine gas'], ['trichloroacetic acid', 'hcl'], { cat: ['acetic anhydride'], T: 140 });
  J('Hydrolysis', 'chlorinate', ['chloroacetic acid', WATER], ['glycolic acid', 'hcl'], { T: 100 });
  J('Hydrolysis', 'chlorinate', ['benzal chloride', WATER], ['benzaldehyde', 'hcl'], { T: 100 });
  J('Oxidation', 'org_oxidise', ['toluene', '@o2'], ['benzaldehyde', WATER], { cat: ['manganese dioxide'], T: 100 });
  // --- acyl chlorides, anhydrides and the things they make
  for (const [acid, cl] of [['acetic_acid', 'acetyl chloride'], ['benzoic acid', 'benzoyl chloride'], ['chloroacetic acid', 'chloroacetyl chloride'], ['terephthalic acid', 'terephthaloyl chloride'], ['adipic acid', 'adipoyl chloride'], ['sebacic acid', 'sebacoyl chloride'], ['oxalic acid', 'oxalyl chloride']]) J('Acyl chloride', 'acyl', [acid, 'phosphorus trichloride'], [cl, 'phosphorous acid'], { T: 50, dH: -30, name: `${nameOf(N(cl))} from ${nameOf(res(acid)).toLowerCase()} and phosphorus trichloride` });
  for (const [anh, alc, ester] of [['phthalic anhydride', 'methanol', 'dimethyl phthalate'], ['phthalic anhydride', 'ethanol', 'diethyl phthalate'], ['phthalic anhydride', '1-butanol', 'dibutyl phthalate']]) J('Esterification', 'ester', [anh, alc], [ester, WATER], { cat: ['sulfuric acid'], T: 120 });
  J('Condensation', 'aromatic', ['phthalic anhydride', 'phenol'], ['phph', WATER], { cat: ['sulfuric acid'], T: 120, name: 'Phenolphthalein from phthalic anhydride and phenol' });
  J('Condensation', 'aromatic', ['phthalic anhydride', 'resorcinol'], ['fluorescein', WATER], { cat: ['zinc chloride'], T: 180, name: 'Fluorescein from phthalic anhydride and resorcinol (it glows green)' });
  J('Condensation', 'aromatic', ['phenol', 'formaldehyde'], ['bakelite (phenol-formaldehyde, typical)', 'bakelite', WATER], { cat: ['hcl'], T: 90 });
  for (const [acid, alc, ester] of [['malonic acid', 'ethanol', 'diethyl malonate'], ['acrylic acid', 'ethanol', 'ethyl acrylate'], ['methacrylic acid', 'methanol', 'methyl methacrylate'], ['palmitic acid', 'glycerol', 'tripalmitin'], ['oleic acid', 'glycerol', 'triolein'], ['phosphoric acid', 'methanol', 'trimethyl phosphate'], ['phosphoric acid', 'ethanol', 'triethyl phosphate'], ['phosphoric acid', '1-butanol', 'tributyl phosphate'], ['phosphoric acid', 'phenol', 'triphenyl phosphate'], ['boric acid', 'methanol', 'trimethyl borate']]) J('Esterification', 'ester', [acid, alc], [ester, WATER], { cat: ['sulfuric acid'], T: 80 });
  J('Carbonylation', 'ester', ['methanol', 'carbon monoxide', '@o2'], ['dimethyl carbonate', WATER], { cat: ['copper(i) chloride', 'copper'], T: 120 });
  J('Carbonylation', 'ester', ['ethanol', 'carbon monoxide', '@o2'], ['diethyl carbonate', WATER], { cat: ['copper(i) chloride', 'copper'], T: 120 });
  J('Addition', 'ester', ['ethylene oxide', 'co2'], ['ethylene carbonate'], { cat: ['potassium iodide'], T: 150 });
  J('Addition', 'ester', ['propylene oxide', 'co2'], ['propylene carbonate'], { cat: ['potassium iodide'], T: 150 });
  J('Condensation', 'ester', ['ethyl acetate'], ['ethyl acetoacetate', 'ethanol'], { cat: ['sodium ethoxide'], T: 80, name: 'Claisen condensation: ethyl acetoacetate' });
  J('Condensation', 'ester', ['gamma-butyrolactone', 'methylamine'], ['n-methylpyrrolidone (nmp)', 'n-methylpyrrolidone', WATER], { T: 250 });
  J('Hydrogenation', 'hydrogenate', ['levulinic acid', 'h2'], ['gamma-valerolactone', WATER], { cat: ['nickel'], T: 150 });
  J('Esterification', 'ester', ['1-octanol', 'acetic_acid'], ['octyl acetate', WATER], { cat: ['sulfuric acid'], T: 80 });
  J('Esterification', 'ester', ['glycerol', 'acetic anhydride'], ['triacetin', 'acetic_acid'], { T: 100 });
  // --- amines and nitrogen compounds
  for (const [alc, am] of [['ethanol', 'diethylamine'], ['ethanol', 'triethylamine']]) J('Catalytic amination', 'ammonia_chem', [alc, 'ammonia'], [am, WATER], { cat: ['al2o3'], T: 380 });
  J('Amination', 'ammonia_chem', ['1,2-dichloroethane', 'ammonia'], ['ethylenediamine', 'hcl'], { T: 150 });
  J('Ring opening', 'ammonia_chem', ['ethylene oxide', 'ammonia'], ['diethanolamine'], { T: 40 });
  J('Ring opening', 'ammonia_chem', ['ethylene oxide', 'ammonia'], ['triethanolamine'], { T: 50 });
  J('Dehydration', 'ammonia_chem', ['diethanolamine'], ['morpholine', WATER], { cat: ['sulfuric acid'], T: 180 });
  J('Amination', 'ammonia_chem', ['tetrahydrofuran (thf)', 'ammonia'], ['pyrrolidine', WATER], { cat: ['al2o3'], T: 300 });
  J('Amination', 'ammonia_chem', ['phenol', 'ammonia'], ['aniline', WATER], { cat: ['al2o3'], T: 400, name: 'Aniline from phenol and ammonia' });
  J('Methylation', 'ammonia_chem', ['aniline', 'methanol'], ['n,n-dimethylaniline', WATER], { cat: ['sulfuric acid'], T: 200 });
  J('Acylation', 'ammonia_chem', ['aniline', 'acetic anhydride'], ['acetanilide', 'acetic_acid'], { T: 60 });
  J('Hydrogenation', 'hydrogenate', ['pyridine', 'h2'], ['piperidine'], { cat: ['nickel'], T: 150 });
  J('Condensation', 'ammonia_chem', ['acetaldehyde', 'formaldehyde', 'ammonia'], ['pyridine', WATER, 'h2'], { cat: ['al2o3'], T: 400 });
  J('Carbonylation', 'ammonia_chem', ['dimethylamine', 'carbon monoxide'], ['dimethylformamide (dmf)', 'dimethylformamide'], { cat: ['sodium methoxide'], T: 100 });
  J('Condensation', 'ammonia_chem', ['dimethylamine', 'acetic_acid'], ['dimethylacetamide (dmac)', 'dimethylacetamide', WATER], { T: 200 });
  for (const [amide, nitrile] of [['acetamide', 'acetonitrile'], ['propionamide', 'propionitrile'], ['benzamide', 'benzonitrile']]) J('Dehydration', 'ammonia_chem', [amide, 'p4o10'], [nitrile, 'phosphoric acid'], { T: 150 });
  J('Hydration', 'ammonia_chem', ['acrylonitrile', WATER], ['acrylamide'], { cat: ['copper'], T: 80 });
  J('Amination', 'ammonia_chem', ['sodium', 'ammonia'], ['sodium amide', 'h2'], { cat: ['iron(iii) chloride'], T: 20 });
  J('Quaternisation', 'ammonia_chem', ['trimethylamine', 'ethylene oxide', 'hcl'], ['choline chloride'], { T: 40 });
  J('Ammonolysis', 'ammonia_chem', ['urea'], ['biuret', 'ammonia'], { T: 160 });
  J('Oxidation', 'aromatic', ['aniline', 'h2o2'], ['polyaniline', WATER], { cat: ['hcl'], T: 5 });
  J('Addition', 'ammonia_chem', ['potassium thiocyanate', 'ammonium chloride'], ['thiourea', 'potassium chloride'], { T: 150 });
  // --- halogen and sulfur organics, silicones
  J('Chlorination', 'chlorinate', ['tetrachloroethylene', 'chlorine gas'], ['hexachloroethane'], { T: 100 });
  J('Dehydrochlorination', 'chlorinate', ['1,1,1-trichloroethane'], ['vinylidene chloride', 'hcl'], { T: 400 });
  J('Chlorination', 'chlorinate', ['1,2-dichloroethane', 'chlorine gas'], ['trichloroethylene', 'hcl'], { T: 400 });
  J('Chlorination', 'chlorinate', ['chlorobenzene', 'chlorine gas'], ['dichlorobenzene (1,2-)', 'hcl'], { cat: ['iron(iii) chloride'], T: 40 });
  J('Haloform reaction', 'chlorinate', ['acetone', 'bromine', 'naoh'], ['bromoform', 'sodium acetate', 'sodium bromide', WATER], { water: true, T: 20 });
  J('Thiol', 'sulfur_org', ['methanol', 'hydrogen sulfide'], ['methanethiol', WATER], { cat: ['al2o3'], T: 350 });
  J('Thiol', 'sulfur_org', ['ethanol', 'hydrogen sulfide'], ['ethanethiol', WATER], { cat: ['al2o3'], T: 350 });
  J('Thiol', 'sulfur_org', ['methanol', 'hydrogen sulfide'], ['dimethyl sulfide', WATER], { cat: ['al2o3'], T: 400 });
  J('Oxidation', 'sulfur_org', ['methanethiol', '@o2'], ['dimethyl disulfide', WATER], { T: 40, rate: { k: 0.02 } });
  J('Oxidation', 'sulfur_org', ['dimethyl sulfide', '@o2'], ['dimethyl sulfoxide (dmso)', 'dimethyl sulfoxide'], { cat: ['nitrogen dioxide'], T: 60 });
  J('Ring opening', 'sulfur_org', ['ethylene oxide', 'hydrogen sulfide'], ['mercaptoethanol'], { T: 40 });
  J('Sulfonation', 'sulfur_org', ['benzene', 'sulfur trioxide'], ['benzenesulfonic acid'], { T: 40 });
  J('Sulfonation', 'sulfur_org', ['toluene', 'sulfur trioxide'], ['p-toluenesulfonic acid'], { T: 40 });
  J('Sulfonation', 'sulfur_org', ['methane', 'sulfur trioxide'], ['methanesulfonic acid'], { cat: ['sulfuric acid'], T: 50 });
  J('Sulfonation', 'sulfur_org', ['ammonia', 'sulfur trioxide'], ['sulfamic acid'], { T: 20 });
  J('Direct process', 'silicone', ['silicon', 'chloromethane'], ['dichlorodimethylsilane'], { cat: ['copper'], T: 300, name: 'Rochow process: dichlorodimethylsilane from silicon and chloromethane' });
  J('Direct process', 'silicone', ['silicon', 'chloromethane'], ['methyltrichlorosilane', 'ethane'], { cat: ['copper'], T: 320 });
  J('Direct process', 'silicone', ['silicon', 'chloromethane', 'h2'], ['trimethylsilyl chloride', 'hcl'], { cat: ['copper'], T: 320 });
  J('Hydrolysis', 'silicone', ['dichlorodimethylsilane', WATER], ['polydimethylsiloxane (silicone)', 'hcl'], { T: 20, rate: { k: 0.2 }, name: 'Silicone from dichlorodimethylsilane and water' });
  J('Hydrolysis', 'silicone', ['dichlorodimethylsilane', WATER], ['polydimethylsiloxane', 'hcl'], { T: 20, rate: { k: 0.2 } });
  J('Hydrolysis', 'silicone', ['trimethylsilyl chloride', WATER], ['hexamethyldisiloxane', 'hcl'], { T: 20, rate: { k: 0.2 } });
  J('Synthesis', 'silicone', ['silicon', 'hcl'], ['trichlorosilane', 'h2'], { T: 300 });
  J('Synthesis', 'silicone', ['silicon', 'chlorine gas'], ['silicon tetrachloride'], { T: 400 });
  J('Synthesis', 'silicone', ['silicon tetrachloride', 'chloromethane', 'sodium'], ['tetramethylsilane', 'nacl'], { T: 100 });
  J('Wurtz-Fittig', 'silicone', ['phosphorus trichloride', 'chlorobenzene', 'sodium'], ['triphenylphosphine', 'nacl'], { T: 60, name: 'Triphenylphosphine from phosphorus trichloride, chlorobenzene and sodium' });
  J('Oxidation', 'silicone', ['triphenylphosphine', 'h2o2'], ['triphenylphosphine oxide', WATER], { T: 20, rate: { k: 0.2 } });
  // --- polymers
  J('Polymerisation', 'polymer', ['ethylene', 'vinyl acetate'], ['ethylene-vinyl acetate'], { cat: ['h2o2'], T: 150 });
  J('Polymerisation', 'polymer', ['polyvinyl alcohol', 'butanal'], ['polyvinyl butyral', WATER], { cat: ['hcl'], T: 60 });
  J('Polymerisation', 'polymer', ['wood', 'acetic anhydride'], ['cellulose acetate', 'acetic_acid'], { cat: ['sulfuric acid'], T: 50, name: 'Cellulose acetate from wood fibre and acetic anhydride' });
  J('Polymerisation', 'polymer', ['caprolactone'], ['polycaprolactone'], { cat: ['tin(ii) chloride'], T: 130 });
  J('Polymerisation', 'polymer', ['bisphenol a', 'dimethyl carbonate'], ['polycarbonate', 'methanol'], { cat: ['sodium methoxide'], T: 250 });
  J('Polymerisation', 'polymer', ['ethylene glycol', 'methacrylic acid'], ['ethylene glycol dimethacrylate', WATER], { cat: ['sulfuric acid'], T: 90 });
  J('Dehydrogenation', 'aromatic', ['diethylbenzene'], ['divinylbenzene', 'h2'], { cat: ['fe2o3'], T: 600 });
  J('Friedel-Crafts', 'aromatic', ['ethylbenzene', 'ethylene'], ['diethylbenzene'], { cat: ['aluminum chloride'], T: 80 });
  J('Polymerisation', 'polymer', ['acrylonitrile', '1,3-butadiene', 'styrene'], ['acrylonitrile butadiene styrene (abs)', 'acrylonitrile butadiene styrene'], { cat: ['h2o2'], T: 60 });
  J('Polymerisation', 'polymer', ['vinylidene chloride'], ['polyvinylidene chloride'], { cat: ['h2o2'], T: 60 });
  J('Polymerisation', 'polymer', ['terephthaloyl chloride', 'p-phenylenediamine'], ['kevlar (poly-paraphenylene terephthalamide)', 'kevlar', 'hcl'], { T: 20 });
  J('Polymerisation', 'polymer', ['adipoyl chloride', 'hexamethylenediamine'], ['nylon 6,6', 'hcl'], { T: 20, name: 'The nylon rope trick: adipoyl chloride and hexamethylenediamine' });
  J('Polymerisation', 'polymer', ['sebacoyl chloride', 'hexamethylenediamine'], ['nylon 6,10', 'hcl'], { T: 20 });
  // --- inorganic: gases with alkalis, oxides, salts
  for (const p of saltList) {
    const { cat: ca, an, w } = p.ions;
    if (w || an.f !== 'OH' || solubility(p.ions) < 0.1) continue;
    const carb = salt(ca, anion('CO3')), bic = salt(ca, anion('HCO3')), sulfite = salt(ca, anion('SO3')), bisul = salt(ca, anion('HSO3')), sulf = salt(ca, anion('S')), hypo = salt(ca, anion('ClO')), cl = salt(ca, anion('Cl'));
    if (carb) J('Gas + alkali', 'gas_alkali', [p.id, 'co2'], [carb, WATER], { T: 0, rate: { k: 0.5 }, dH: -100, name: `${nameOf(p.id)} soaks up carbon dioxide: ${nameOf(carb).toLowerCase()}` });
    if (carb && bic) J('Gas + alkali', 'gas_alkali', [carb, 'co2', WATER], [bic], { T: 0, rate: { k: 0.05 }, dH: -40 });
    if (sulfite) J('Gas + alkali', 'gas_alkali', [p.id, 'so2'], [sulfite, WATER], { T: 0, rate: { k: 0.5 }, dH: -100 });
    if (sulf) J('Gas + alkali', 'gas_alkali', [p.id, 'hydrogen sulfide'], [sulf, WATER], { T: 0, rate: { k: 0.5 }, dH: -60 });
    if (hypo && cl) J('Gas + alkali', 'gas_alkali', [p.id, 'chlorine gas'], [hypo, cl, WATER], { T: 0, maxT: 40, rate: { k: 0.5 }, dH: -100, name: `${nameOf(hypo)} (bleach) from chlorine and ${nameOf(p.id).toLowerCase()}` });
  }
  J('Gas + alkali', 'gas_alkali', ['naoh', 'hydrogen sulfide'], ['sodium hydrosulfide', WATER], { T: 0, rate: { k: 0.5 } });
  J('Gas + alkali', 'gas_alkali', ['naoh', 'so2'], ['sodium bisulfite'], { T: 0, rate: { k: 0.5 } });
  J('Gas + alkali', 'gas_alkali', ['koh', 'so2'], ['potassium sulfite', WATER], { T: 0, rate: { k: 0.5 } });
  J('Thermal decomposition', 'decomp', ['sodium bisulfite'], ['sodium metabisulfite', WATER], { T: 150 });
  J('Synthesis', 'gas_alkali', ['sodium sulfite', 'sulfur'], ['sodium thiosulfate'], { water: true, T: 90 });
  J('Gas + alkali', 'gas_alkali', ['ammonia', 'co2', WATER], ['ammonium bicarbonate'], { T: 0, rate: { k: 0.3 } });
  J('Gas + alkali', 'gas_alkali', ['ammonia', 'co2', WATER], ['ammonium carbonate'], { T: 0, rate: { k: 0.3 } });
  J('Gas + alkali', 'gas_alkali', ['ammonia', 'hydrogen sulfide'], ['ammonium sulfide'], { T: 0, rate: { k: 0.3 } });
  J('Gas + alkali', 'gas_alkali', ['caco3', 'co2', WATER], ['calcium bicarbonate'], { T: 0, rate: { k: 0.01 }, name: 'Hard water: limestone dissolves in carbonated water' });
  J('Gas + alkali', 'gas_alkali', ['magnesium carbonate', 'co2', WATER], ['magnesium bicarbonate'], { T: 0, rate: { k: 0.01 } });
  J('Disproportionation', 'gas_alkali', ['iodine', 'koh'], ['potassium iodate', 'potassium iodide', WATER], { T: 60 });
  J('Disproportionation', 'gas_alkali', ['iodine', 'naoh'], ['sodium iodate', 'sodium iodide', WATER], { T: 60 });
  J('Disproportionation', 'gas_alkali', ['bromine', 'naoh'], ['sodium bromate', 'sodium bromide', WATER], { T: 70 });
  J('Disproportionation', 'gas_alkali', ['bromine', 'koh'], ['potassium bromate', 'potassium bromide', WATER], { T: 70 });
  J('Disproportionation', 'gas_alkali', ['bromine', 'naoh'], ['sodium hypobromite', 'sodium bromide', WATER], { T: 0, maxT: 20 });
  J('Oxidation', 'gas_alkali', ['iodine', 'nitric acid'], ['iodic acid', 'nitrogen dioxide', WATER], { T: 80 });
  J('Dehydration', 'gas_alkali', ['iodic acid'], ['iodine pentoxide', WATER], { T: 200 });
  J('Thermal decomposition', 'decomp', ['phosphoric acid'], ['pyrophosphoric acid', WATER], { T: 220 });
  J('Thermal decomposition', 'decomp', ['disodium phosphate'], ['sodium pyrophosphate', WATER], { T: 400 });
  J('Thermal decomposition', 'decomp', ['monosodium phosphate', 'disodium phosphate'], ['sodium tripolyphosphate', WATER], { T: 400 });
  J('Thermal decomposition', 'decomp', ['monosodium phosphate'], ['sodium hexametaphosphate', WATER], { T: 600 });
  J('Precipitation', 'precip', ['caoh2', 'phosphoric acid'], ['hydroxyapatite', WATER], { water: true, rate: { k: 2 }, name: 'Hydroxyapatite (the mineral of bones and teeth)' });
  J('Precipitation', 'precip', ['mgcl2', 'ammonium chloride', 'disodium phosphate', 'ammonium hydroxide'], ['struvite', 'nacl', WATER], { water: true, rate: { k: 2 } });
  J('Synthesis', 'synth', ['phosphorus_red', 'chlorine gas'], ['phosphorus trichloride'], { T: 60, rate: { k: 0.2 }, dH: -320 });
  J('Synthesis', 'synth', ['phosphorus trichloride', 'chlorine gas'], ['phosphorus pentachloride'], { T: 20, rate: { k: 0.2 } });
  J('Synthesis', 'synth', ['phosphorus_red', 'bromine'], ['phosphorus tribromide'], { T: 20, rate: { k: 0.2 } });
  J('Hydrolysis', 'synth', ['phosphorus trichloride', WATER], ['phosphorous acid', 'hcl'], { rate: { k: 1 } });
  J('Synthesis', 'synth', ['phosphorus_red', 'sulfur'], ['phosphorus pentasulfide'], { T: 300 });
  J('Synthesis', 'synth', ['so2', 'chlorine gas'], ['sulfuryl chloride'], { cat: ['carbon'], T: 20 });
  J('Synthesis', 'synth', ['so2', 'phosphorus pentachloride'], ['thionyl chloride', 'phosphoryl chloride'], { T: 20 });
  J('Synthesis', 'synth', ['tin', 'chlorine gas'], ['tin(iv) chloride'], { T: 100, rate: { k: 0.2 } });
  J('Synthesis', 'synth', ['gold', 'chlorine gas'], ['gold(iii) chloride'], { T: 200, rate: { k: 0.02 } });
  J('Synthesis', 'synth', ['platinum', 'chlorine gas'], ['platinum(iv) chloride'], { T: 250, rate: { k: 0.01 } });
  J('Synthesis', 'synth', ['iodine', 'chlorine gas'], ['iodine monochloride'], { T: 20, rate: { k: 0.2 } });
  J('Synthesis', 'synth', ['bromine', 'chlorine gas'], ['bromine monochloride'], { T: 20, rate: { k: 0.2 } });
  J('Synthesis', 'synth', ['nitric oxide', 'chlorine gas'], ['nitrosyl chloride'], { T: 20, rate: { k: 0.2 } });
  J('Synthesis', 'synth', ['bismuth', 'chlorine gas'], ['bismuth(iii) chloride'], { T: 200 });
  J('Redox', 'precip', ['cuso4_anh', 'potassium iodide'], ['copper(i) iodide', 'iodine', 'potassium sulfate'], { water: true, rate: { k: 2 }, name: 'Copper(II) sulfate and potassium iodide: white copper(I) iodide and brown iodine' });
  J('Synthesis', 'synth', ['copper', 'cuo'], ['copper(i) oxide'], { T: 800 });
  J('Synthesis', 'synth', ['copper', 'cucl2'], ['copper(i) chloride'], { water: true, T: 60 });
  J('Synthesis', 'synth', ['iron', WATER], ['iron(ii,iii) oxide (magnetite)', 'h2'], { T: 500, name: 'Iron and steam: magnetite and hydrogen' });
  J('Synthesis', 'synth', ['iron', WATER], ['iron_oxide_2', 'h2'], { T: 500 });
  J('Oxidation', 'oxidise', ['lead(ii) oxide (litharge)', '@o2'], ['red lead (lead tetroxide)'], { T: 450 });
  J('Oxidation', 'oxidise', ['red lead (lead tetroxide)', 'nitric acid'], ['lead(iv) oxide', 'lead(ii) nitrate', WATER], { T: 20 });
  J('Oxidation', 'oxidise', ['tin', '@o2'], ['tin(iv) oxide'], { T: 600 });
  J('Oxidation', 'oxidise', ['cobalt(ii) oxide', '@o2'], ['cobalt(ii,iii) oxide'], { T: 500 });
  J('Oxidation', 'oxidise', ['potassium dichromate', 'sulfuric acid'], ['chromium trioxide', 'potassium bisulfate', WATER], { T: 20 });
  J('Oxidation', 'oxidise', ['lithium', '@o2'], ['lithium oxide'], { T: 200, fx: [{ fx: 'flame', color: '#ff2a3a', size: 0.5 }] });
  J('Reduction', 'oxidise', ['sodium peroxide', 'sodium'], ['sodium oxide'], { T: 200 });
  J('Reduction', 'oxidise', ['potassium superoxide', 'potassium'], ['potassium oxide'], { T: 200 });
  J('Oxidation', 'oxidise', ['titanium(iv) chloride', '@o2'], ['titanium dioxide', 'chlorine gas'], { T: 900 });
  J('Oxidation', 'oxidise', ['boric acid'], ['boron trioxide', WATER], { T: 300 });
  J('Acid + salt', 'acid_make', ['sodium borate (borax)', 'hcl'], ['boric acid', 'nacl'], { water: true, rate: { k: 2 } });
  J('Acid + salt', 'acid_make', ['glass', 'hcl'], ['silicic acid', 'nacl'], { water: true, rate: { k: 2 } });
  J('Alkali + oxide', 'ceramic', ['sodium borate (borax)', 'naoh'], ['sodium metaborate', WATER], { water: true, rate: { k: 2 } });
  J('Peroxide', 'ceramic', ['sodium metaborate', 'h2o2'], ['sodium perborate', WATER], { water: true, rate: { k: 1 } });
  J('Alkali + oxide', 'ceramic', ['al2o3', 'naoh'], ['sodium aluminate', WATER], { water: true, T: 150 });
  J('Alkali + oxide', 'ceramic', ['zinc oxide', 'naoh'], ['sodium zincate', WATER], { water: true, T: 60 });
  J('Alkali + oxide', 'ceramic', ['tin(iv) oxide', 'naoh'], ['sodium stannate', WATER], { water: true, T: 100 });
  J('Roasting', 'ceramic', ['chromium(iii) oxide', 'na2co3', '@o2'], ['sodium chromate', 'co2'], { T: 1000, name: 'Roasting chromium oxide with soda: sodium chromate' });
  J('Acid + chromate', 'chromate', ['sodium dichromate', 'ammonium chloride'], ['ammonium dichromate', 'nacl'], { water: true, rate: { k: 1 } });
  J('Thermal decomposition', 'decomp', ['ammonium dichromate'], ['chromium(iii) oxide', 'nitrogen gas', WATER], { T: 180, dH: -300, fx: [{ fx: 'sparks', amount: 1 }, { fx: 'smoke', amount: 0.6, color: '#3f7a34' }], name: 'The ammonium dichromate volcano' });
  for (const [a, b, c] of [['titanium dioxide', 'barium carbonate', 'barium titanate'], ['titanium dioxide', 'strontium carbonate', 'strontium titanate'], ['titanium dioxide', 'caco3', 'calcium titanate (perovskite)'], ['titanium dioxide', 'na2co3', 'sodium titanate']]) J('Solid-state reaction', 'ceramic', [a, b], [c, 'co2'], { T: 1100 });
  for (const [a, b, c] of [['mgo', 'al2o3', 'magnesium aluminate (spinel)'], ['cobalt(ii) oxide', 'al2o3', 'cobalt aluminate (cobalt blue)'], ['zinc oxide', 'fe2o3', 'zinc ferrite'], ['cao', 'sio2', 'calcium silicate'], ['mgo', 'sio2', 'magnesium silicate'], ['mgo', 'sio2', 'olivine (forsterite)'], ['cao', 'sio2', 'portland cement (tricalcium silicate)'], ['cao', 'sio2', 'dicalcium silicate (belite)'], ['cao', 'al2o3', 'tricalcium aluminate'], ['al2o3', 'sio2', 'mullite'], ['al2o3', 'sio2', 'aluminum silicate'], ['mgo', 'al2o3', 'cordierite'], ['bismuth(iii) oxide', 'fe2o3', 'bismuth ferrite'], ['caco3', 'magnesium carbonate', 'dolomite']]) J('Solid-state reaction', 'ceramic', [a, b], [c], { T: 1200, name: `${nameOf(N(c))} from ${nameOf(res(a)).toLowerCase()} and ${nameOf(res(b)).toLowerCase()} (kiln)` });
  J('Solid-state reaction', 'ceramic', ['mgo', 'al2o3', 'sio2'], ['cordierite'], { T: 1300 });
  J('Solid-state reaction', 'ceramic', ['caco3', 'cuo', 'sio2'], ['egyptian blue', 'co2'], { T: 900, name: 'Egyptian blue: the oldest artificial pigment' });
  J('Solid-state reaction', 'ceramic', ['lithium carbonate', 'cobalt(ii,iii) oxide', '@o2'], ['lithium cobalt oxide', 'co2'], { T: 900, name: 'Battery cathode: lithium cobalt oxide' });
  J('Solid-state reaction', 'ceramic', ['lithium carbonate', 'manganese dioxide'], ['lithium manganese oxide', 'co2', O2], { T: 800 });
  J('Solid-state reaction', 'ceramic', ['zinc sulfate', 'barium sulfide'], ['lithopone'], { water: true, rate: { k: 2 } });
  J('Synthesis', 'ceramic', ['copper', 'acetic_acid', '@o2'], ['verdigris', WATER], { T: 20, rate: { k: 0.002 }, name: 'Verdigris: copper slowly greens in vinegar and air' });
  J('Synthesis', 'ceramic', ['lead', 'acetic_acid', 'co2', '@o2'], ['lead white (basic lead carbonate)', 'lead white', WATER], { T: 20, rate: { k: 0.002 } });
  J('Reduction', 'smelt', ['barium sulfate', 'carbon'], ['barium sulfide', 'carbon monoxide'], { T: 1000 });
  J('Synthesis', 'ceramic', ['sodium aluminate', 'glass', WATER], ['zeolite (sodium a)', 'zeolite', 'naoh'], { T: 90 });
  // hydrides and carbides
  J('Gas in water', 'gas_alkali', ['ammonia', WATER], ['ammonium hydroxide'], { rate: { k: 1 }, dH: -35, name: 'Ammonia dissolves in water: ammonia solution' });
  J('Gas in water', 'oxide_water', ['p4o10', WATER], ['phosphoric acid'], { rate: { k: 1 }, dH: -180 });
  J('Hydride', 'gas_synth', ['magnesium', 'h2'], ['magnesium hydride'], { T: 400 });
  J('Hydride', 'gas_synth', ['potassium', 'h2'], ['potassium hydride'], { T: 300 });
  J('Hydride', 'gas_synth', ['lithium hydride', 'aluminum chloride'], ['lithium aluminum hydride', 'lithium chloride'], { T: 20, name: 'Lithium aluminium hydride from lithium hydride and aluminium chloride' });
  J('Hydride', 'gas_synth', ['sodium hydride', 'trimethyl borate'], ['sodium borohydride', 'sodium methoxide'], { T: 250 });
  J('Silicide', 'gas_synth', ['magnesium', 'silicon'], ['magnesium silicide'], { T: 600 });
  J('Silicide', 'gas_synth', ['magnesium silicide', 'hcl'], ['silane', 'mgcl2'], { water: true, fx: [{ fx: 'sparks', amount: 0.6 }], name: 'Silane: a gas that catches fire by itself in air' });
  J('Silicide', 'gas_synth', ['calcium', 'silicon'], ['calcium silicide'], { T: 1000 });
  J('Silicide', 'gas_synth', ['iron', 'silicon'], ['iron silicide'], { T: 1200 });
  J('Carbide', 'gas_synth', ['aluminium', 'carbon'], ['aluminum carbide'], { T: 1800 });
  J('Synthesis', 'gas_synth', ['zinc', 'phosphorus_red'], ['zinc phosphide'], { T: 500 });
  J('Synthesis', 'gas_synth', ['aluminium', 'phosphorus_red'], ['aluminum phosphide'], { T: 600 });
  J('Synthesis', 'gas_synth', ['bismuth', 'sulfur'], ['bismuth(iii) sulfide'], { T: 300 });
  J('Synthesis', 'gas_synth', ['iron', 'sulfur'], ['iron disulfide (pyrite)', 'iron disulfide'], { T: 450 });
  J('Synthesis', 'gas_synth', ['lead', 'sulfur'], ['lead(ii) sulfide'], { T: 300 });
  J('Synthesis', 'gas_synth', ['carbon disulfide', 'naoh'], ['sodium trithiocarbonate'], { T: 20 });
  J('Synthesis', 'gas_synth', ['carbon monoxide', 'sulfur'], ['carbonyl sulfide'], { T: 300 });
  J('Synthesis', 'gas_synth', ['sodium', 'sulfur'], ['sodium-sulfur battery (sodium polysulfide)', 'sodium polysulfide'], { T: 300 });
  // double salts
  J('Crystallisation', 'double_salt', ['feso4', 'ammonium sulfate'], ['ammonium iron(ii) sulfate (mohr\'s salt)'], { water: true, maxT: 40 });
  J('Crystallisation', 'double_salt', ['potassium sulfate', 'aluminum sulfate'], ['potassium alum'], { water: true, maxT: 40 });
  J('Crystallisation', 'double_salt', ['potassium bisulfate'], ['potassium persulfate', 'h2'], { T: 20, rate: { k: 0.001 } });
  J('Neutralisation', 'neutral', ['koh', 'sulfuric acid'], ['potassium bisulfate', WATER], { water: true, rate: { k: 5 } });
  // natural-to-lab sugars
  J('Hydrolysis', 'sugar_split', ['starch', WATER], ['maltose'], { cat: ['yeast'], T: 40, maxT: 70, name: 'Starch to maltose (malting)' });
  J('Hydrogenation', 'hydrogenate', ['fructose', 'h2'], ['mannitol'], { cat: ['nickel'], T: 120 });
}
for (const [k, v] of Object.entries({ gas_alkali: ['Gases and alkalis', 'Acidic gases (carbon dioxide, sulfur dioxide, chlorine, hydrogen sulfide) dissolve in alkalis and become salts. Limewater turning milky with carbon dioxide is this reaction.'], silicone: ['Silicon chemistry', 'Silicon joins with chloromethane over copper, and the products turn into silicones with water: the stuff of sealants and bakeware.'], ceramic: ['Kiln chemistry', 'Oxides fused in great heat make pigments, cement, spinels and battery materials.'], sulfur_org: ['Organic sulfur', 'Sulfur takes the place of oxygen in organic molecules: thiols smell of garlic and skunk, DMSO is a famous solvent.'], acyl: ['Acyl chlorides', 'Phosphorus trichloride turns carboxylic acids into acyl chlorides, which react fast with alcohols, amines and water.'] })) discOut.push({ id: 'rx_gen_' + k, name: v[0], cat: 'Reactions', hint: 'One of the families of reactions that make the 1,700 compounds.', fact: v[1] });
for (const [k, v] of Object.entries({ contact: ['Contact process', 'Sulfur dioxide and oxygen join over hot vanadium oxide to make sulfur trioxide, the step behind almost all the world\'s sulfuric acid.'], haber: ['Haber process', 'Nitrogen from the air and hydrogen join over iron to make ammonia. Half the nitrogen in your body passed through this reaction as fertiliser.'], ostwald: ['Ostwald process', 'Ammonia burns on red-hot platinum to nitric oxide, which turns to brown nitrogen dioxide in air and then to nitric acid in water.'], gas_synth: ['Gas chemistry', 'Gases react with each other and with hot solids to make new compounds: hydrides, peroxides, nitrides, carbides.'], hydrogenate: ['Hydrogenation', 'Hydrogen adds across double bonds on a nickel catalyst. Turning liquid oil into solid fat (margarine) is the same reaction.'], syngas: ['Syngas chemistry', 'Carbon monoxide and hydrogen (syngas) are the starting point for methanol, acetic acid and much of the chemical industry.'], epoxide: ['Epoxides', 'Ethylene and oxygen on silver make ethylene oxide, a strained three-membered ring that opens easily into glycols.'], chlorinate: ['Chlorination', 'Chlorine and bromine swap in for hydrogen atoms or add across double bonds, making solvents, refrigerants and PVC.'], aromatic: ['Petrochemicals', 'Cracking, reforming and Friedel-Crafts reactions turn oil into benzene, styrene, phenol and the other building blocks of plastics.'], ammonia_chem: ['Ammonia chemistry', 'Ammonia becomes urea, amines, acrylonitrile and melamine.'] })) discOut.push({ id: 'rx_gen_' + k, name: v[0], cat: 'Reactions', hint: 'One of the families of reactions that make the 1,700 compounds.', fact: v[1] });
for (const [k, v] of Object.entries({ smelt: ['Smelting', 'Carbon pulls the oxygen out of a metal oxide, leaving the metal. Zinc, lead and tin have been made this way for thousands of years.'], halogen: ['Freeing a halogen', 'An oxidiser takes electrons from chloride, bromide or iodide ions and frees the element: green chlorine, red-brown bromine, violet iodine.'], chromate: ['Chromate and dichromate', 'Yellow chromate turns orange dichromate in acid, and back again in alkali: one of the prettiest equilibria in chemistry.'], alkoxide: ['Metals in alcohols', 'Reactive metals fizz in alcohols as they do in water, more gently, giving hydrogen and an alkoxide.'], carbide: ['Carbide and acetylene', 'Calcium carbide and water make acetylene, the gas that lit old miners\' lamps.'], double_salt: ['Double salts', 'Two salts crystallising together into one crystal, like Mohr\'s salt and alum.'], dehydrate_org: ['Dehydrating alcohols', 'Hot acid pulls water out of an alcohol, leaving a double bond: an alkene.'], hydrate_org: ['Hydrating alkenes', 'An alkene and water join over an acid catalyst to make an alcohol. Industrial ethanol is made this way.'], bromine_test: ['The bromine test', 'Orange bromine water goes colourless with an alkene, because bromine adds across the double bond.'], haloalkane: ['Haloalkanes', 'An alcohol\'s -OH group swaps for a halogen atom when it meets a hydrogen halide.'], amine: ['Making amines', 'Ammonia pushes the halogen off a haloalkane, giving an amine: an organic cousin of ammonia.'], amide: ['Making amides', 'Acids and ammonia join, losing water, to make amides like acetamide.'], ether: ['Making ethers', 'Two alcohol molecules lose one water between them to make an ether. Diethyl ether was the first surgical anaesthetic.'], weak_acid: ['Strong acid frees a weak acid', 'A strong acid hands its hydrogen to the salt of a weak acid, freeing the weak acid. This is how soap curdles in acid.'] })) discOut.push({ id: 'rx_gen_' + k, name: v[0], cat: 'Reactions', hint: 'One of the families of reactions that make the 1,700 compounds.', fact: v[1] });

// ---------- the starting chemicals (Normal Mode stockroom) and what can be reached from them ----------
// Only basics that cannot be made from anything simpler in the lab. Everything else has to be made, step by step.
const LAB = ['water', 'nahco3', 'acetic_acid', 'h2o2', 'yeast', 'sucrose', 'nacl', 'starch', 'oil', 'ethanol', 'hcl', 'naoh', 'citric', 'caco3', 'cuso4', 'alum', 'sodium', 'potassium', 'lithium', 'calcium', 'magnesium', 'iron', 'copper', 'carbon', 'aluminium', 'sulfur', 'phosphorus_red', 'mercury', 'silicon', 'gold'];
const stockIds = new Set(NEW_ELEMENTS.map((x) => x.id));
for (const n of ['bromine', 'iodine', 'hydrobromic acid', 'hydroiodic acid', 'ammonium hydroxide', 'potassium hydroxide', 'potassium permanganate', 'potassium dichromate', 'sodium thiosulfate', 'sodium sulfite', 'sodium fluoride', 'potassium thiocyanate', 'methanol', '1-propanol', 'isopropanol', '1-butanol', 'benzyl alcohol', 'isoamyl alcohol', 'cyclohexanol', 'salicylic acid', 'lactic acid', 'acetic anhydride', 'ethylene glycol', 'styrene', 'methyl methacrylate', 'vinyl acetate', 'caprolactam', 'adipic acid', 'hexamethylenediamine', 'terephthalic acid', 'hexane', 'eicosane', 'naphthalene', 'anthracene', 'titanium dioxide', 'sodium borate (borax)', 'tripalmitin', 'xylose', 'bismuth', 'pyridine', 'methacrylic acid', 'caprolactone', 'sebacic acid', 'malonic acid', 'levulinic acid', 'p-phenylenediamine']) { const id = named(n); if (id && !pool.get(id).banned) stockIds.add(id); }
const stock = [...stockIds];
// the catalyst table: things that speed reactions up without being used up
const CATALYSTS = ['vanadium(v) oxide', 'platinum', 'nickel', 'iron', 'aluminum chloride', 'iron(iii) chloride', 'iron(iii) bromide', 'silver', 'titanium(iv) chloride', 'chromium(iii) oxide', 'bismuth(iii) oxide', 'molybdenum(vi) oxide', 'al2o3', 'cobalt', 'zinc chloride', 'zinc oxide', 'manganese dioxide', 'yeast', 'sulfuric acid', 'phosphoric acid', 'potassium dichromate', 'potassium permanganate', 'copper'].map((n) => (pool.has(n) ? n : named(n))).filter((id) => id && has(id));
const reachDepth = new Map([...LAB, ...stockIds, ...CATALYSTS, 'o2', named('nitrogen gas')].filter(Boolean).map((id) => [id, 0]));
for (let round = 1; round < 12; round++) {
  let grew = false;
  for (const r of [...BASE_RX, ...RXS]) {
    const ins = r.inputs.filter((x) => x.from !== 'air').map((x) => x.id);
    if (!ins.every((id) => reachDepth.has(id) && reachDepth.get(id) < round)) continue;
    if (r.requires && !r.requires.every((x) => reachDepth.has(x.id))) continue;
    if (r.catalysts && r.rate.k < 0.001 && !r.catalysts.some((c) => reachDepth.has(c.id))) continue;
    for (const o of r.outputs) if (!reachDepth.has(o.id)) { reachDepth.set(o.id, round); grew = true; }
  }
  if (!grew) break;
}

// ---------- substances ----------
const GASES = new Set(['h2', 'o2', 'n2', 'f2', 'cl2', 'co', 'co2', 'no', 'no2', 'n2o', 'nh3', 'h2s', 'so2', 'so3x', 'ch4', 'c2h6', 'c3h8', 'c4h10', 'c2h4', 'c3h6', 'c2h2', 'hcl_g', 'he', 'ne', 'ar', 'kr', 'xe', 'rn']);
const ACID_INFO = { 'sulfuric acid': { strong: true, h: 2 }, 'hydrochloric acid': { strong: true }, 'nitric acid': { strong: true }, 'hydrobromic acid': { strong: true }, 'hydroiodic acid': { strong: true }, 'perchloric acid': { strong: true }, 'chloric acid': { strong: true }, 'phosphoric acid': { pKa: 2.15 }, 'carbonic acid': { pKa: 6.35 }, 'sulfurous acid': { pKa: 1.8 }, 'nitrous acid': { pKa: 3.3 }, 'hypochlorous acid': { pKa: 7.5 }, 'boric acid': { pKa: 9.24 }, 'formic acid': { pKa: 3.75 }, 'oxalic acid': { pKa: 1.25 }, 'lactic acid': { pKa: 3.86 }, 'benzoic acid': { pKa: 4.2 }, 'salicylic acid': { pKa: 2.97 }, 'iodic acid': { pKa: 0.8 }, 'chlorous acid': { pKa: 1.96 }, 'silicic acid': { pKa: 9.8 } };

const subsOut = [];
for (const e of out) {
  const p = pool.get(e.id) || { name: e.name, c: e.c };
  const c = e.c, nm = e.name.toLowerCase().replace(/\(.*?\)/g, '').trim();
  const M = c ? massOf(c) : null;
  const ions = p.ions;
  const isOrg = organic(e);
  let state = 's';
  const atoms = c ? Object.values(c).reduce((a, b) => a + b, 0) : 10;
  if (e.cat === 'Gases and common molecules' || /gas\b/.test(nm) || ['nitrogen gas', 'fluorine gas', 'chlorine gas', 'hydrogen gas', 'oxygen gas'].includes(nm)) state = 'g';
  else if (c && !ions && M < 50 && Object.keys(c).every((x) => ['H', 'C', 'N', 'O', 'F', 'Cl', 'S', 'B', 'He', 'Ne', 'Ar', 'Kr', 'Xe'].includes(x)) && !/\bacid\b/.test(nm)) state = 'g';
  else if (/acid$/.test(nm) && e.cat === 'Acids') state = 'l';
  else if (c && isOrg && !NO_ROUTES.has(e.cat) && e.cat !== 'Sugars and carbohydrates' && !e.notes.polymer) state = M < 58 && !c.O && !c.N ? 'g' : M < 300 && !/acid$/.test(nm) ? 'l' : 's';
  if (['bromine'].includes(nm)) state = 'l';
  if (/^(methane|ethane|propane|butane|ethene|ethylene|propene|propylene|acetylene|ethyne|formaldehyde|dimethyl ether|chloromethane|vinyl chloride|1,3-butadiene)$/.test(nm)) state = 'g';
  if (/^(stearic|palmitic|lauric|myristic|benzoic|salicylic|oxalic|citric|tartaric|malic|adipic|terephthalic|succinic|maleic|fumaric|cinnamic|glycolic) acid$/.test(nm) || /phenol$|naphthalene|anthracene|camphor|menthol|urea|caprolactam|hexamethylenediamine/.test(nm)) state = 's';
  const s = { id: e.id, name: e.name, formula: c && !e.notes.bad ? e.f : undefined, display: e.raw !== e.f ? e.raw : undefined, state, cat: CAT_MAP[e.cat] || (isOrg ? 'Organic compounds' : 'Salts'), group: e.cat };
  if (!s.formula) s.M = c ? M : 100;
  s.density = state === 'g' ? undefined : isOrg ? (state === 'l' ? 0.9 : 1.2) : ions ? 2.5 + (EL[ions.cat.metal || 'Na'].mass > 100 ? 3 : 0) : 2.2;
  s.mp = state === 's' ? (ions || !isOrg ? 600 : 120) : state === 'l' ? -40 : -150;
  s.bp = state === 'g' ? -40 : state === 'l' ? 120 : null;
  s.cp = Math.round(Math.min(400, 12 * atoms + 10));
  s.est = true; // melting and boiling points here are rough game values, not data
  s.color = colourOf(p);
  s.look = state === 's' ? (ions && !/oxide|sulfide/.test(nm) ? 'crystal' : 'powder') : undefined;
  if (state === 'l') { s.alpha = /bromine|dichromate/.test(nm) ? 0.85 : 0.3; s.visc = 1; if (isOrg) { s.misc = /ol$|acid|acetone|ethanol|methanol/.test(nm); } else s.misc = true; }
  if (ions) { s.sol = solubility(ions); if (ions.an.f === 'OH' && s.sol >= 0.1) s.base = { oh: ions.x * 0 + ions.y }; }
  else if (isOrg && state === 's') s.sol = /acid|sugar|ose$|ol$|urea/.test(nm) ? 20 : 0.01;
  if (ACID_INFO[nm]) { s.acid = ACID_INFO[nm]; s.misc = true; if (s.state === 's') s.sol = 50; }
  else if (e.cat === 'Carboxylic acids' && state !== 'g') s.acid = { pKa: 4.8 };
  if (nm === 'ammonium hydroxide') { s.base = { oh: 1 }; s.state = 'l'; s.misc = true; }
  if (ions && ['CO3', 'HCO3', 'PO4', 'S', 'SiO3'].includes(ions.an.f) && s.sol > 1) s.ph = ions.an.f === 'HCO3' ? 8.3 : 11;
  if (ions && ['Cl', 'NO3', 'SO4'].includes(ions.an.f) && ['Fe', 'Al', 'Cu', 'Zn', 'Cr'].includes(ions.cat.f)) s.ph = 4;
  const tags = [];
  if (e.banned) tags.push('toxic');
  else if (TOXIC(e.name, c)) tags.push('toxic');
  if (/nitrate|permanganate|dichromate|peroxide|chlorate|hypochlorite/.test(nm)) tags.push('oxidizer');
  if (s.acid && s.acid.strong) tags.push('corrosive');
  if (isOrg && state !== 's' && c && !c.F && !(c.Cl > 1)) tags.push('flammable');
  if (tags.length) s.tags = [...new Set(tags)];
  if (state === 'g' && tags.includes('toxic')) s.toxic = 0.004;
  s.fact = factOf(e, p, madeBy.get(e.id) || 0, reachDepth.get(e.id));
  if (e.banned) s.banned = true;
  if (NO_ROUTES.has(e.cat)) s.reference = true;
  for (const k in s) if (s[k] === undefined) delete s[k];
  subsOut.push(s);
}
// the starting reagents you can order in Normal Mode: elements, acids, alkalis, one soluble salt of each metal,
// sodium or potassium salts of each anion, and basic organic chemicals


// discoveries for each family of generated reactions
const FAMILY = {
  neutral: ['Neutralisation', 'Acid + base → salt + water. The H⁺ from the acid and the OH⁻ from the base become water; what is left is a salt.'],
  oxide_acid: ['Acid meets metal oxide', 'Metal oxides are bases: they neutralise acids to make a salt and water, usually needing warmth.'],
  carbonate_acid: ['Acid meets carbonate', 'Every carbonate fizzes in acid, giving a salt, water and carbon dioxide. Limewater turning milky is the test for that gas.'],
  metal_acid: ['Metal dissolves in acid', 'Metals above hydrogen in the reactivity series push hydrogen out of acids. The more reactive the metal, the faster it fizzes.'],
  metal_nitric: ['Nitric acid attacks copper', 'Copper and silver are too unreactive to give hydrogen, but nitric acid is an oxidiser: it dissolves them and gives off nitrogen oxide instead.'],
  precip: ['Precipitation', 'Two clear solutions swap partners, and if one new pair cannot dissolve it appears as a cloud of solid: a precipitate. Chemists use the colours to identify metal ions.'],
  synth: ['Metal meets non-metal', 'A hot metal and a non-metal join directly into a salt: the simplest way to make a compound.'],
  oxidise: ['Metal burns in air', 'Heated in air, most metals join with oxygen to make an oxide.'],
  displace: ['Displacement (more metals)', 'A more reactive metal pushes a less reactive one out of its salt. The less reactive metal coats the more reactive one.'],
  decomp: ['Thermal decomposition', 'Heat breaks carbonates into oxides and carbon dioxide, hydroxides into oxides and water, and nitrates into oxides, nitrogen dioxide and oxygen.'],
  dehydrate: ['Water of crystallisation', 'Many crystals hold water molecules in their structure. Heating drives the water out; adding water back puts it in again.'],
  hydrate: ['Crystals take up water', 'Dry salts grab water molecules back into their crystals, often changing colour and giving out heat.'],
  oxide_water: ['Oxides and water', 'Metal oxides in water make alkalis; non-metal oxides in water make acids. That is why acid rain forms from sulfur and nitrogen oxides.'],
  acid_make: ['Making an acid from its salt', 'Hot sulfuric acid drives a more volatile acid out of its salt. This is how hydrochloric and nitric acid were first made.'],
  sulfide_acid: ['Rotten eggs', 'Sulfides in acid give hydrogen sulfide, the gas that smells of rotten eggs. It is toxic, so do this in a draught.'],
  ammonia: ['Test for ammonium', 'Ammonium salts warmed with an alkali give off ammonia, which turns damp red litmus blue.'],
  catalyst: ['Another catalyst', 'Manganese dioxide splits hydrogen peroxide just as yeast does, and is not used up.'],
  ester: ['Esterification', 'An acid and an alcohol join, losing water, to make an ester. Esters smell of fruit: pear drops, bananas, pineapples.'],
  ester_split: ['Splitting an ester', 'Alkali breaks an ester back into an alcohol and the salt of the acid. With fats, this makes soap.'],
  org_oxidise: ['Oxidising alcohols', 'Primary alcohols oxidise to aldehydes and then to carboxylic acids; secondary alcohols give ketones. Wine left open turns to vinegar this way.'],
  ferment: ['Fermentation', 'Yeast turns sugar into alcohol and carbon dioxide when there is no oxygen. It is how bread rises and how drinks are brewed.'],
  sugar_split: ['Breaking down sugars', 'Acid and heat split big sugars into small ones: starch into glucose, sucrose into glucose and fructose.'],
  soap: ['Soap making', 'Oil and lye make soap and glycerol. People have made soap this way for over 4000 years.'],
  polymer: ['Polymerisation', 'Small molecules (monomers) link into long chains (polymers). Every plastic is made this way.'],
  combust: ['Combustion (organic)', 'Anything made of carbon and hydrogen burns in oxygen to carbon dioxide and water, releasing energy.'],
};
discOut.unshift(...Object.entries(FAMILY).map(([k, [name, fact]]) => ({ id: 'rx_gen_' + k, name, cat: 'Reactions', hint: 'One of the families of reactions that make the 1,700 compounds.', fact })));

writeFileSync(resolve(root, 'data/compounds.json'), '{"elements":' + JSON.stringify(NEW_ELEMENTS) + ',\n"aliases":' + JSON.stringify(aliasOf) + ',\n"substances":[\n' + subsOut.map((s) => JSON.stringify(s)).join(',\n') + '\n]}\n');
writeFileSync(resolve(root, 'data/reactions-gen.json'), '[\n' + RXS.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
writeFileSync(resolve(root, 'data/stock.json'), JSON.stringify({ reagents: stock, catalysts: CATALYSTS, discoveries: discOut }, null, 0) + '\n');
const makeable = subsOut.filter((s) => madeBy.get(s.id)).length;
console.log(`reachable from the starting chemicals: ${[...reachDepth.keys()].length} substances (new compounds: ${subsOut.filter((x) => reachDepth.has(x.id)).length}); entries ${entries.length}; already in game ${entries.length - out.length}; new substances ${subsOut.length}; reactions ${RXS.length}; makeable new substances ${makeable}; banned ${subsOut.filter((s) => s.banned).length}; reference-only ${subsOut.filter((s) => s.reference).length}; stock ${stock.length}`);
const fam = {}; for (const r of RXS) fam[r.discovery] = (fam[r.discovery] || 0) + 1; console.log(fam);
const multi = [...madeBy.values()].filter((n) => n >= 2).length; console.log('made 2+ ways:', multi);

if (process.env.REPORT) {
  const left = {};
  for (const x of subsOut) { if (x.banned || x.reference || reachDepth.has(x.id)) continue; (left[x.group] ||= []).push(x.name + (madeBy.get(x.id) ? '*' : '')); }
  for (const k in left) console.log(k, left[k].length, ':', left[k].slice(0, 40).join('; '));
}
