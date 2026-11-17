import { SUB, RX, DISC_LIST, equationOf } from './chem/db.js';
import { ELEMENTS } from './chem/formula.js';
import { MATS, GOALS, UNLOCKS } from './story-data.js';

// The Lab Assistant: a small offline "AI" that runs entirely in the page.
// It knows only this game. Its knowledge is built from the game's own data (every reaction,
// substance, element, material and goal) plus written answers about how to play.
// To answer, it first tries to understand the question directly ("what does A and B make?",
// "how do I make X?"), working the answer out from the reaction rules. Otherwise it finds the
// closest stored question by word overlap (TF-IDF) and gives that answer.

const STOP = new Set('a an the is are am be to of in on at for and or do does did i we you it this that with what how can my me your there their its by from into as was were will would should could please tell about some any get got make makes made happen happens'.split(' '));
const norm = (s) => String(s).toLowerCase().replace(/[₀-₉]/g, (c) => '₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).replace(/[^a-z0-9+ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const stem = (w) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w.length > 5 && w.endsWith('ing') ? w.slice(0, -3) : w);
const tokens = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem);
const list = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
const lc = (s) => s.toLowerCase();

// everyday names people use for things in the game
const EXTRA_ALIASES = {
  nahco3: ['baking soda', 'bicarb', 'bicarbonate', 'sodium bicarbonate'], acetic_acid: ['vinegar', 'acetic', 'ethanoic acid'], nacl: ['salt', 'table salt', 'rock salt'],
  sucrose: ['sugar'], h2o2: ['peroxide', 'hydrogen peroxide'], water: ['h2o', 'tap water'], fe2o3: ['rust', 'hematite', 'iron ore', 'iron oxide'], caco3: ['limestone', 'marble', 'chalk', 'calcium carbonate'],
  carbon: ['charcoal', 'coal', 'graphite'], sio2: ['sand', 'quartz', 'silica'], malachite: ['copper ore', 'green rock'], cao: ['quicklime', 'lime'], caoh2: ['slaked lime', 'limewater'],
  na2co3: ['washing soda', 'soda ash'], glass: ['soda glass'], co2: ['carbon dioxide'], o2: ['oxygen'], h2: ['hydrogen'], naoh: ['caustic soda', 'lye'], hcl: ['hydrochloric acid', 'hydrochloric'],
  cuso4: ['copper sulfate', 'blue vitriol'], cabbage: ['red cabbage', 'cabbage juice'], indicator: ['universal indicator'], phph: ['phenolphthalein'], soap: ['dish soap', 'washing up liquid'],
  wood: ['stick', 'sticks', 'branch'], berries: ['elderberry', 'elderberries', 'berry'], citric: ['citric acid'], yeast: ['catalase'], cuo: ['copper oxide', 'black copper'], mgo: ['magnesium oxide'],
};

// common chemicals people ask about that the lab does not have (yet): how industry makes them
const NOT_IN_GAME = [
  [/\bsulfuric acid|sulphuric acid|h2so4\b/, 'Sulfuric acid', 'factories burn sulfur to sulfur dioxide, turn that into sulfur trioxide over a vanadium oxide catalyst (the contact process), and absorb it into acid. It is one of the most made chemicals in the world, used for fertilisers and batteries. It is very corrosive.'],
  [/\bnitric acid|hno3\b/, 'Nitric acid', 'made from ammonia, burned over a platinum catalyst and dissolved in water (the Ostwald process). Used for fertilisers and explosives.'],
  [/\bammonia|nh3\b/, 'Ammonia', 'made from nitrogen in the air and hydrogen at high pressure over an iron catalyst (the Haber process). Most of it becomes fertiliser.'],
  [/\bsteel\b/, 'Steel', 'iron with a little carbon. Iron from a blast furnace has oxygen blown through it to burn off extra carbon.'],
  [/\bbronze\b/, 'Bronze', 'copper melted together with about 10% tin. It started the Bronze Age about 5000 years ago.'],
  [/\bbrass\b/, 'Brass', 'copper melted together with zinc.'],
  [/\bplastic|polyethylene|polythene\b/, 'Plastic', 'most plastics are made from oil: small molecules like ethene are joined into long chains (polymerisation).'],
  [/\bsoap\b(?! .*(vinegar|soda|peroxide))/, 'Soap (making it)', 'fats or oils are boiled with a strong alkali (saponification). The lab has dish soap ready to use for foam.'],
  [/\bbleach\b/, 'Bleach', 'chlorine bubbled through sodium hydroxide solution makes sodium hypochlorite. Never mix bleach with acids or ammonia.'],
  [/\bdiamond\b/, 'Diamond', 'pure carbon squeezed at enormous pressure and heat deep underground, or in factory presses.'],
  [/\bgunpowder|explosive|bomb|tnt\b/, 'That', 'I do not help with explosives. In the game, sodium in water and hydrogen with a flame make safe virtual bangs.'],
];

// where each supply sits in the Normal Mode lab
const SPOT = {
  island: 'on the right-hand island bench in the middle of the lab (the kitchen chemistry)',
  cabinet: 'on the back bench, right side, with the acids, alkalis and indicators (the teaching cabinet)',
  store: 'in element storage on the west wall shelves',
};
const WHERE = {
  nahco3: 'island', acetic_acid: 'island', h2o2: 'island', yeast: 'island', indicator: 'island', soap: 'island', dye_blue: 'island', sucrose: 'island', nacl: 'island', starch: 'island', oil: 'island', ethanol: 'island', water: 'island',
  hcl: 'cabinet', naoh: 'cabinet', citric: 'cabinet', caco3: 'cabinet', cuso4: 'cabinet', alum: 'cabinet', cabbage: 'cabinet', phph: 'cabinet',
  sodium: 'store', potassium: 'store', lithium: 'store', calcium: 'store', magnesium: 'store', iron: 'store', copper: 'store', carbon: 'store', aluminium: 'store', sulfur: 'store', phosphorus_red: 'store', mercury: 'store', silicon: 'store', gold: 'store',
};

export function createAssistant() {
  // ---------- names of things ----------
  const alias = new Map(); // phrase -> substance id
  for (const id in SUB) {
    const s = SUB[id];
    for (const a of [s.name, id.replace(/_/g, ' '), s.formula, ...(EXTRA_ALIASES[id] || [])]) if (a && norm(a).length > 1) alias.set(norm(a), id);
  }
  const elBySym = new Map(ELEMENTS.map((e) => [lc(e.sym), e])), elByName = new Map(ELEMENTS.map((e) => [lc(e.name), e]));
  const subOfEl = (e) => Object.keys(SUB).find((k) => SUB[k].el === e.sym);
  // the substances named in a question, longest phrase first ("copper sulfate" before "copper")
  function findSubs(q) {
    const words = norm(q).split(' '), out = [];
    const used = new Array(words.length).fill(false);
    for (let n = 4; n >= 1; n--) for (let i = 0; i + n <= words.length; i++) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const ph = words.slice(i, i + n).join(' ');
      if (n === 1 && (STOP.has(ph) || ph.length < 2)) continue;
      const id = alias.get(ph) || (stem(ph) !== ph && alias.get(stem(ph)));
      if (id && !out.includes(id)) { out.push(id); for (let k = i; k < i + n; k++) used[k] = true; }
    }
    return out;
  }

  // ---------- describing reactions ----------
  function how(rx) {
    const c = rx.conditions || {}, steps = [];
    const ins = rx.inputs.filter((i) => i.from !== 'air').map((i) => lc(SUB[i.id].name));
    steps.push((ins.length > 1 ? 'Put ' + list(ins) + ' together' : 'Put ' + ins[0] + ' in a container') + (rx.requires ? ' with ' + list(rx.requires.map((r) => lc(SUB[r.id].name))) : '') + '.');
    if (c.minSurf) steps.push('Solids must be powdered: crush lumps with the rock pick (Story Mode) or use powders.');
    if (rx.catalysts) steps.push('It needs a catalyst: ' + list(rx.catalysts.map((k) => lc(SUB[k.id].name))) + '.');
    if (rx.inputs.some((i) => i.from === 'air')) steps.push('It needs air, so use an open container.');
    if (c.minTemp) steps.push(`Heat it above ${c.minTemp} °C${c.minTemp > 800 ? ' (in Story Mode that needs the big burner unlock)' : c.minTemp > 150 ? ': a crucible on the tripod over a lit Bunsen burner works' : ': the hot plate or a burner works'}.`);
    if (c.ignition) steps.push('It needs a spark or flame to start: a burner or the lighter.');
    if (c.maxTemp !== undefined) steps.push(`It only works below ${c.maxTemp} °C.`);
    if (c.blockedBy) steps.push('It does not happen while ' + list(c.blockedBy.map((b) => lc(SUB[b].name))) + ' is still there.');
    return steps.join(' ');
  }
  const makes = (rx) => list(rx.outputs.map((o) => lc(SUB[o.id].name)));
  const why = (rx) => { const d = DISC_LIST.find((x) => x.id === rx.discovery); return d && d.fact ? d.fact : ''; };
  const rxText = (rx) => `**${rx.name}** (${rx.kind}): ${equationOf(rx)}. It makes ${makes(rx)}. ${how(rx)} ${why(rx)}`.trim();
  const danger = (rx) => {
    const fx = (rx.effects || []).map((e) => e.fx);
    const bits = [];
    if (fx.includes('explode')) bits.push('it can explode, so use small amounts and stand back');
    if (rx.outputs.some((o) => (SUB[o.id].tags || []).includes('toxic'))) bits.push('it gives off toxic fumes, so do not stand in the cloud');
    if (rx.enthalpy_kJ < -300) bits.push('it releases a lot of heat');
    if (fx.includes('glare')) bits.push('it is blinding bright, so do not stare');
    return bits.length ? 'Careful: ' + list(bits) + '.' : 'It is fairly safe in the game, but containers can still get hot.';
  };

  // ---------- the stored questions ----------
  const KB = []; // { q, a }
  const about = {}; // substance id or element symbol -> its description
  const add = (qs, a) => { for (const q of [].concat(qs)) KB.push({ q, a }); };
  // structured answers: F['sub:id' or 'el:Sym'][intent], so the question type picks the answer
  const F = {};
  const put = (key, intent, qs, a) => { add(qs, a); (F[key] ||= {})[intent] = a; };
  // where the real world gets the starting elements that the lab cannot hand you yet
  const REAL = {
    H: 'Most hydrogen is made from natural gas, or by splitting water with electricity (electrolysis).',
    He: 'Helium is pumped out of natural gas wells. It forms underground when radioactive rocks decay, and gets trapped with the gas.',
    N: 'Nitrogen is made by cooling air until it turns liquid, then letting the parts boil off one by one (fractional distillation). Air is 78% nitrogen.',
    O: 'Oxygen comes from liquefying air and separating it (21% of air), or from splitting water by electrolysis.',
    Ne: 'Neon is separated from liquefied air, where it makes up about 0.0018%.',
    Cl: 'Chlorine is made by passing electricity through salt water (electrolysis of brine).',
  };
  function getElement(e) {
    const sid = subOfEl(e), s = sid && SUB[sid], bits = [];
    const made = sid ? RX.filter((r) => r.outputs.some((o) => o.id === sid)) : [];
    const mats = MATS.filter((m) => SUB[m.sub] && SUB[m.sub].el === e.sym);
    if (e.start) {
      if (e.state !== 'gas' && s && s.supply) bits.push(`In Normal Mode ${lc(e.name)} is on the element storage shelves (west wall of the lab).`);
      else if (e.state === 'gas') bits.push(`${e.name} is unlocked, but you cannot hold a sample yet: gas cylinders arrive with the gas-handling update.${made.length ? '' : ''}`);
      else bits.push(`${e.name} is one of the starting elements.`);
    } else bits.push(`${e.name} is locked (tier ${e.tier || '?'}). It needs equipment from a later update.`);
    if (e.start && !mats.length && e.state !== 'gas') bits.push('Story Mode: it is not found outside, so it is not available there yet.');
    if (made.length) bits.push(`You can make it: ${made.map((r) => `${r.name}. ${how(r)}`).join(' Or: ')}`);
    if (mats.length) bits.push(`In Story Mode: ${mats.map((m) => `${m.name}: ${m.where}`).join(' ')}`);
    const real = REAL[e.sym] || [e.hint, e.method && 'Method: ' + e.method].filter(Boolean).join(' ');
    if (real) bits.push(`In real life: ${real}`);
    return `**How to get ${e.name}.** ` + bits.join(' ');
  }

  for (const rx of RX) {
    const ins = rx.inputs.filter((i) => i.from !== 'air').map((i) => lc(SUB[i.id].name));
    const a = rxText(rx);
    add([`what does ${list(ins)} make`, `what happens when you mix ${list(ins)}`, ...(ins.length > 1 ? [`${ins.join(' + ')}`] : []), `how do I do ${lc(rx.name)}`, `how does ${lc(rx.name)} work`, `what is ${lc(rx.name)}`], a);
    add([`why does ${lc(rx.name)} happen`, `explain ${lc(rx.name)}`], (why(rx) || rxText(rx)) + ' ' + `Equation: ${equationOf(rx)}.`);
    add([`is ${lc(rx.name)} dangerous`, `is ${list(ins)} safe`], danger(rx));
    add([`what temperature does ${lc(rx.name)} need`, `how hot for ${lc(rx.name)}`], rx.conditions && rx.conditions.minTemp ? `${rx.name} starts above ${rx.conditions.minTemp} °C. ${how(rx)}` : `${rx.name} does not need heating${rx.conditions && rx.conditions.ignition ? ', just a flame to light it' : ''}. ${how(rx)}`);
    add([`what type of reaction is ${lc(rx.name)}`], `${rx.name} is ${/^[aeiou]/i.test(rx.kind) ? 'an' : 'a'} ${lc(rx.kind)} reaction: ${equationOf(rx)}.`);
  }
  for (const id in SUB) {
    const s = SUB[id], n = lc(s.name);
    const made = RX.filter((r) => r.outputs.some((o) => o.id === id)), used = RX.filter((r) => r.inputs.some((i) => i.id === id));
    const mat = MATS.find((m) => m.sub === id);
    const info = `**${s.name}**${s.formula ? ' (' + s.formula + ')' : ''}: ${s.fact || ''} At room temperature it is a ${s.state === 's' ? 'solid' : s.state === 'l' ? 'liquid' : 'gas'}${s.mp !== undefined && s.mp !== null ? `, melting at ${s.mp} °C` : ''}${s.bp !== undefined && s.bp !== null ? ` and boiling at ${s.bp} °C` : ''}.`;
    put('sub:' + id, 'about', [`what is ${n}`, `tell me about ${n}`, `${n}`], info); about[id] = info;
    if (s.formula) put('sub:' + id, 'formula', [`what is the formula of ${n}`, `formula for ${n}`], `${s.name} is ${s.formula}.`);
    put('sub:' + id, 'danger', [`is ${n} dangerous`, `is ${n} safe to touch`], (s.tags || []).length ? `${s.name} is tagged ${list((s.tags || []).map((t) => t.replace(/_/g, ' ')))}. ${s.handle === 'tongs' ? 'Use tongs (1): it burns bare skin.' : 'Handle it carefully.'}` : `${s.name} is not hazardous in the game.`);
    put('sub:' + id, 'react', [`what reacts with ${n}`, `what can I mix with ${n}`, `what can I do with ${n}`], used.length ? `${s.name} is used in: ${used.map((r) => r.name + ' (with ' + list([...r.inputs.filter((i) => i.id !== id && i.from !== 'air').map((i) => lc(SUB[i.id].name)), ...(r.inputs.some((i) => i.from === 'air') ? ['air'] : [])]) + ')').join('; ')}.` : `Nothing in the game reacts with ${n} yet, but it can still dissolve, melt or boil.`);
    // reactions that need the thing itself to start are not a way to get it
    const realMade = made.filter((r) => !r.inputs.some((i) => (SUB[i.id].name.toLowerCase().includes(n) || n.includes(SUB[i.id].name.toLowerCase())) && i.id !== id) || r.inputs.some((i) => i.id === id));
    const loop = made.filter((r) => !realMade.includes(r));
    const getIt = [`**How to get ${n}${(EXTRA_ALIASES[id] || [])[0] && !n.includes(EXTRA_ALIASES[id][0]) ? ' (' + EXTRA_ALIASES[id][0] + ')' : ''}.**`,
      id === 'water' ? 'Normal Mode: turn on the cold tap at the sink (F), or use the distilled water bottle on the island bench.' : WHERE[id] ? `Normal Mode: it is ${SPOT[WHERE[id]]}.` : s.supply ? 'Normal Mode: it is on the lab shelves.' : '',
      mat ? `Story Mode: ${mat.where}${/kitchen/i.test(mat.how) ? '' : ' (' + lc(mat.how) + ').'}` : WHERE[id] || s.supply ? `Story Mode: it cannot be found outside, so it is not available there yet.` : '',
      realMade.length && id !== 'water' ? `${WHERE[id] || mat ? 'You can also make it' : 'Make it'}: ${realMade.slice(0, 2).map((r) => `${r.name}. ${how(r)}`).join(' Or: ')}${realMade.length > 2 ? ` (and ${realMade.length - 2} more ways)` : ''}` : '',
      loop.length ? `(${loop.map((r) => r.name).join(', ')} only turns another form of ${n} back into ${n}, so you need some to start with.)` : '',
      !made.length && !s.supply && !mat ? 'It cannot be made in the game yet.' : ''].filter(Boolean).join(' ');
    put('sub:' + id, 'get', [`how do I make ${n}`, `how to get ${n}`, `where does ${n} come from`, `where do I find ${n}`], getIt);
    put('sub:' + id, 'dissolve', [`does ${n} dissolve in water`, `is ${n} soluble`], s.sol ? `Yes: about ${s.sol} g dissolves in 100 g of water at 20 °C${s.solHot !== undefined ? `, and ${s.solHot} g when hot, so it crystallises as it cools` : ''}.` : s.state === 's' ? `No, ${n} does not dissolve in water.` : `${s.name} is a ${s.state === 'l' ? 'liquid' : 'gas'}.`);
  }
  for (const e of ELEMENTS) {
    const n = lc(e.name), sid = subOfEl(e);
    const basics = `**${e.name}** (${e.sym}) is element number ${e.z}, a ${e.block} with an atomic mass of ${e.mass} u. It is a ${e.state || 'solid'} at room temperature${e.mp !== null && e.mp !== undefined ? `, melts at ${e.mp} °C` : ''}${e.bp !== null && e.bp !== undefined ? ` and boils at ${e.bp} °C` : ''}. Known since: ${e.year || 'unknown'}.`;
    about[e.sym] = basics + (sid && SUB[sid].fact ? ' ' + SUB[sid].fact : '');
    put('el:' + e.sym, 'about', [`what is ${n}`, `tell me about ${n}`, `${lc(e.sym)} element`], about[e.sym]);
    put('el:' + e.sym, 'formula', [`what is the symbol for ${n}`, `what element is ${lc(e.sym)}`], `${e.name} has the symbol ${e.sym}.`);
    put('el:' + e.sym, 'number', [`atomic number of ${n}`, `what number is ${n}`], `${e.name} is number ${e.z} on the periodic table.`);
    put('el:' + e.sym, 'temp', [`melting point of ${n}`, `when does ${n} melt`], e.mp !== null && e.mp !== undefined ? `${e.name} melts at ${e.mp} °C${e.bp ? ' and boils at ' + e.bp + ' °C' : ''}.` : `The melting point of ${e.name} is not known well.`);
    put('el:' + e.sym, 'get', [`how do I get ${n}`, `how do I unlock ${n}`, `where is ${n}`, `how do I make ${n}`, `where does ${n} come from`], getElement(e));
    if (sid) for (const k of ['react', 'danger', 'dissolve']) if (F['sub:' + sid] && F['sub:' + sid][k]) F['el:' + e.sym][k] = F['sub:' + sid][k];
  }
  for (const d of DISC_LIST) {
    const n = lc(d.name);
    add([`how do I discover ${n}`, `how do I get ${n} discovery`], `${d.name}: ${d.hint || 'Experiment and see.'}${d.fact ? ' ' + d.fact : ''}`);
    add([`what is ${n} observation`], `${d.name} (${d.cat}). ${d.fact || d.hint || ''}`);
  }
  for (const m of MATS) {
    const n = lc(m.name);
    add([`where do I find ${n}`, `where is ${n} in story mode`, `how do I collect ${n}`], `${m.name}: ${m.where} How: ${m.how}. ${m.desc}`);
    add([`what is ${n} used for`], `${m.name}: ${m.desc}`);
  }
  for (const g of GOALS) add([`how do I ${lc(g.t)}`, `goal ${lc(g.t)}`], `${g.t}: ${g.d}`);
  for (const u of UNLOCKS) add([`how do I get the ${lc(u.t)}`, `what do the ${lc(u.t)} do`, `when do I unlock ${lc(u.t)}`], `${u.t} unlock at ${u.at} discoveries in Story Mode. ${u.d}`);
  // how to play
  const HELP = [
    [['how do I pick things up', 'how do I grab', 'how to carry'], 'Hold the left mouse button on an object to carry it, and let go to drop it. Swing while letting go to throw. On touch, tap to pick up and tap again to drop.'],
    [['how do I pour', 'how to pour liquid'], 'Hold a container and hold the right mouse button. It tips to the side; the liquid lands where you are looking.'],
    [['how do I set things down', 'how do I place gently'], 'Press X to set what you hold down gently.'],
    [['how do I rotate', 'how to turn an object'], 'Hold R and move the mouse to rotate what you are holding. The mouse wheel pushes and pulls it.'],
    [['how do I use tongs', 'what are tongs for'], 'Press 1 for tongs. Use them for reactive metals like sodium and for hot things. With tongs on a jar you take one piece out.'],
    [['how do I use the spatula', 'how to scoop powder'], 'Press 2 for the spatula. Left click scoops powder from a jar or pile, right click tips it out.'],
    [['how do I use the pipette', 'how to add drops'], 'Press 3 for the pipette. Left click draws up liquid, right click squeezes out drops: good for indicators and titrations.'],
    [['how do I measure temperature', 'how to use the thermometer'], 'Press 4 for the thermometer and look at a container. In Student mode temperatures show anyway.'],
    [['how do I put out a fire', 'how to use the extinguisher', 'fire extinguisher'], 'Press 5 for the CO₂ extinguisher and hold the right button at the fire. It does not work on burning metals: those need sand.'],
    [['how do I turn on the burner', 'how to light the bunsen burner', 'how to heat things'], 'Look at a Bunsen burner and press F. Put a crucible or beaker on the tripod above it. The hot plate (F) is gentler.'],
    [['how do I turn on the water', 'where is the tap'], 'Look at the cold tap by the sink and press F. In Story Mode the lab water is off: fetch water from the kitchen tap, the stream or the lake.'],
    [['how do I restock', 'I ran out of chemicals', 'how to reset the lab'], 'Pull the yellow Restock lever on the west wall (F), or use Restock in the pause menu. In Story Mode only glassware restocks.'],
    [['how do I open the discovery book', 'where are my discoveries'], 'Press Tab for the Discovery Book, P for the periodic table and N for the notebook.'],
    [['how do I speed up time', 'reaction is too slow', 'fast forward'], 'Press Z to speed up chemistry and heat ×4, then ×16. Press again to go back.'],
    [['how do I see the guide', 'experiment guide', 'help me start'], 'In Student mode press H for a step-by-step experiment guide. In Story Mode H shows your goals.'],
    [['what is student mode', 'what is discovery mode', 'difference between student and discovery'], 'Student mode shows pH and temperature readouts, hints and a guide. Discovery mode has no helpers: you test pH with an indicator and measure with the thermometer.'],
    [['what is story mode', 'how does story mode work'], 'In Story Mode you start at home, walk to the lab and gather materials outside: sticks, ores, sand, water, berries. Carry them back, store them in the storage room and experiment to unlock gloves, goggles and a bigger burner.'],
    [['what is normal mode'], 'Normal Mode is the free sandbox: the whole lab stocked, everything unlocked.'],
    [['how do I play multiplayer', 'how to play with friends', 'how do I join a game', 'how do I host'], 'On the title screen press Host game to get a 5-letter code. Friends type the code and press Join, then everyone plays in the host\'s world.'],
    [['how do I use the rock pick', 'how to break rocks', 'how to crush'], 'In Story Mode press 6 for the rock pick. Strike coloured rock outcrops to break off samples, or strike a loose lump (or a container of lumps) to crush it to powder.'],
    [['how do I dig', 'how to use the trowel', 'how to get sand'], 'In Story Mode press 7 for the trowel and dig on sandy ground: the lake beach and the stream banks. Right click tips it into a jar.'],
    [['how do I get water in story mode', 'where is water'], 'Hold a container and press F at the kitchen tap, or at the stream or lake. Dipping a container in the water fills it too.'],
    [['where is the storage room', 'how do I store things', 'how to save samples'], 'Through the door on the east wall of the lab. Drop samples into the labelled jars. What is in them is saved.'],
    [['how do I sleep', 'how do I regrow the forest', 'how to restock the kitchen'], 'Go home and press F on your bed. The forest regrows and the kitchen is restocked.'],
    [['how do I heal', 'I am hurt', 'low health'], 'Stand by the green first-aid station on the lab\'s south wall. In Story Mode sleeping also heals you.'],
    [['why did I get burned', 'it burned my hand'], 'Hot things look like cold things. Anything over about 75 °C burns bare hands; use tongs or wait. Sodium and potassium burn skin too.'],
    [['why did it explode', 'explosion'], 'Large pieces of sodium or potassium in water, hydrogen near a flame, and some powders burning can explode. Use small amounts.'],
    [['how do I test ph', 'is it an acid or a base', 'how to use indicator'], 'Add a few drops of universal indicator (pipette, 3): red/orange is acidic, green neutral, blue/purple alkaline. Red cabbage juice and crushed elderberries also work.'],
    [['how do I grow crystals', 'crystallisation'], 'Dissolve lots of copper sulfate or alum in hot water on the hot plate, then cool it on the chiller plate. Press Z to speed it up.'],
    [['how do I do a titration', 'titration'], 'Put acid in a flask with phenolphthalein, then add sodium hydroxide drop by drop with the pipette until it turns pink.'],
    [['what is a catalyst'], 'A catalyst speeds up a reaction without being used up. Yeast is the catalyst in elephant toothpaste.'],
    [['what is an acid'], 'An acid gives up hydrogen ions in water. It has a pH below 7, tastes sour and reacts with carbonates and many metals.'],
    [['what is a base', 'what is an alkali'], 'A base neutralises acids. Bases that dissolve are alkalis, with a pH above 7, like sodium hydroxide.'],
    [['what is ph'], 'pH measures how acidic or alkaline a solution is, from 0 (very acidic) through 7 (neutral) to 14 (very alkaline).'],
    [['what is a mole', 'what is mol'], 'A mole is a count of particles: 6.02 × 10²³ of them. The game measures amounts in moles so reactions balance exactly.'],
    [['what is neutralisation'], 'Acid + base → salt + water. The pH moves towards 7.'],
    [['what is combustion', 'what burns'], 'Burning is a fast reaction with oxygen that releases heat and light. In the game, wood, charcoal, sulfur, magnesium, aluminium powder, red phosphorus, ethanol and hydrogen burn.'],
    [['what is oxidation'], 'Oxidation is when a substance combines with oxygen or loses electrons, like iron rusting or copper turning black when heated.'],
    [['what is smelting', 'how do I get metal from ore'], 'Smelting gets metal out of an ore. Powdered ore heated with powdered charcoal: the carbon takes the oxygen away. Copper ore (malachite) needs about 560 °C; iron ore needs about 900 °C (the big burner).'],
    [['what is thermal decomposition'], 'A substance breaking apart when heated, like baking soda giving off carbon dioxide or limestone turning into quicklime.'],
    [['what is a displacement reaction'], 'A more reactive metal pushes a less reactive one out of a solution, like iron in copper sulfate becoming coated in copper.'],
    [['who made you', 'what are you', 'are you an ai'], 'I am the Lab Assistant: a small offline helper built into Reaction Lab. I know this game\'s chemistry, materials and controls, and I work without the internet.'],
    [['hello', 'hi', 'hey'], 'Hi! Ask me what two things make, how to make something, where to find a material, or how to use a tool.'],
    [['thanks', 'thank you'], 'Any time. Happy experimenting!'],
    [['what should I try', 'give me an idea', 'i am bored'], 'Try baking soda and vinegar with dish soap, elephant toothpaste with yeast, burning a magnesium ribbon (tongs!), or a copper-plated nail in copper sulfate.'],
    [['is this real chemistry', 'can I do this at home'], 'The reactions follow real chemistry, but everything is simplified for the game. It is not a guide to real procedures: do real experiments only with a teacher.'],
  ];
  for (const [qs, a] of HELP) add(qs, a);

  // ---------- the index: TF-IDF over the stored questions ----------
  const df = new Map();
  const docs = KB.map((k) => { const t = tokens(k.q); for (const w of new Set(t)) df.set(w, (df.get(w) || 0) + 1); return t; });
  const N = docs.length, idf = (w) => Math.log(1 + N / (df.get(w) || 0.5));
  const vecs = docs.map((t) => { const v = new Map(); for (const w of t) v.set(w, (v.get(w) || 0) + idf(w)); let n = 0; for (const x of v.values()) n += x * x; return { v, n: Math.sqrt(n) || 1 }; });
  function search(q, k = 3) {
    const t = tokens(q);
    if (!t.length) return [];
    const qv = new Map(); for (const w of t) qv.set(w, (qv.get(w) || 0) + idf(w));
    let qn = 0; for (const x of qv.values()) qn += x * x; qn = Math.sqrt(qn) || 1;
    const scored = [];
    vecs.forEach((d, i) => { let s = 0; for (const [w, x] of qv) { const y = d.v.get(w); if (y) s += x * y; } if (s > 0) scored.push([s / (qn * d.n), i]); });
    scored.sort((a, b) => b[0] - a[0]);
    const out = [], seen = new Set();
    for (const [s, i] of scored) { if (seen.has(KB[i].a)) continue; seen.add(KB[i].a); out.push({ score: s, q: KB[i].q, a: KB[i].a }); if (out.length >= k) break; }
    return out;
  }

  // ---------- understanding a question ----------
  function ask(raw) {
    const q = norm(raw);
    if (!q) return { a: 'Ask me anything about the lab: what two things make, how to make something, where to find a material...' };
    for (const [re, name, real] of NOT_IN_GAME) if (re.test(q) && !findSubs(q.replace(re, ' ')).length) return { a: `**${name}** is not in the game yet, so you cannot make it in the lab. In the real world: ${real}`, related: ['what can I make', 'how do I make glass'] };
    const subs = findSubs(q);
    // one thing asked about: work out what kind of question it is, then answer exactly that
    const words = q.split(' ');
    const elHit = words.map((w) => elByName.get(w) || (w.length <= 2 && !STOP.has(w) && w !== 'i' && elBySym.get(w))).find(Boolean);
    let key = null;
    if (subs.length === 1) { const s = SUB[subs[0]]; key = s.el ? 'el:' + s.el : 'sub:' + subs[0]; }
    else if (!subs.length && elHit) key = 'el:' + elHit.sym;
    const intent = /\b(dangerous|danger|safe|toxic|hurt|harm|explode|poison)/.test(q) ? 'danger'
      : /\b(dissolve|soluble|solubility)/.test(q) ? 'dissolve'
      : /\b(formula|symbol)\b/.test(q) ? 'formula'
      : /\b(atomic number|what number|proton)/.test(q) ? 'number'
      : /\b(melt|melting|boil|boiling)\b/.test(q) ? 'temp'
      : /\b(react|reacts|mix|combine|do with|use .* for|used for)\b/.test(q) ? 'react'
      : /\b(get|find|obtain|unlock|collect|make|produce|create|extract|buy|where|source|comes? from)\b/.test(q) ? 'get'
      : /^(what|whats|tell|describe|info|explain|who)\b/.test(q) || words.length <= 2 ? 'about' : null;
    if (key && intent && (subs.length <= 1) && F[key] && F[key][intent]) {
      const name = key.startsWith('el:') ? lc(ELEMENTS.find((e) => 'el:' + e.sym === key).name) : lc(SUB[subs[0]].name);
      const more = ['get', 'react', 'danger', 'about'].filter((k) => k !== intent && F[key][k]).map((k) => ({ get: `how do I get ${name}`, react: `what reacts with ${name}`, danger: `is ${name} dangerous`, about: `what is ${name}` }[k]));
      return { a: F[key][intent], related: more.slice(0, 2) };
    }
    // "what is X?" about one thing: describe it
    if (subs.length === 1 && /^(what is|whats|what s|what are|tell me about|describe|info on|explain)\b/.test(q) && q.split(' ').length <= 6) {
      const s = SUB[subs[0]], e = s.el && ELEMENTS.find((x) => x.sym === s.el);
      return { a: about[e ? e.sym : subs[0]], related: [`what reacts with ${lc(s.name)}`, `how do I get ${lc(s.name)}`] };
    }
    const wantsMix = /\b(mix|mixing|mixed|combine|add|adding|react|reacts|and|with|plus|\+|together|make|makes|happens|happen)\b/.test(q);
    const wantsHow = /\b(how|make|get|produce|create|obtain)\b/.test(q) && /\b(make|get|produce|create|obtain)\b/.test(q);
    // two or more things: what do they make together?
    if (subs.length >= 2 && wantsMix) {
      const hits = RX.filter((r) => subs.filter((id) => r.inputs.some((i) => i.id === id) || (r.requires || []).some((x) => x.id === id) || (r.catalysts || []).some((x) => x.id === id)).length >= 2);
      const names = list(subs.map((id) => lc(SUB[id].name)));
      if (hits.length) return { a: hits.slice(0, 3).map(rxText).join('\n\n'), via: 'worked out from the reaction rules' };
      return { a: `As far as the lab knows, ${names} do not react with each other. ${subs.map((id) => { const s = SUB[id]; return s.sol ? `${s.name} dissolves in water.` : ''; }).join(' ')} Try heating them, or check what each one reacts with.`.replace(/\s+/g, ' ').trim(), via: 'worked out from the reaction rules' };
    }
    // how do I make X?
    if (subs.length === 1 && wantsHow && !/\b(react|mix)\b/.test(q)) {
      const id = subs[0], made = RX.filter((r) => r.outputs.some((o) => o.id === id));
      const mat = MATS.find((m) => m.sub === id);
      if (made.length) return { a: `To make ${lc(SUB[id].name)}:\n\n` + made.map(rxText).join('\n\n') + (mat ? `\n\nOr find it in Story Mode: ${mat.where}` : ''), via: 'worked out from the reaction rules' };
    }
    // one thing with a mixing word: what does it react with?
    if (subs.length === 1 && /\b(react|mix|combine|with)\b/.test(q)) {
      const id = subs[0], used = RX.filter((r) => r.inputs.some((i) => i.id === id));
      if (used.length) return { a: `${SUB[id].name} reacts in:\n\n` + used.slice(0, 4).map(rxText).join('\n\n'), via: 'worked out from the reaction rules' };
    }
    const hits = search(q, 3);
    const mk = q.match(/^(?:how (?:do|can|would|could) (?:i|we|you) |how to )(?:make|get|create|produce) (?:a |an |some )?(.+)$/);
    if (mk && !subs.length && !(hits[0] && hits[0].score > 0.6)) return { a: `I do not know "${mk[1]}" in this game, so there is no way to make it here yet. Things you can make include copper, iron, glass, quicklime, rust, washing soda, caramel and hydrogen. Ask "how do I make glass" for steps.`, related: ['how do I make copper', 'what can I make'] };
    if (hits.length && hits[0].score > 0.32) return { a: hits[0].a, related: hits.slice(1).filter((h) => h.score > 0.25).map((h) => h.q) };
    if (subs.length === 1) { const s = SUB[subs[0]]; return { a: `**${s.name}**${s.formula ? ' (' + s.formula + ')' : ''}: ${s.fact || ''}`, related: [`what reacts with ${lc(s.name)}`, `how do I make ${lc(s.name)}`] }; }
    const el = q.split(' ').map((w) => elByName.get(w) || (w.length <= 2 && !STOP.has(w) && w !== 'i' && w !== 'a' && elBySym.get(w))).find(Boolean);
    if (el) return ask('what is ' + el.name);
    if (hits.length && hits[0].score > 0.15) return { a: 'I am not sure I understood. The closest thing I know:\n\n' + hits[0].a, related: hits.slice(1).map((h) => h.q) };
    return { a: 'I do not know that one. I only know this game: its reactions, substances, elements, materials and controls. Try "what does baking soda and vinegar make", "how do I make copper" or "where do I find sulfur".' };
  }
  const SUGGEST = ['what does baking soda and vinegar make', 'how do I make copper', 'where do I find sulfur', 'how do I make glass', 'what reacts with sodium', 'how do I test pH', 'how do I grow crystals', 'what is a catalyst'];
  return { ask, search, count: KB.length, suggestions: SUGGEST };
}
