import MATS from '../data/materials.json' with { type: 'json' };

// Story Mode's light goals and the equipment you earn as your discovery count grows.
export { MATS };
export const MAT = Object.fromEntries(MATS.map((m) => [m.id, m]));
export const GOALS = [
  { id: 'outside', t: 'Step outside', d: 'Leave the house through the front door.' },
  { id: 'lab', t: 'Find the science lab', d: 'Follow the dirt path north. The signpost by the lab points to everything.' },
  { id: 'collect', t: 'Collect a material', d: 'Pick something up: a dry stick, salt from the kitchen, a rock sample.' },
  { id: 'store', t: 'Store a sample', d: 'Drop it into a labelled jar in the storage room, through the door on the east wall of the lab.' },
  { id: 'water', t: 'Fetch water', d: 'The lab water is off. Fill a container at the kitchen tap, the stream or the lake.' },
  { id: 'fizz', t: 'Make a gas', d: 'Make something fizz or give off a gas. The kitchen has a classic pair.' },
  { id: 'burn', t: 'Find something that burns', d: 'Hold things in a burner flame (tongs!) and see what catches.' },
  { id: 'ph', t: 'Make a natural indicator', d: 'Crush berries with the rock pick, stir them into water, then add something sour or something soapy.' },
  { id: 'metal', t: 'Get metal out of a rock', d: 'Roast green malachite in a crucible, then heat it with crushed charcoal.' },
  { id: 'gold', t: 'Find gold', d: 'Something glints in the stream bed.' },
  { id: 'lime', t: 'Make quicklime', d: 'Limestone gives up its carbon dioxide only in fierce heat. A bigger burner would help.' },
  { id: 'glass', t: 'Make glass', d: 'Sand and washing soda (baked baking soda), crushed together and melted in fierce heat.' },
  { id: 'all', t: 'Find every material', d: MATS.length + ' materials are out there.' },
];
export const UNLOCKS = [
  { id: 'gloves', at: 5, t: 'Heat-proof gloves', d: 'You can now hold things up to 200 °C without tongs.' },
  { id: 'goggles', at: 10, t: 'Safety goggles', d: 'Bright flashes and blasts hurt you less.' },
  { id: 'burner', at: 15, t: 'Big burner', d: 'The lab burners now roar like a blowtorch: enough heat for limestone, iron ore and glass.' },
];
