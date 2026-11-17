# Reaction Lab

A first-person chemistry sandbox for the browser. Pick things up with springy, weighty physics, pour them together, heat them, and find out what happens. Reactions follow real stoichiometry and energy, so experienced players can predict results and beginners learn by playing.

This repository is an early build. It covers the first three stages of the design (core feel, containers and matter, the chemistry engine) plus a first visual and audio pass. Later stages are listed at the bottom.

## Play

No install and no build step:

```sh
python3 -m http.server 8080      # or: npm start
# open http://localhost:8080
```

To make one self-contained HTML file:

```sh
npm install
npm run build                    # writes dist/reaction-lab.html
```

## Controls

| | Keyboard and mouse | Touch (tablet, phone) |
| --- | --- | --- |
| Move | W A S D, Shift sprint, Space jump, C crouch, Q / E lean | Left thumb anywhere in the lower left |
| Look | Mouse (click the view to capture it) | Drag anywhere else |
| Grab | Hold left mouse on an object | Tap it |
| Drop / throw | Let go (swing while letting go to throw) | Tap again, or the Drop button |
| Push / pull held object | Mouse wheel | |
| Rotate held object | Hold R and move the mouse | |
| Pour / use tool | Hold right mouse | Pour / Use button |
| Set down gently | X | Place button |
| Tools | 1 tongs, 2 spatula, 3 pipette, 4 thermometer, 5 extinguisher; Story Mode adds 6 rock pick, 7 trowel | Tool button |
| Taps, burners, hot plate, balance, restock, doors, bed | F while looking at them | Switch button |
| Inspect | E | Inspect button |
| Discovery Book, periodic table, notebook | Tab, P, N | Book button |

## Story Mode and Normal Mode

The title screen has two buttons:

- **Normal Mode** is the free sandbox: the full lab, everything unlocked, exactly as before.
- **Story Mode** starts you in bed at home. Everything you use, you find, carry and store yourself.

### Story Mode

**The map.** Your house (bed, kitchen with salt, baking soda, vinegar and sugar, a tap), a dirt path north to the science lab, and a forest around it with a stream, a lake, a cave, red rocks and a small meteorite crater. A signpost by the lab door points the way.

**Gathering.** Everything is physical and carried by hand, so you make trips:
- pick up loose things: dry sticks, charcoal at the old campfire, elderberries, gold flakes in the stream, native copper in the cave, the meteorite;
- break samples off rock outcrops with the rock pick (6): iron ore, malachite (copper ore), limestone, and in the cave coal, sulfur, rock salt and quartz;
- dig quartz sand on the beach and stream banks with the trowel (7);
- fill a held container with water at the kitchen tap (F), or dip it in the stream or lake. The lab tap is shut off.

The rock pick also crushes lumps to powder, on the ground or inside a container. Ores must be powdered to smelt.

**Storage.** The storage room is through the door on the lab's east wall. It has one labelled jar per material and buckets for carrying. What is in those jars, and any lumps left in the lab or storage room, is saved. Nothing appears in the lab unless you bring it.

**The notebook.** New materials and discoveries get a banner and a log entry. The book's Materials tab lists all 18 materials with where they are found and how much you have stored. Story Mode keeps its own discoveries, log and notes, separate from Normal Mode.

**Goals and unlocks.** Press H for light goals (step outside, find something that burns, make a gas, make a natural indicator, get metal out of a rock, find gold, make quicklime, make glass...). Discoveries unlock equipment:
- 5: heat-proof gloves (hold things up to 200 °C);
- 10: safety goggles (less glare and blast damage);
- 15: a big burner, hot enough for limestone, iron ore and glass.

**New chemistry** for the found materials: wood burning, roasting malachite, smelting copper and iron with charcoal, burning and slaking lime, making soda glass, and an elderberry pH indicator.

Sleeping in your bed regrows the forest and restocks the kitchen. Only findable materials are in Story Mode: nothing synthetic, radioactive or restricted.

## Multiplayer

On the title screen, **Host game** opens a room and shows a 5-letter code. Friends type the code and press **Join**. Then the host picks Story Mode or Normal Mode, and everyone plays in the host's world. It also works if the host starts the game first and friends join later.

- Players are connected peer-to-peer over WebRTC with PeerJS. The free PeerJS cloud server only introduces players; nothing is stored there.
- The host's game is the real one. It sends snapshots about 15 times a second. Guests send their position and whatever they hold or pour into.
- Shared: player bodies with name tags, every object's position and contents, objects created or broken, burners, taps, the hot plate and doors.
- Guests flip switches through the host. Only the host can restock. A guest's own saves are never touched; in Story Mode the host's save is the one that counts.
- Not shared yet: spills on the floor, gas clouds and pour streams (each player sees their own). Voice chat is not included.
- About 4 players works best.

If a page host blocks WebRTC or the PeerJS server, serve the repository with GitHub Pages or any static host instead.

### Helpers

Pick Student or Discovery on the title screen (switch any time in the pause menu):

- **Student mode** (helpers on): pH and temperature readouts without the tools, hints for undiscovered entries, a step-by-step guide with 10 experiments (H), and a tip when what you are carrying will react with what you are looking at.
- **Discovery mode** (no helpers): no hints or guide; you measure pH with an indicator and temperature with the thermometer, like a real lab.

## What is in this build

**Grabbing and carrying (R.E.P.O.-style).** Every object is a rigid body with real mass. A held object is pulled toward a point in front of you by a capped spring, so it lags, swings and collides. Heavy things sag, slow you down and drain stamina. One person can lift about 25 kg, barely; the 58 kg gas cylinder and the 92 kg drum are two-person lifts. Pick-ups lift first, then swing toward you, and the hold point stops at benches and walls. A hard knock breaks your grip.

**Pouring.** Hold the right button to tip a container to the side. It tips quickly until something flows, then creeps, so you can hold a steady stream. While pouring, the lip moves over whatever you are looking at. Flow follows the head of liquid above the lip and is choked by narrow necks. Liquids and powders pour; lumps tip out when the container is upside down. Supply bottles and jars have lids, so knocking one over does not empty it. In automated tests, pours land 96–100% in the target.

**Matter.** Containers have real volumes and shapes. Their contents form layers by density (oil on water, mercury under everything), dissolve up to real solubility limits, and show indicator colours by pH. Spills become puddles and piles that keep reacting. Glass breaks above an impact speed, sends out shards and spills its contents. Heat moves between objects, flames and the hot plate, with convection and radiation losses. Water boils at 100 °C and holds there until it is gone.

**Chemistry engine.** Rules come from data, not code: `data/substances.json`, `data/reactions.json` and `data/discoveries.json`. Each reaction states its inputs and outputs in moles, enthalpy, rate, temperature conditions, catalysts, whether it needs air or a flame, and its visual effects. The engine:

- finds the limiting reagent and conserves mass;
- releases or absorbs heat by enthalpy and heat capacity;
- speeds up with temperature (Q10) and surface area (powder versus lump);
- needs activation (a flame, or heat above a threshold) and keeps going once lit;
- releases gases into the room as clouds that rise or sink by molar mass, ignite in their flammable range and poison by concentration.

Unit tests check every reaction for atom and mass balance.

Normal Mode has 34 reactions and Story Mode adds 7 more. Foaming reactions push foam out of the container as a rising column that topples into mounds on the bench; add dish soap for the full eruption. They include:
- baking soda and vinegar
- sodium, potassium, lithium and calcium in water
- elephant toothpaste
- neutralisation
- magnesium in acid
- burning magnesium, aluminium powder, charcoal, sulfur, red phosphorus and ethanol
- iron plus sulfur
- caramelisation
- rusting
- hydrogen ignition

Large pieces of sodium or potassium explode.

**Acids, bases, indicators and crystals** (added after feedback from a chemistry teacher). A teaching cabinet on the back bench holds:
- 1 M hydrochloric acid and 1 M sodium hydroxide
- citric acid and marble chips
- copper sulfate and alum for growing crystals
- universal indicator, red cabbage juice and phenolphthalein

pH is calculated for strong and weak acids and bases, so a titration flips sharply at the endpoint. Solubility depends on temperature: dissolve copper sulfate or alum in hot water on the hot plate, cool it on the chiller plate, and crystals grow in the glass. Press Z to fast-forward chemistry and heat (×4, ×16) for slow reactions and cooling. New reactions:
- strong acid with strong base
- acid with carbonate (baking soda, marble)
- acid with metal (magnesium, iron)
- acid with copper oxide
- citric acid with baking soda
- metal displacement (an iron nail copper-plated in copper sulfate)
- copper sulfate losing its water when heated and turning blue again with water, the test for water

Every reaction in the Discovery Book shows its type (neutralisation, displacement...), its balanced equation and a short explanation of the science.

**Discovery Book.** First-time reactions, new substances and observations (layers, dissolving, saturation, boiling, melting, red heat, iron floating on mercury...) trigger a banner with a real fact. The book lists every entry, with hints for those not found. It also has an interactive periodic table of all 118 elements with real data. The notebook logs each experiment with amounts and starting temperature.

**The lab.** One room:
- benches, a sink with running water and a drain
- two Bunsen burners, a hot plate and a precision balance
- element storage holding 14 of the 20 starting elements (the gases come with gas handling)
- glassware shelves, supplies and a first-aid station
- a restock lever
- heavy things to test your back on

**Hazards.** Touching sodium bare-handed burns; use tongs. Hot glass looks like cold glass until it burns you. Explosions shove objects, shatter glass and hurt you, scaled by energy and distance. Burning magnesium dazzles. Toxic smoke makes you cough and costs health. The CO₂ extinguisher puts out ordinary fires but not metal fires. Settings include a gentle hazard level, and options to reduce flashes and screen shake.

## Not yet built

The full design is in nine stages. Still to come:

- Stage 4 (rest of the realism pass): volumetric fire and smoke, real refraction, a fluid simulation.
- Stage 5: gas cylinders for H, He, N, O, Ne and Cl; electricity and electrolysis; furnace and arc furnace; the cooling room; more recipes, hazards and inventions.
- Stage 6: the Ore Room, Air Plant, Electrolysis Hall, spectrometer and earning the first elements beyond the starting 20.
- Stage 7 (rest of it): shared spills and gas, shared discoveries, voice.
- Stage 8: platinum group, rare earths, radiochemistry, reactor, cyclotron and superheavy elements.
- Stage 9: achievements, cosmetics, challenges, game modes, accessibility and optimisation.

Every locked element already has a real source mineral, a processing method and a hint (see `data/elements.json`).

## Code layout

| Path | What it is |
| --- | --- |
| `data/elements.json` | All 118 elements with real values (generated by `tools/gen-elements.mjs` from the `periodic-table` npm dataset) plus unlock tiers, sources and hints |
| `data/substances.json`, `data/reactions.json`, `data/discoveries.json` | The chemistry content |
| `js/chem/` | Formula parser, data loader, mixtures (phases, layers, solubility, pH) and the reaction engine; pure JavaScript with no graphics |
| `js/physics/` | cannon-es world and the grab system |
| `js/matter/` | Containers, lumps, props, pouring, spills, breakage (`items.js`), gas clouds and explosions (`gas.js`), and the simulation loop tying heat, reactions and effects together (`sim.js`) |
| `js/world/` | The lab room and its fixtures, the Story Mode outdoors (`outdoors.js`), doors, and all canvas-painted textures |
| `js/net.js` | Multiplayer: room codes, host snapshots, guest input, avatars |
| `js/story.js`, `js/story-data.js`, `data/materials.json` | Story Mode: gathering, storage and saving, goals, unlocks, the 18 materials |
| `js/ui/hud.js` | HUD, banners, Discovery Book, periodic table, notebook, settings |
| `js/core/` | Input (pointer lock and touch), synthesised audio, particles |
| `js/main.js` | Boot, rendering, player interaction, game loop |
| `vendor/` | three.js r170 and cannon-es 0.20 (MIT licences included) |
| `tests/chem.test.mjs` | Engine tests: mass and atom balance for every reaction, stoichiometry, heat, activation, catalysts, boiling, solubility, pH |

## Adding a reaction

Add an entry to `data/reactions.json`. Any new substances go in `data/substances.json` and a discovery in `data/discoveries.json`. Then run `npm test`; it fails if atoms or mass do not balance.

```json
{ "id": "na_water", "inputs": [{"id":"sodium","mol":2},{"id":"water","mol":2}],
  "outputs": [{"id":"naoh","mol":2},{"id":"h2","mol":1}], "enthalpy_kJ": -368,
  "rate": {"k": 0.22, "surface": true},
  "effects": [{"fx":"fizz","amount":1.4}, {"fx":"explode","chunkOver_g":3.2,"delay":[1.5,4],"kJ_per_g":5}],
  "discovery": "rx_na_water" }
```

## Note

All chemistry is simplified for play and learning. It is not a guide to real procedures.
