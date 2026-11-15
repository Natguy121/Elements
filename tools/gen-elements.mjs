// Builds data/elements.json from the `periodic-table` npm package (ISC licence, Chris Andrejewski),
// then adds the game's own fields: starting set, unlock tier, source hint and method.
//   npm i periodic-table && node tools/gen-elements.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const pt = require(process.argv[2] || 'periodic-table');

const NAMES = { 113: 'Nihonium', 114: 'Flerovium', 115: 'Moscovium', 116: 'Livermorium', 117: 'Tennessine', 118: 'Oganesson', 112: 'Copernicium', 55: 'Caesium', 13: 'Aluminium' };
const SYMS = { 113: 'Nh', 114: 'Fl', 115: 'Mc', 116: 'Lv', 117: 'Ts', 118: 'Og', 112: 'Cn' };
const START = new Set('H He Li C N O Ne Na Mg Al Si P S Cl K Ca Fe Cu Au Hg'.split(' '));
const FLAME = { Li: '#e8203a', Na: '#ffd400', K: '#b38cff', Rb: '#c0408a', Cs: '#6a5cff', Ca: '#ff6a3a', Sr: '#ff2030', Ba: '#8fe03a', Cu: '#2fd6a8', Mg: '#ffffff', B: '#4be06a', Tl: '#3ee04a', Zn: '#7fe8d0', Sb: '#bfe0ff', Se: '#5a8cff', Te: '#4fd8c0' };
// [tier, group, hint shown on a locked square, real method in one line]
const U = {
  Ar: [1, 'A', 'A lazy gas hiding in every breath. Liquefy the air and take it apart.', 'Fractional distillation of liquid air (0.93% of air).'],
  Kr: [1, 'A', 'One part per million of the air. Run the Air Plant for a long time.', 'Fractional distillation of liquid air (about 1 ppm).'],
  Xe: [1, 'A', 'The rarest of the air gases. The longest distillation run there is.', 'Fractional distillation of liquid air (about 0.09 ppm).'],
  F: [2, 'B', 'It etches glass before you even free it. Start with fluorite, and do not use glass.', 'HF from fluorite and sulfuric acid, then electrolysis in molten potassium bifluoride.'],
  Br: [1, 'B', 'A red-brown liquid waiting in brine. A greener gas can push it out.', 'Chlorine bubbled through brine oxidises bromide.'],
  I: [1, 'B', 'Violet vapour from the sea. Try seaweed ash.', 'Chlorine through iodide solution, or from seaweed ash.'],
  At: [5, 'B', 'Too rare to see. Hit bismuth with alpha particles and be quick.', 'Cyclotron: alpha particles on bismuth, fast separation.'],
  Be: [2, 'C', 'Light, strong and hiding in a green gemstone.', 'Leach beryl, convert to the fluoride, reduce with magnesium.'],
  Rb: [2, 'C', 'A soft metal from lilac mica that melts on a warm day.', 'From lepidolite; reduce the chloride with calcium under argon.'],
  Sr: [2, 'C', 'The red in every firework. Roast celestine.', 'Roast celestine to the oxide, reduce with aluminium.'],
  Cs: [2, 'C', 'Golden metal that melts in your hand and hates water more than anything.', 'From pollucite; reduce with calcium under argon.'],
  Ba: [2, 'C', 'Heavy spar holds a metal with an apple-green flame.', 'Barite to sulfide to oxide, then reduce with aluminium.'],
  Fr: [4, 'C', 'You will never see it. Listen for it in the decay of actinium.', 'Trace decay product of actinium (half-life 22 minutes).'],
  Ra: [4, 'C', 'It glows, it heats itself, and it hides in pitchblende waste.', 'Co-precipitate with barium from uranium ore residue; fractional crystallisation.'],
  B: [2, 'D', 'Borax from the laundry aisle holds a brown powder with a green flame.', 'Borax to boric acid to boron oxide, reduce with magnesium.'],
  Ge: [2, 'D', 'A brittle semiconductor lost in zinc smelter dust.', 'Oxide from zinc-ore residue, reduced with hydrogen.'],
  As: [2, 'D', 'Heat arsenopyrite without air and smell garlic. Then do not breathe.', 'Sublime from arsenopyrite at about 615 C without air.'],
  Sb: [1, 'D', 'Roast stibnite. The metal burns blue-white.', 'Roast stibnite to the oxide, reduce with carbon.'],
  Se: [2, 'D', 'Red powder in the sludge under a copper refinery.', 'From copper anode slime: roast, leach, reduce with sulfur dioxide.'],
  Te: [2, 'D', 'Also in the anode slime. Its compounds give you garlic breath.', 'From copper anode slime.'],
  Ga: [2, 'D', 'A soft metal that melts in your hand... look in bauxite waste.', 'Electrolysis of bauxite-processing liquor.'],
  In: [2, 'D', 'So soft it cries when you bend it. Zinc smelters throw it away.', 'Electrolysis of zinc smelting residue.'],
  Sn: [1, 'D', 'Cassiterite and charcoal in a furnace. Bronze is waiting.', 'Smelt cassiterite with carbon at about 1200 C.'],
  Tl: [2, 'D', 'A heavy poison with a green flame, caught in flue dust.', 'From lead and zinc smelter flue dust.'],
  Pb: [1, 'D', 'Roast the shiny grey cubes of galena, then add carbon.', 'Roast galena to the oxide, reduce with carbon.'],
  Bi: [1, 'D', 'Cool it slowly and it grows rainbow staircases.', 'Smelt bismuthinite, or recover from lead refining.'],
  Po: [4, 'D', 'A tenth of a milligram per ton of ore. Or ask the reactor.', 'Trace in uranium ore residue, or irradiate bismuth.'],
  Rn: [4, 'D', 'Seal radium in a jar and wait for a heavy, invisible gas.', 'Collect the gas given off by radium or uranium ore.'],
  Sc: [2, 'E', 'A light silvery metal from a rare Norwegian mineral.', 'Thortveitite to the fluoride, reduce with calcium.'],
  Ti: [2, 'E', 'Rutile sand, chlorine, then molten magnesium under argon.', 'Kroll process: chlorinate rutile, reduce the chloride with magnesium.'],
  V: [2, 'E', 'One metal, four colours. Start with vanadinite.', 'Reduce vanadium pentoxide with calcium or aluminium.'],
  Cr: [2, 'E', 'Thermite is not only for iron. Try chromite.', 'Reduce chromium oxide with aluminium.'],
  Mn: [1, 'E', 'The black powder pyrolusite gives a brittle grey metal.', 'Reduce pyrolusite with aluminium or carbon.'],
  Co: [1, 'E', 'The ore that colours glass deep blue. It sticks to magnets.', 'Roast cobaltite, reduce with carbon or hydrogen.'],
  Ni: [1, 'E', 'Roast pentlandite. Green salts, magnetic metal.', 'Roast nickel ore, reduce with hydrogen or carbon.'],
  Zn: [1, 'E', 'Roast sphalerite, add carbon, and catch the metal as vapour.', 'Roast sphalerite to the oxide, reduce with carbon near 1000 C and condense.'],
  Y: [3, 'E', 'It comes off the column with the rare earths.', 'Separated from monazite or xenotime by ion exchange.'],
  Zr: [3, 'E', 'Zircon sand, treated like titanium.', 'Kroll-type process from zircon.'],
  Nb: [3, 'E', 'Coltan holds two metals that do not want to part.', 'From columbite-tantalite by fluoride solvent extraction.'],
  Mo: [2, 'E', 'A slippery grey mineral that looks like graphite. Roast it.', 'Roast molybdenite to the oxide, reduce with hydrogen.'],
  Tc: [4, 'E', 'No stable form exists. Only the reactor can make it.', 'Extract from irradiated molybdenum targets.'],
  Ru: [3, 'E', 'In the sludge left after aqua regia has eaten the platinum.', 'Selective precipitation from platinum-group residue.'],
  Rh: [3, 'E', 'A rose-coloured salt hides the most corrosion-proof metal.', 'Selective precipitation from platinum-group residue.'],
  Pd: [3, 'E', 'It drinks 900 times its own volume of hydrogen.', 'Selective precipitation from platinum-group residue.'],
  Ag: [1, 'E', 'A bright bead left in a bone-ash cup when the lead is gone.', 'Cupellation of lead-silver ore.'],
  Cd: [2, 'E', 'It boils off first when zinc is smelted.', 'Distils off during zinc smelting (boils at 767 C).'],
  Hf: [3, 'E', 'Zirconium has a twin. Separating them takes patience.', 'Solvent extraction or fractional crystallisation from zirconium.'],
  Ta: [3, 'E', 'The other half of coltan. Very dense, very stubborn.', 'From coltan by fluoride chemistry.'],
  W: [2, 'E', 'The highest melting point of any metal. Start with scheelite.', 'Tungsten oxide reduced with hydrogen, then sintered.'],
  Re: [3, 'E', 'Caught in the dust of a molybdenite roaster.', 'Recovered from molybdenite roaster dust.'],
  Os: [3, 'E', 'The densest thing there is. Its oxide smells, and you should not smell it.', 'From platinum-group residue after aqua regia.'],
  Ir: [3, 'E', 'Second densest, and almost nothing can corrode it.', 'From platinum-group residue after aqua regia.'],
  Pt: [3, 'E', 'Only aqua regia dissolves it. Then a yellow salt, then heat.', 'Dissolve platinum ore in aqua regia, precipitate with ammonium chloride, heat.'],
  Ac: [4, 'G', 'It glows blue on its own. Look down the radium chain.', 'From uranium ore decay chains, or irradiate radium.'],
  Th: [4, 'G', 'What made old gas lanterns glow white. It is in monazite waste.', 'From thorianite or monazite residue.'],
  Pa: [4, 'G', 'A trace within a trace, in uranium ore residue.', 'Trace separation from uranium ore residue.'],
  U: [4, 'G', 'A black, heavy ore called pitchblende. Its salts glow green under UV.', 'Pitchblende to yellowcake to metal.'],
  Np: [4, 'G', 'The first element past uranium. The reactor makes it.', 'Reactor irradiation of uranium, separated in the hot cell.'],
  Pu: [4, 'G', 'Made in the reactor, handled only in the hot cell.', 'Reactor irradiation of uranium, separated in the hot cell.'],
  Am: [4, 'G', 'Look up. There is some on the break room ceiling.', 'Americium-241 source from a smoke detector, opened in the hot cell.'],
  Cm: [4, 'G', 'More neutrons. Then more.', 'Successive neutron irradiation in the research reactor.'],
  Bk: [4, 'G', 'More neutrons still.', 'Successive neutron irradiation in the research reactor.'],
  Cf: [4, 'G', 'A metal that throws neutrons by itself.', 'Successive neutron irradiation in the research reactor.'],
  Es: [4, 'G', 'Only a microscopic trace, after a very long irradiation.', 'Long reactor irradiation chains.'],
  Fm: [4, 'G', 'The last element a reactor can reach.', 'Long reactor irradiation chains.'],
  Md: [5, 'G', 'A few atoms at a time, from the cyclotron.', 'Ion-beam synthesis on an actinide target.'],
  No: [5, 'G', 'A few atoms at a time, from the cyclotron.', 'Ion-beam synthesis on an actinide target.'],
  Lr: [5, 'G', 'The last actinide. Known only by its decay.', 'Ion-beam synthesis on an actinide target.'],
};
const LAN = { La: 'The first band off the column is the last element you expect.', Ce: 'Scrape it and it throws sparks.', Pr: 'Green salts.', Nd: 'The strongest magnets. Pink-violet glass.', Pm: 'Not in the sand at all. Ask the reactor.', Sm: 'A pale yellow band.', Eu: 'It glows red under ultraviolet light.', Gd: 'Magnetic on a cold day, and it eats neutrons.', Tb: 'It glows green under ultraviolet light.', Dy: 'A heavy band that comes off early.', Ho: 'One more band. Keep collecting.', Er: 'Pink salts.', Tm: 'The rarest stable one.', Yb: 'Nearly the first band off the column.', Lu: 'The densest and hardest. It comes off first.' };
for (const [s, h] of Object.entries(LAN)) U[s] = s === 'Pm' ? [4, 'F', h, 'Synthetic: separated from reactor products.'] : [3, 'F', h, 'Crack monazite sand with acid, then separate on an ion-exchange column.'];
'Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ').forEach((s, i) => { U[s] = [5, 'H', i < 5 ? 'A heavy-ion beam, an actinide target, and a detector fast enough to see milliseconds.' : 'A longer beam run. Prove it by its chain of alpha decays.', 'Heavy-ion fusion in the cyclotron, identified by its alpha-decay chain.']; });

function gridPos(z) {
  if (z === 1) return [1, 1]; if (z === 2) return [18, 1];
  if (z <= 4) return [z - 2, 2]; if (z <= 10) return [z + 8, 2];
  if (z <= 12) return [z - 10, 3]; if (z <= 18) return [z, 3];
  if (z <= 36) return [z - 18, 4]; if (z <= 54) return [z - 36, 5];
  if (z <= 56) return [z - 54, 6]; if (z <= 71) return [z - 54, 9]; if (z <= 86) return [z - 68, 6];
  if (z <= 88) return [z - 86, 7]; if (z <= 103) return [z - 86, 10]; return [z - 100, 7];
}
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const out = pt.all().map((e) => {
  const z = e.atomicNumber, sym = SYMS[z] || e.symbol;
  const mass = Array.isArray(e.atomicMass) ? e.atomicMass[0] : parseFloat(String(e.atomicMass));
  const gas = e.standardState === 'gas';
  const o = {
    z, sym, name: NAMES[z] || e.name, mass: Math.round(mass * 10000) / 10000,
    state: e.standardState || null, block: e.groupBlock, pos: gridPos(z),
    mp: num(e.meltingPoint) === null ? null : Math.round((e.meltingPoint - 273.15) * 10) / 10,
    bp: num(e.boilingPoint) === null ? null : Math.round((e.boilingPoint - 273.15) * 10) / 10,
    // g/cm3 for solids and liquids, g/L for gases
    density: num(e.density) === null ? null : gas ? Math.round(e.density * 1e6) / 1000 : e.density,
    en: num(e.electronegativity), year: e.yearDiscovered || null,
  };
  if (FLAME[sym]) o.flame = FLAME[sym];
  if (START.has(sym)) o.start = true;
  else { const u = U[sym]; if (!u) throw new Error('no unlock data for ' + sym); o.tier = u[0]; o.group = u[1]; o.hint = u[2]; o.method = u[3]; }
  return o;
});
writeFileSync(new URL('../data/elements.json', import.meta.url), JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(out.length, 'elements;', out.filter((e) => e.start).length, 'starting;', out.filter((e) => e.tier).length, 'to earn');
