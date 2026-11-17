import { SUB, stateAt } from './db.js';

// A Mixture is "what is in something": moles of each substance, one temperature, and how finely
// divided each solid is. Beakers, puddles, loose lumps and gas clouds all hold one.
// Pure data and maths: no rendering, no physics, so it can be unit-tested in Node.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const PH_COLORS = [[0, '#d3202a'], [3, '#e8582a'], [5, '#f0b030'], [6.5, '#b8cc3a'], [7, '#3fae4f'], [8.5, '#2a9a9a'], [10, '#2a5fc8'], [12, '#5a2fb0'], [14, '#4a1f8a']];
// colour maps for the other indicators: [pH, colour, how strongly it tints]
const IND = {
  cabbage: [[0, '#c8102e', 1], [2, '#e0306a', 1], [4, '#b8478f', 1], [6, '#7c4fa8', 1], [7, '#5a56b0', 1], [8, '#3f6fc4', 1], [9, '#2f8fb0', 1], [10, '#2fa070', 1], [12, '#8cb52a', 1], [14, '#e0c81a', 1]],
  phph: [[0, '#ffffff', 0], [8.1, '#ffffff', 0], [8.6, '#f05aa8', 0.6], [10, '#e8268a', 1], [13, '#e8268a', 1], [14, '#f2a0c8', 0.4]],
};
export function indicatorColor(type, pH) {
  if (type === 'universal' || !IND[type]) return [phColor(pH), 1];
  const m = IND[type];
  for (let i = 1; i < m.length; i++) if (pH <= m[i][0]) { const k = (pH - m[i - 1][0]) / (m[i][0] - m[i - 1][0]), x = hex(m[i - 1][1]), y = hex(m[i][1]); return [toHex(x.map((v, j) => v + (y[j] - v) * k)), m[i - 1][2] + (m[i][2] - m[i - 1][2]) * k]; }
  return [m[m.length - 1][1], m[m.length - 1][2]];
}
// solubility in g per 100 g of water: some solids dissolve far more when hot (that is what makes crystals grow on cooling)
export const solAt = (s, T) => (s.solHot !== undefined ? Math.max(0, s.sol + (s.solHot - s.sol) * (Math.min(100, Math.max(0, T)) - 20) / 80) : s.sol);
export function phColor(pH) {
  for (let i = 1; i < PH_COLORS.length; i++) {
    if (pH <= PH_COLORS[i][0]) {
      const [a, ca] = PH_COLORS[i - 1], [b, cb] = PH_COLORS[i], k = (pH - a) / (b - a), x = hex(ca), y = hex(cb);
      return toHex(x.map((v, j) => v + (y[j] - v) * k));
    }
  }
  return PH_COLORS[PH_COLORS.length - 1][1];
}

export const CHUNK = 0.25, POWDER = 1; // "surf": how much surface a solid offers (lump vs powder)

export class Mixture {
  constructor(T = 20) {
    this.n = {};        // id -> mol
    this.surf = {};     // id -> surface factor for solids
    this.T = T;         // degrees C
    this.extraC = 0;    // heat capacity of whatever holds the mixture (J/K)
    this.burning = {};  // reaction id -> true once a self-sustaining reaction has started
    this.xt = {};       // id -> true for a solid that came out of solution as crystals
  }
  get(id) { return this.n[id] || 0; }
  ids() { return Object.keys(this.n); }
  isEmpty() { for (const k in this.n) return false; return true; }
  heatCap() { let c = this.extraC; for (const id in this.n) c += this.n[id] * SUB[id].cp; return c; }
  addHeat(J) { const c = this.heatCap(); if (c > 0) this.T += J / c; }
  massG() { let m = 0; for (const id in this.n) m += this.n[id] * SUB[id].M; return m; }
  grams(id) { return (this.n[id] || 0) * SUB[id].M; }

  add(id, mol, T = this.T, surf) {
    if (!(mol > 0)) return;
    const s = SUB[id];
    if (!s) throw new Error('unknown substance ' + id);
    const cAdd = mol * s.cp, c = this.heatCap();
    if (c + cAdd > 0) this.T = (c * this.T + cAdd * T) / (c + cAdd);
    const old = this.n[id] || 0;
    if (surf !== undefined) this.surf[id] = old > 0 ? ((this.surf[id] ?? POWDER) * old + surf * mol) / (old + mol) : surf;
    this.n[id] = old + mol;
  }
  remove(id, mol) {
    const left = (this.n[id] || 0) - mol;
    if (left > 1e-9) this.n[id] = left; else { delete this.n[id]; delete this.surf[id]; delete this.xt[id]; }
  }
  merge(o) {
    for (const id in o.n) this.add(id, o.n[id], o.T, o.surf[id]);
    for (const k in o.burning) this.burning[k] = true;
    for (const k in o.xt) this.xt[k] = true;
  }
  surfOf(id) { return this.surf[id] ?? POWDER; }
  isChunk(id) { return SUB[id].state === 's' && this.surfOf(id) < 0.5; }

  // how much of a solid is dissolved in the water present
  dissolvedMol(id) {
    const s = SUB[id], n = this.n[id] || 0;
    if (!n || !s.sol || this.isChunk(id)) return 0;
    const waterG = this.grams('water');
    return Math.min(n, (solAt(s, this.T) / 100) * waterG / s.M);
  }

  // Sort the contents into what you would actually see: liquid layers, sediment, lumps.
  analyse() {
    const T = this.T;
    const L = { aq: 0, org: 0, metal: 0, sed: 0 };
    const col = { aq: [0, 0, 0, 0, 0], org: [0, 0, 0, 0, 0], sed: [0, 0, 0, 0, 0], metal: [0, 0, 0, 0, 0] };
    const mix = (k, hexc, w, alpha = 1) => { const c = hex(hexc), a = col[k]; a[0] += c[0] * w; a[1] += c[1] * w; a[2] += c[2] * w; a[3] += w; a[4] += alpha * w; };
    const chunks = [], melts = [];
    let cloud = 0; const inds = {};
    const crystals = [];
    for (const id in this.n) {
      const s = SUB[id], n = this.n[id], st = stateAt(s, T);
      const vol = s.density ? n * s.M / s.density / 1000 : 0; // litres
      if (st === 'g') continue;
      if (this.isChunk(id)) { chunks.push({ id, mol: n, molten: st === 'l', density: s.density }); continue; }
      if (st === 'l') {
        if (s.state === 's') { melts.push({ id, vol, density: s.density, color: s.id === 'sulfur' ? (T > 160 ? '#b8501a' : '#e0b820') : s.color }); L.org += 0; continue; }
        const k = s.phase === 'organic' ? 'org' : s.phase === 'metal' ? 'metal' : 'aq';
        L[k] += vol;
        if (s.indicator) inds[s.indicator] = (inds[s.indicator] || 0) + vol;
        else mix(k, s.color, vol * (s.tint || 1), s.alpha ?? 0.4);
        continue;
      }
      // solid powder
      const d = this.dissolvedMol(id), rest = n - d;
      if (d > 0) { L.aq += d * s.M / s.density / 1000 * 0.55; if (s.indicator) inds[s.indicator] = (inds[s.indicator] || 0) + d * s.M / s.density / 1000; else if (s.tint) mix('aq', s.color, d * s.M / 1000 * s.tint, 0.9); }
      if (rest > 1e-7 && this.xt[id] && this.n.water) { crystals.push({ id, mol: rest, vol: rest * s.M / s.density / 1000 }); continue; }
      if (rest > 1e-7) {
        const v = rest * s.M / s.density / 1000 / 0.62; // loose packing
        if (s.cloud && this.n.water) { cloud += v * s.cloud; L.sed += v * 0.35; mix('sed', s.color, v * 0.35); }
        else { L.sed += v; mix('sed', s.color, v); }
      }
    }
    const fin = (k, defC, defA) => { const a = col[k]; return a[3] > 0 ? { color: toHex([a[0] / a[3], a[1] / a[3], a[2] / a[3]]), alpha: a[4] / a[3] } : { color: defC, alpha: defA }; };
    const layers = [];
    if (L.metal > 1e-7) layers.push({ key: 'metal', vol: L.metal, density: 13.5, ...fin('metal', '#c9ccd2', 1), metal: true });
    if (L.sed > 1e-7) layers.push({ key: 'sed', vol: L.sed, density: 5, ...fin('sed', '#dddddd', 1), alpha: 1, grain: true });
    for (const m of melts) if (m.vol > 1e-7) layers.push({ key: 'melt_' + m.id, vol: m.vol, density: m.density + 0.01, color: m.color, alpha: 0.95 });
    let pH = null;
    if (L.aq > 1e-7) {
      const a = fin('aq', '#bfe3f2', 0.28);
      pH = this.pH(L.aq);
      for (const type in inds) {
        const [cHex, strength] = indicatorColor(type, pH), w = Math.min(1, inds[type] / L.aq * 250) * strength, c1 = hex(a.color), c2 = hex(cHex);
        a.color = toHex(c1.map((v, i) => v + (c2[i] - v) * w)); a.alpha = a.alpha + (0.8 - a.alpha) * w;
      }
      const cl = Math.min(1, cloud / L.aq * 25);
      if (cl > 0) { const c1 = hex(a.color); a.color = toHex(c1.map((v) => v + (248 - v) * cl * 0.85)); a.alpha = a.alpha + (0.96 - a.alpha) * cl; }
      layers.push({ key: 'aq', vol: L.aq, density: 1.0, ...a, cloud: cl });
    }
    if (L.org > 1e-7) layers.push({ key: 'org', vol: L.org, density: 0.92, ...fin('org', '#e8c44a', 0.55) });
    layers.sort((x, y) => y.density - x.density);
    let total = 0, liquid = 0;
    for (const l of layers) { total += l.vol; if (l.key !== 'sed') liquid += l.vol; }
    const top = layers.length ? layers[layers.length - 1] : null;
    for (const c of chunks) {
      // a lump floats on the densest liquid layer that is denser than it
      c.floatOn = null;
      for (const l of layers) if (l.key !== 'sed' && l.density > c.density) { c.floatOn = l.key; break; }
    }
    return { layers, chunks, total, liquid, pH, top, cloud, crystals, indicators: Object.keys(inds) };
  }

  // Simplified pH: strong bases, one weak acid family, and buffer salts.
  pH(aqVol) {
    if (!this.n.water) return null;
    const V = aqVol ?? this.analyse().layers.find((l) => l.key === 'aq')?.vol;
    if (!V) return null;
    // strong acids and bases are fully ionised; weak acids only partly; some salts lean a little either way
    let oh = 0, strong = 0, weak = 0, pKa = 4.76, salt = null;
    for (const id in this.n) {
      const s = SUB[id], amt = s.state === 's' ? this.dissolvedMol(id) : this.n[id];
      if (s.base) oh += s.base.oh * amt;
      else if (s.acid) { if (s.acid.strong) strong += amt * (s.acid.h || 1); else { weak += amt; pKa = Math.min(pKa, s.acid.pKa); } }
      else if (s.ph && amt / V > 0.005 && (salt === null || Math.abs(s.ph - 7) > Math.abs(salt - 7))) salt = s.ph;
    }
    const cs = strong / V, cb = oh / V, cw = weak / V, net = cs - cb;
    if (net > 1e-7) return Math.max(0, -Math.log10(net));
    const exOH = -net;
    if (cw > 1e-7) {
      if (exOH >= cw) { const r = exOH - cw; return r > 1e-6 ? Math.min(14, 14 + Math.log10(r)) : 8.6; }
      if (exOH > 1e-9) return Math.max(0, pKa + Math.log10(exOH / (cw - exOH)));
      const p = 0.5 * (pKa - Math.log10(cw)); return salt !== null && salt > 7 ? Math.min(7, p + 2) : p;
    }
    if (exOH > 1e-7) return Math.min(14, 14 + Math.log10(exOH));
    return salt ?? 7;
  }

  // ---- taking things out ----
  // Pour: a fraction of everything that flows (liquids, dissolved and loose powders). Lumps stay behind.
  split(frac) {
    const out = new Mixture(this.T);
    frac = Math.max(0, Math.min(1, frac));
    for (const id of this.ids()) {
      if (this.isChunk(id) || stateAt(SUB[id], this.T) === 'g') continue;
      const m = this.n[id] * frac;
      out.n[id] = m; if (this.surf[id] !== undefined) out.surf[id] = this.surf[id];
      this.remove(id, m);
    }
    for (const k in this.burning) out.burning[k] = true;
    for (const k in this.xt) out.xt[k] = true;
    return out;
  }
  pourableL() { const a = this.analyse(); return a.total; }
  takeVolume(L) { const v = this.pourableL(); return v > 0 ? this.split(Math.min(1, L / v)) : new Mixture(this.T); }
  // only the liquid part (pipette)
  takeLiquid(L) {
    const a = this.analyse(), out = new Mixture(this.T);
    if (a.liquid <= 0) return out;
    const f = Math.min(1, L / a.liquid);
    for (const id of this.ids()) {
      const s = SUB[id];
      if (this.isChunk(id)) continue;
      let m = 0;
      if (stateAt(s, this.T) === 'l' && s.state !== 's') m = this.n[id] * f;
      else if (s.state === 's') m = this.dissolvedMol(id) * f;
      if (m > 0) { out.n[id] = m; if (this.surf[id] !== undefined) out.surf[id] = this.surf[id]; this.remove(id, m); }
    }
    return out;
  }
  // only loose solids (spatula), up to `grams`
  takePowder(grams) {
    const out = new Mixture(this.T);
    let avail = 0;
    const ids = this.ids().filter((id) => SUB[id].state === 's' && !this.isChunk(id) && stateAt(SUB[id], this.T) === 's');
    for (const id of ids) avail += (this.n[id] - this.dissolvedMol(id)) * SUB[id].M;
    if (avail <= 0) return out;
    const f = Math.min(1, grams / avail);
    for (const id of ids) { const m = (this.n[id] - this.dissolvedMol(id)) * f; if (m > 0) { out.n[id] = m; out.surf[id] = this.surfOf(id); this.remove(id, m); } }
    return out;
  }
  takeChunk(id, mol) {
    const out = new Mixture(this.T), m = Math.min(mol, this.n[id] || 0);
    if (m > 0) { out.n[id] = m; out.surf[id] = this.surfOf(id); this.remove(id, m); }
    return out;
  }
  firstChunk() { for (const id in this.n) if (this.isChunk(id)) return id; return null; }

  dominant() { let best = null, bm = 0; for (const id in this.n) { const m = this.n[id] * SUB[id].M; if (m > bm) { bm = m; best = id; } } return best; }
  describe(max = 4) {
    return this.ids().map((id) => [id, this.n[id] * SUB[id].M]).sort((a, b) => b[1] - a[1]).slice(0, max)
      .map(([id, g]) => ({ id, name: SUB[id].name, g }));
  }
  toJSON() { return { n: this.n, surf: this.surf, T: this.T }; }
  static from(o) { const m = new Mixture(o.T); Object.assign(m.n, o.n); Object.assign(m.surf, o.surf || {}); return m; }
}
