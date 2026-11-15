import elements from '../../data/elements.json' with { type: 'json' };

export const ELEMENTS = elements;
export const EL = Object.fromEntries(elements.map((e) => [e.sym, e]));

// "Mg(CH3COO)2" -> { Mg: 1, C: 4, H: 6, O: 4 }
export function parseFormula(f) {
  let i = 0;
  function group() {
    const out = {};
    while (i < f.length && f[i] !== ')') {
      let part;
      if (f[i] === '(') { i++; part = group(); i++; }
      else {
        const m = /^[A-Z][a-z]?/.exec(f.slice(i));
        if (!m) throw new Error('bad formula ' + f);
        i += m[0].length;
        part = { [m[0]]: 1 };
      }
      const n = /^\d+/.exec(f.slice(i));
      const k = n ? (i += n[0].length, +n[0]) : 1;
      for (const s in part) out[s] = (out[s] || 0) + part[s] * k;
    }
    return out;
  }
  return group();
}

export function molarMass(f) {
  const a = parseFormula(f);
  let m = 0;
  for (const s in a) { if (!EL[s]) throw new Error('unknown element ' + s); m += EL[s].mass * a[s]; }
  return m;
}
