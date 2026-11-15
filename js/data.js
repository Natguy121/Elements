// Element table + all the game writing. Adding an element = adding one entry to CONTENT.

export const SYMBOLS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg ' +
  'Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' ');

export const NAMES = ('Hydrogen Helium Lithium Beryllium Boron Carbon Nitrogen Oxygen Fluorine Neon Sodium Magnesium Aluminium Silicon ' +
  'Phosphorus Sulfur Chlorine Argon Potassium Calcium Scandium Titanium Vanadium Chromium Manganese Iron Cobalt Nickel Copper Zinc ' +
  'Gallium Germanium Arsenic Selenium Bromine Krypton Rubidium Strontium Yttrium Zirconium Niobium Molybdenum Technetium Ruthenium ' +
  'Rhodium Palladium Silver Cadmium Indium Tin Antimony Tellurium Iodine Xenon Caesium Barium Lanthanum Cerium Praseodymium Neodymium ' +
  'Promethium Samarium Europium Gadolinium Terbium Dysprosium Holmium Erbium Thulium Ytterbium Lutetium Hafnium Tantalum Tungsten ' +
  'Rhenium Osmium Iridium Platinum Gold Mercury Thallium Lead Bismuth Polonium Astatine Radon Francium Radium Actinium Thorium ' +
  'Protactinium Uranium Neptunium Plutonium Americium Curium Berkelium Californium Einsteinium Fermium Mendelevium Nobelium ' +
  'Lawrencium Rutherfordium Dubnium Seaborgium Bohrium Hassium Meitnerium Darmstadtium Roentgenium Copernicium Nihonium Flerovium ' +
  'Moscovium Livermorium Tennessine Oganesson').split(' ');

// [column, row] in an 18-wide table; rows 9 and 10 are the lanthanides / actinides.
export function gridPos(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [18, 1];
  if (z <= 4) return [z - 2, 2];
  if (z <= 10) return [z + 8, 2];
  if (z <= 12) return [z - 10, 3];
  if (z <= 18) return [z, 3];
  if (z <= 36) return [z - 18, 4];
  if (z <= 54) return [z - 36, 5];
  if (z <= 56) return [z - 54, 6];
  if (z <= 71) return [z - 54, 9];
  if (z <= 86) return [z - 68, 6];
  if (z <= 88) return [z - 86, 7];
  if (z <= 103) return [z - 86, 10];
  return [z - 100, 7];
}

export const STATIONS = [
  { id: 'balloon', name: 'Balloon' },
  { id: 'burner', name: 'Burner' },
  { id: 'zap', name: 'Zapper' },
  { id: 'water', name: 'Tank' },
  { id: 'mic', name: 'Mic' },
  { id: 'mix', name: 'Mixer' },
];

export const CAT_COLORS = {
  nonmetal: '#7fd6ff', noble: '#d59bff', alkali: '#ff8d6b', alkaline: '#ffc46b',
  metalloid: '#7fe3b0', halogen: '#f5ee6a', metal: '#b9c7d6',
};

const TASK = {
  balloon: ['Fill a balloon with it', 'Stuff it in a balloon'],
  burner: ['Introduce it to fire', 'Hold it in the flame'],
  zap: ['Zap it with high voltage', 'See if it conducts'],
  water: ['Bubble it through water', 'Drop it in the tank'],
  mic: ['Inhale some and speak', 'Lick it (please do not)'],
};

// form: gas | solid.  color: paint / sample / balloon colour.  r: reaction per station.
export const CONTENT = {
  1: {
    cat: 'nonmetal', form: 'gas', color: '#e23d3d',
    tag: 'Contains 75% of the universe. Handle accordingly.',
    intro: 'Hydrogen. One proton, one electron, zero chill. Let\'s poke it.',
    tasks: ['balloon', 'burner', 'zap'],
    r: {
      balloon: { fx: 'float', text: 'Lightest thing in existence. It left before you finished tying the knot.' },
      burner: { fx: 'boom', text: 'That was the Hindenburg speedrun. Your eyebrows have been filed under "missing".' },
      zap: { fx: 'glow', color: '#ff4fa0', text: 'Pink! Hydrogen glows like a flamingo at a rave.' },
      water: { fx: 'bubbles', text: 'It bubbles straight out. Hydrogen is literally IN water and still wants nothing to do with it.' },
      mic: { pitch: 1.6, text: 'Squeaky AND flammable. Please do not speak near the burner.' },
    },
  },
  2: {
    cat: 'noble', form: 'gas', color: '#b7773c',
    tag: 'Do not inhale. (You are going to inhale it.)',
    intro: 'Helium. Second lightest, first funniest. It refuses to react with anything, including criticism.',
    tasks: ['balloon', 'mic', 'burner'],
    taskNames: { burner: 'Try to set it on fire' },
    r: {
      balloon: { fx: 'float', text: 'Up it goes. Party gas, reporting for duty.' },
      burner: { fx: 'none', text: 'Nothing. Helium is a noble gas. It does not "do" reactions. It has people for that.' },
      zap: { fx: 'glow', color: '#ffb46a', text: 'A classy peach glow. Even its plasma is smug.' },
      water: { fx: 'bubbles', text: 'The bubbles rise, unbothered. Helium will not dissolve, on principle.' },
      mic: { pitch: 2.3, text: 'You sound like a chipmunk giving a keynote. Science has peaked.' },
    },
  },
  3: {
    cat: 'alkali', form: 'solid', color: '#c9ccd1', metal: true, oil: true,
    tag: 'Softest metal. Emotionally and physically.',
    intro: 'Lithium. A metal so soft you could cut it with a butter knife and so light it floats. It lives in oil because it has trust issues with air.',
    tasks: ['water', 'burner', 'zap'],
    r: {
      balloon: { fx: 'rock', text: 'You put a rock in a balloon. The balloon is now a paperweight.' },
      burner: { fx: 'tint', color: '#ff1f3d', text: 'Crimson flame! That exact red is in every firework finale.' },
      zap: { fx: 'spark', text: 'It conducts! You have invented a worse battery. Your phone uses the better one.' },
      water: { fx: 'fizz', text: 'It floats AND fizzes. A metal with the personality of a bath bomb.' },
      mic: { lick: true, text: 'You licked it. You feel oddly calm. Please stop licking the elements.' },
    },
  },
  4: {
    cat: 'alkaline', form: 'solid', color: '#8d9399', metal: true,
    tag: 'Light, strong, toxic. The whole package.',
    intro: 'Beryllium. Lighter than aluminium, stiffer than steel, and absolutely not a snack.',
    tasks: ['water', 'burner', 'zap'],
    taskNames: { burner: 'Try to melt it' },
    r: {
      balloon: { fx: 'rock', text: 'Thud. Light for a metal is still heavy for a balloon.' },
      burner: { fx: 'none', text: 'It just sits there. It melts at 1287 °C. Your burner is a hair dryer to this thing.' },
      zap: { fx: 'spark', text: 'Conducts nicely. It is also see-through to X-rays, so it has nothing to hide.' },
      water: { fx: 'sink', text: 'Plop. No reaction. Beryllium does not get out of bed for water.' },
      mic: { lick: true, text: 'DO NOT. It tastes sweet, and that is the last nice thing it will ever do for you.' },
    },
  },
  5: {
    cat: 'metalloid', form: 'solid', color: '#3a2f2a',
    tag: 'Not boring. It is boron. Totally different.',
    intro: 'Boron. Not quite a metal, not quite not. The "it\'s complicated" of the periodic table.',
    tasks: ['burner', 'zap', 'balloon'],
    taskNames: { balloon: 'Put it in a balloon (trust me)' },
    r: {
      balloon: { fx: 'rock', text: 'Exactly as aerodynamic as it looks. The floor has filed a complaint.' },
      burner: { fx: 'tint', color: '#3dff5c', text: 'Green flame! Boron is why movie witches have such good lighting.' },
      zap: { fx: 'none', text: 'Barely a tingle. Boron is a metalloid. It conducts only when it feels like it.' },
      water: { fx: 'sink', text: 'It sinks, then sulks.' },
      mic: { lick: true, text: 'Tastes like laundry day. That is the borax talking. Stop licking things.' },
    },
  },
  6: {
    cat: 'nonmetal', form: 'solid', color: '#1c1c1e',
    tag: 'Some assembly required: pencil, diamond, or you.',
    intro: 'Carbon. You are about 18% this. So is your pencil. Try not to make it awkward.',
    tasks: ['burner', 'zap', 'water'],
    taskNames: { burner: 'Heat it up' },
    r: {
      balloon: { fx: 'rock', text: 'A lump of coal in a balloon. Worst birthday ever.' },
      burner: { fx: 'ember', text: 'It glows like a barbecue. With enough pressure it would be a diamond. You are not enough pressure.' },
      zap: { fx: 'spark', text: 'Graphite conducts. Your pencil has been a wire this whole time.' },
      water: { fx: 'sink', text: 'It sinks. Somewhere, a water filter nods with respect.' },
      mic: { lick: true, text: 'Tastes like a pencil. You know this because you were once seven.' },
    },
  },
  7: {
    cat: 'nonmetal', form: 'gas', color: '#2f6fd6',
    tag: '78% of every breath. You are soaking in it.',
    intro: 'Nitrogen. Most of the air, none of the credit.',
    tasks: ['balloon', 'burner', 'zap'],
    r: {
      balloon: { fx: 'hover', text: 'It just... hovers. It is basically air. You have built a balloon full of normal.' },
      burner: { fx: 'out', text: 'The flame went out. Nitrogen is the fun police.' },
      zap: { fx: 'glow', color: '#b05cff', text: 'Purple lightning in a tube. Nitrogen finally shows some personality.' },
      water: { fx: 'bubbles', text: 'Bubbles. Scuba divers get these in their blood if they surface too fast. Rise slowly, friend.' },
      mic: { pitch: 1.03, text: 'You sound exactly the same. Deeply disappointing.' },
    },
  },
  8: {
    cat: 'nonmetal', form: 'gas', color: '#e8eef2',
    tag: 'You have been on the free trial since birth.',
    intro: 'Oxygen. You have been using this your whole life without reading the terms and conditions.',
    tasks: ['burner', 'balloon', 'water'],
    taskNames: { burner: 'Feed it to the flame' },
    r: {
      balloon: { fx: 'sink', text: 'It sinks. Oxygen is heavier than air and, frankly, it is carrying the whole planet.' },
      burner: { fx: 'roar', text: 'WHOA. Fire loves oxygen. Most toxic relationship in chemistry.' },
      zap: { fx: 'glow', color: '#a9d6ff', text: 'A ghostly blue-white. This is also how ozone is made, a.k.a. that thunderstorm smell.' },
      water: { fx: 'bubbles', text: 'The fish in this tank would be thrilled. There are no fish. There is a duck.' },
      mic: { pitch: 0.94, text: 'You feel fantastic. Suspiciously fantastic.' },
    },
  },
  9: {
    cat: 'halogen', form: 'gas', color: '#d9d24a',
    tag: 'Reacts with everything. Including this box.',
    intro: 'Fluorine. The most reactive element there is. It has beef with every atom it has ever met.',
    tasks: ['balloon', 'water', 'burner'],
    r: {
      balloon: { fx: 'eaten', text: 'The fluorine ate the balloon. It is not a gas, it is a grudge.' },
      burner: { fx: 'inferno', text: 'Everything is on fire. Fluorine can ignite water, sand and your hopes.' },
      zap: { fx: 'glow', color: '#eaff7a', smoke: true, text: 'The tube is glowing and also dissolving. We are calling that a pass.' },
      water: { fx: 'steam', text: 'The water is... burning? Fluorine does not follow rules. It replaces them.' },
      mic: { refuse: true, text: 'NO. The microphone has fainted in protest.' },
    },
  },
  10: {
    cat: 'noble', form: 'gas', color: '#ff5a2b',
    tag: 'Open 24 hours.',
    intro: 'Neon. Famous for exactly one thing and, to be fair, it is very good at it.',
    tasks: ['zap', 'balloon', 'burner'],
    taskNames: { zap: 'Light it up' },
    r: {
      balloon: { fx: 'float', slow: true, text: 'It floats. Lazily. Lighter than air but in no hurry about it.' },
      burner: { fx: 'none', text: 'Nothing. Another noble gas, another refusal to participate.' },
      zap: { fx: 'glow', color: '#ff3d14', text: 'THE classic. Every "OPEN" sign and questionable motel owes this glow.' },
      water: { fx: 'bubbles', text: 'Fancy bubbles. They are exactly as useful as regular bubbles.' },
      mic: { pitch: 1.3, text: 'Slightly squeaky. Budget helium.' },
    },
  },
  11: {
    cat: 'alkali', form: 'solid', color: '#d3d6da', metal: true, oil: true,
    tag: 'Keep dry. KEEP. DRY.',
    intro: 'Sodium. Half of table salt, all of the drama. It ships in oil for reasons you are about to discover.',
    tasks: ['water', 'burner', 'zap'],
    r: {
      balloon: { fx: 'rock', text: 'Down it goes. At least it stayed dry.' },
      burner: { fx: 'tint', color: '#ffb020', text: 'Blazing yellow. Every old street lamp on Earth is this colour because of sodium.' },
      zap: { fx: 'spark', text: 'Conducts beautifully. It would make great wire if it did not explode in the rain.' },
      water: { fx: 'boom', text: 'And THAT is why it ships in oil. The duck has briefly achieved orbit.' },
      mic: { lick: true, text: 'Salty? No. That is sodium CHLORIDE. This one just detonates on your tongue.' },
    },
  },
  12: {
    cat: 'alkaline', form: 'solid', color: '#c2c5c9', metal: true,
    tag: 'Burns bright. No, brighter than that.',
    intro: 'Magnesium. Sits quietly in your vitamins until someone shows it a flame.',
    tasks: ['burner', 'zap', 'water'],
    r: {
      balloon: { fx: 'rock', text: 'Clonk. Magnesium is light, but not "balloon" light.' },
      burner: { fx: 'white', text: 'MY EYES. Magnesium was the original camera flash, and now it is your whole field of vision.' },
      zap: { fx: 'spark', text: 'Conducts well. Nobody is surprised. It is a metal.' },
      water: { fx: 'sink', bubbles: true, text: 'A few lazy bubbles. Magnesium reacts with water the way you reply to emails.' },
      mic: { lick: true, text: 'Tastes like vitamins and regret.' },
    },
  },
  13: {
    cat: 'metal', form: 'solid', color: '#d0d4d8', metal: true,
    tag: 'Once worth more than gold. Now wraps your sandwich.',
    intro: 'Aluminium. Emperors once ate off it to show off. You threw some away at lunch.',
    tasks: ['zap', 'water', 'mic'],
    taskNames: { mic: 'Bite it like foil' },
    r: {
      balloon: { fx: 'rock', text: 'Crunch. That is the sound of a balloon learning about density.' },
      burner: { fx: 'none', text: 'It just gets warm. Aluminium grows invisible oxide armour in nanoseconds.' },
      zap: { fx: 'spark', text: 'Superb conductor. Most power lines are made of this stuff.' },
      water: { fx: 'sink', text: 'It sinks, perfectly safe behind its oxide layer. Smug.' },
      mic: { lick: true, text: 'You bit the foil. Every filling you own just screamed.' },
    },
  },
  14: {
    cat: 'metalloid', form: 'solid', color: '#56616e', metal: true,
    tag: 'Sand with a computer science degree.',
    intro: 'Silicon. It is a beach, a window and the brain of the device you are holding.',
    tasks: ['zap', 'burner', 'balloon'],
    r: {
      balloon: { fx: 'rock', text: 'You have made a very small, very sad sandbag.' },
      burner: { fx: 'none', text: 'Nope. Melts at 1414 °C. Your flame is adorable.' },
      zap: { fx: 'spark', text: 'It conducts... sometimes. That "sometimes" runs every computer on Earth.' },
      water: { fx: 'sink', text: 'It is a fancy rock. It sinks like one.' },
      mic: { lick: true, text: 'Crunchy. You are eating a future microchip.' },
    },
  },
  15: {
    cat: 'nonmetal', form: 'solid', color: '#e9e2b8', waxy: true,
    tag: 'Discovered by a man boiling his own pee. True story.',
    intro: 'Phosphorus. Found in 1669 by an alchemist boiling down buckets of urine hoping for gold. He got something that glows instead.',
    tasks: ['water', 'burner', 'zap'],
    r: {
      balloon: { fx: 'rock', text: 'The balloon is smoking slightly. That is not a feature.' },
      burner: { fx: 'roar', smoke: true, text: 'It caught fire before it even reached the flame. Overachiever.' },
      zap: { fx: 'none', text: 'No conduction. It is too busy plotting.' },
      water: { fx: 'glowsink', text: 'It sits underwater and glows. This is its happy place. Leave it there.' },
      mic: { lick: true, text: 'NO LICKING. This one is not a bit. This one is in matches and worse.' },
    },
  },
  16: {
    cat: 'nonmetal', form: 'solid', color: '#f0d21c',
    tag: 'Smells fine. Its friends smell terrible.',
    intro: 'Sulfur. Bright yellow, totally odourless on its own, and blamed for everything.',
    tasks: ['burner', 'zap', 'water'],
    r: {
      balloon: { fx: 'rock', text: 'A yellow rock in a balloon. Art.' },
      burner: { fx: 'tint', color: '#3a5cff', text: 'An eerie blue flame, and a smell that will follow you home.' },
      zap: { fx: 'none', text: 'Zero conduction. Sulfur is the world\'s smelliest insulator.' },
      water: { fx: 'sink', text: 'It sinks and does not dissolve. It is just visiting.' },
      mic: { lick: true, text: 'Tastes like a struck match. Rotten eggs are next in line.' },
    },
  },
  17: {
    cat: 'halogen', form: 'gas', color: '#9bd13a',
    tag: 'The smell of public pools and poor decisions.',
    intro: 'Chlorine. Keeps pools clean and was banned from warfare. It contains multitudes.',
    tasks: ['balloon', 'water', 'zap'],
    r: {
      balloon: { fx: 'sink', text: 'Sinks like a stone. Chlorine is heavy, green and up to no good.' },
      burner: { fx: 'tint', color: '#7dff5a', text: 'The flame turns a sickly green and looks worried.' },
      zap: { fx: 'glow', color: '#b9ff7a', text: 'A pale green glow. Spooky, but pool-safe.' },
      water: { fx: 'bubbles', text: 'Congratulations, you made pool water. No running.' },
      mic: { refuse: true, text: 'No. The Geneva Protocol has opinions about this. So does the microphone.' },
    },
  },
  18: {
    cat: 'noble', form: 'gas', color: '#7a5bd1',
    tag: 'The name literally means "lazy".',
    intro: 'Argon. Greek for "lazy". Nearly 1% of the air, and it has never once helped.',
    tasks: ['zap', 'burner', 'mic'],
    r: {
      balloon: { fx: 'sink', text: 'It sinks. Committed to the bit.' },
      burner: { fx: 'out', text: 'Flame out. Welders use argon to stop fire getting ideas.' },
      zap: { fx: 'glow', color: '#b98cff', text: 'A lovely lilac. Lazy, but pretty.' },
      water: { fx: 'bubbles', text: 'Bubbles, delivered with minimum effort.' },
      mic: { pitch: 0.72, text: 'Your voice drops. Argon is heavy, so you get the movie-villain voice.' },
    },
  },
};

const CRYO = [
  'At −253 °C hydrogen finally turns liquid. Your nitrogen only reaches −196. It stays a gas and stays smug.',
  'Helium needs −269 °C to turn liquid, the coldest of anything. Liquid nitrogen is a warm bath to it.',
  'It is now a very cold soft metal. Still soft. Still has trust issues.',
  'Cold beryllium. Just as toxic, now with frostbite.',
  'Frosty boron. It did not notice.',
  'Cold carbon. It does not care. It has been through worse inside stars.',
  'You dipped nitrogen in nitrogen. It condensed into more of the same. Peak efficiency.',
  'Oxygen turns into a pale blue liquid at −183 °C, and that liquid is magnetic. Really.',
  'Fluorine becomes a yellow liquid at −188 °C. It is still angry, just slower.',
  'Neon holds out until −246 °C. It stays a gas and keeps glowing about it.',
  'Cold sodium. For once it is not exploding. Enjoy the quiet.',
  'Frozen magnesium. Still waiting for someone to bring a flame.',
  'Aluminium gets stronger when it is cold. That is why rockets use it for fuel tanks.',
  'Chilled silicon. Computer chips love this. Some people do it to theirs for fun.',
  'Cold slows phosphorus down. It has stopped smoking. Do not trust it.',
  'Frozen sulfur goes brittle and snaps like chalk.',
  'Chlorine turns into a yellow-green liquid at −34 °C. It was the first gas anyone ever liquefied.',
  'Argon liquefies at −186 °C, so it actually condensed. The laziest element did something.',
];
CRYO.forEach((text, i) => { CONTENT[i + 1].r.cryo = { text }; });

export const MAX_PLAYABLE = 18;

export function taskName(z, station) {
  const c = CONTENT[z];
  return (c.taskNames && c.taskNames[station]) || TASK[station][c.form === 'gas' ? 0 : 1];
}

const NOBLE = new Set(['He', 'Ne', 'Ar']);

// key: the two symbols sorted alphabetically, joined with '+'
export const MIXES = {
  'H+O': { name: 'Water', formula: 'H₂O', fx: 'boom', color: '#6cc3ff', text: 'One spark later: water. You just did, with an explosion, what a tap does quietly.' },
  'H+N': { name: 'Ammonia', formula: 'NH₃', fx: 'stink', color: '#cfe8a0', text: 'Ammonia. Feeds half the planet as fertiliser. Smells like a cat\'s revenge.' },
  'C+H': { name: 'Methane', formula: 'CH₄', fx: 'stink', color: '#d8d0a0', text: 'Methane. Natural gas, swamp gas, and what cows contribute to the conversation.' },
  'F+H': { name: 'Hydrofluoric acid', formula: 'HF', fx: 'smoke', color: '#e6f0b0', text: 'It dissolves glass. The flask would like to speak to a manager.' },
  'Cl+H': { name: 'Hydrochloric acid', formula: 'HCl', fx: 'fizz', color: '#d7f0c0', text: 'Stomach acid. You are carrying about a cup of this right now.' },
  'H+S': { name: 'Hydrogen sulfide', formula: 'H₂S', fx: 'stink', color: '#c9c040', text: 'Rotten eggs. The whole lab now smells like a regret.' },
  'H+Li': { name: 'Lithium hydride', formula: 'LiH', fx: 'crystal', color: '#e8e8e8', text: 'A grey powder that hoards hydrogen. Astronauts have used it to make gas on demand.' },
  'Cl+Na': { name: 'Table salt', formula: 'NaCl', fx: 'crystal', color: '#ffffff', text: 'An exploding metal plus a poison gas equals... fries seasoning. Chemistry is unhinged.' },
  'C+O': { name: 'Carbon dioxide', formula: 'CO₂', fx: 'fizz', color: '#d0e8f0', text: 'Fizzy-drink bubbles. Also what you are exhaling at me right now.' },
  'N+O': { name: 'Laughing gas', formula: 'N₂O', fx: 'laugh', color: '#ffc0e0', text: 'Nitrous oxide. Ha. Haha. HAHAHA. Okay, why is that funny.' },
  'O+Si': { name: 'Silica', formula: 'SiO₂', fx: 'crystal', color: '#f0ead8', text: 'Sand. Also glass. Also this flask. You have made more flask.' },
  'Al+O': { name: 'Alumina', formula: 'Al₂O₃', fx: 'crystal', color: '#ffd0d8', text: 'Add a pinch of chromium and this is a ruby. You are welcome.' },
  'Mg+O': { name: 'Magnesium oxide', formula: 'MgO', fx: 'glow', color: '#ffffff', text: 'A blinding flash, then white powder. Old-timey photographers would applaud.' },
  'Li+O': { name: 'Lithium oxide', formula: 'Li₂O', fx: 'crystal', color: '#f4f4f4', text: 'A white crust. Lithium does this the moment it meets air, which is why it sulks in oil.' },
  'C+Si': { name: 'Silicon carbide', formula: 'SiC', fx: 'crystal', color: '#3a4048', text: 'Nearly as hard as diamond. It is the grit on your sandpaper.' },
  'B+N': { name: 'Boron nitride', formula: 'BN', fx: 'crystal', color: '#f8f8f8', text: 'White graphite. Slipperier than your excuses.' },
  'C+N': { name: 'Cyanogen', formula: '(CN)₂', fx: 'smoke', color: '#b0c0d0', text: 'That is cyanide\'s family. NOPE. The fume hood handled it. Let us never speak of this.' },
  'O+S': { name: 'Sulfur dioxide', formula: 'SO₂', fx: 'stink', color: '#e0d890', text: 'The smell of volcanoes, struck matches and acid rain.' },
  'O+P': { name: 'Phosphorus pentoxide', formula: 'P₄O₁₀', fx: 'smoke', color: '#ffffff', text: 'Thick white smoke. Very dramatic. Very not for breathing.' },
  'F+Na': { name: 'Sodium fluoride', formula: 'NaF', fx: 'crystal', color: '#e8fff8', text: 'It is in your toothpaste. Two terrors team up to protect your smile.' },
  'Cl+N': { name: 'Nitrogen trichloride', formula: 'NCl₃', fx: 'boom', color: '#e8e060', text: 'It explodes if you look at it wrong. You looked at it wrong.' },
  'H+P': { name: 'Phosphine', formula: 'PH₃', fx: 'stink', color: '#c8d8a0', text: 'Rotting fish with a hint of garlic. Possibly what ghost lights in swamps are made of.' },
  'H+Si': { name: 'Silane', formula: 'SiH₄', fx: 'boom', color: '#d0d8e0', text: 'Silane catches fire the instant it touches air. The lab is full of air.' },
  'B+H': { name: 'Diborane', formula: 'B₂H₆', fx: 'glow', color: '#7dff8a', text: 'Tried as rocket fuel in the 1950s. Burned bright green. Clogged every engine.' },
  'Cl+Mg': { name: 'Magnesium chloride', formula: 'MgCl₂', fx: 'crystal', color: '#f4f4ee', text: 'Sets tofu and de-ices roads. A real overachiever.' },
  'Al+Cl': { name: 'Aluminium chloride', formula: 'AlCl₃', fx: 'smoke', color: '#f0f0d0', text: 'Fumes like mad. Its cousin is in your antiperspirant. You are welcome, everyone near you.' },
  'F+Li': { name: 'Lithium fluoride', formula: 'LiF', fx: 'crystal', color: '#f0f8ff', text: 'The most reactive metal-ish thing meets the most reactive gas and they form... a calm crystal. Couples therapy works.' },
  'N+Na': { name: 'Sodium azide', formula: 'NaN₃', fx: 'boom', color: '#ffffff', text: 'The stuff that inflates airbags. BANG. You are now very safe.' },
  'Li+N': { name: 'Lithium nitride', formula: 'Li₃N', fx: 'crystal', color: '#b0303a', text: 'Lithium is the only alkali metal that bothers reacting with nitrogen. Ruby-red result. Fancy.' },
  'F+O': { name: 'Oxygen difluoride', formula: 'OF₂', fx: 'boom', color: '#fff0a0', text: 'You combined the two most aggressive elements you own. What did you think would happen?' },
  'C+S': { name: 'Carbon disulfide', formula: 'CS₂', fx: 'stink', color: '#e0e0b0', text: 'Smells like rotting radishes and catches fire from a warm pipe. Lovely.' },
  'Al+Si': { name: 'Silumin', formula: 'Al–Si alloy', fx: 'crystal', color: '#b8c0c8', text: 'An alloy! This is what engine blocks are cast from. You made a tiny bit of car.' },
  'Al+Mg': { name: 'Magnalium', formula: 'Al–Mg alloy', fx: 'glow', color: '#e0e4e8', text: 'Lightweight alloy. Also the sparkle in sparklers.' },
  'F+Si': { name: 'Silicon tetrafluoride', formula: 'SiF₄', fx: 'smoke', color: '#e8f0d0', text: 'Fluorine just ate the silicon. And is now eyeing the glass flask, which is also silicon.' },
};

export const MIX_TOTAL = Object.keys(MIXES).length;

export function mixResult(a, b) {
  const sa = SYMBOLS[a - 1], sb = SYMBOLS[b - 1];
  if (a === b) return { fx: 'none', color: CONTENT[a].color, text: `${NAMES[a - 1]} plus ${NAMES[a - 1]} is, after careful analysis, more ${NAMES[a - 1]}.` };
  const key = [sa, sb].sort().join('+');
  if (key === 'H+He') return { fx: 'none', color: '#f0d0c0', text: 'Hydrogen leans in. Helium checks its watch. No reaction, just a balloon gas that is half party, half fire hazard.' };
  const nob = NOBLE.has(sa) ? a : NOBLE.has(sb) ? b : 0;
  if (nob) return { fx: 'none', color: '#e8e0f0', text: `${NAMES[nob - 1]} has read your proposal, sighed, and declined. Noble gases do not mingle.` };
  if (MIXES[key]) return { key, ...MIXES[key] };
  return { fx: 'none', color: '#c8ccd0', text: 'They stare at each other across the flask. Nothing happens. Awkward.' };
}

export const LOCKED_LINES = [
  '{n} is still in the mail.',
  '{n} has not finished its paperwork.',
  'You are not ready for {n}. Nobody is.',
  '{n} is locked. Finish your current experiments first.',
  '{n} said, and we quote, "new phone, who dis".',
];
