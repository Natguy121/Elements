# Elements Lab

A comedy science game. You start with a grey periodic table and one glowing tile: hydrogen. Tap it, open the lab door, catch the package that gets thrown at you, and start experimenting. Finish three experiments with an element and the next one unlocks.

It runs in any modern browser, on phones and desktops, with no install.

## How it plays

1. **Start menu** – Play, sound toggle, reset progress.
2. **Periodic table** – all 118 elements are there; locked ones are grey, the next one to play pops out of the grid.
3. **The lab** – a 3D lab with a bench full of equipment.
   - Open the door, a labelled package is delivered (thrown), open it to get your sample.
   - Walk around freely. Touch: left thumb is a walk stick, the rest of the screen looks. Desktop: WASD + drag.
   - Equipment is spread around the room and nothing tells you what to use: a balloon rig, a burner, a high-voltage tube, a water tank, a microphone and a mixer. Walk up to something and tap it (or press the button that appears) to try your sample on it.
   - Each element has three hidden discoveries, shown as `???` until you find them. Every station reacts to every element, so the rest are there for fun.
4. **Mixing** – once you own two elements, the Mixer combines any pair. There are 34 real compounds to discover (water, table salt, laughing gas, …) and a lot of awkward silences.

Progress is saved in the browser.

## What is in so far

- Elements **1–18** (hydrogen to argon) are fully playable: 90 element/station reactions and 34 mixer recipes.
- Elements 19–118 show on the table as locked ("on backorder").

## Run it

No build step is needed. Serve the folder and open it:

```sh
python3 -m http.server 8080      # or: npm start
# then open http://localhost:8080
```

It also works as-is on GitHub Pages (Settings → Pages → deploy from branch, root folder).

To produce one self-contained HTML file you can send to someone:

```sh
npm install
npm run build        # writes dist/elements.html
```

## How it is built

| Path | What it is |
| --- | --- |
| `index.html`, `css/style.css` | Menu, periodic table, lab HUD |
| `js/data.js` | All elements, experiments, jokes and mixer recipes |
| `js/lab.js` | The 3D lab: room, bench, stations, door, delivery box |
| `js/experiments.js` | What each station does, the delivery sequence, the mixer |
| `js/fx.js` | Tween engine and particle system |
| `js/textures.js` | Every texture, painted on canvas at start-up |
| `js/audio.js` | Every sound, synthesised with WebAudio |
| `js/main.js` | Game state, saving, input, render loop |
| `vendor/` | three.js r170 (MIT) |

There are no image, model or audio files. Everything is generated in code: physically based materials, real glass refraction, soft shadows, bloom and filmic tone mapping via three.js.

## Adding an element

Add one entry to `CONTENT` in `js/data.js` and raise `MAX_PLAYABLE`. An entry picks a form (`gas` or `solid`), a colour, three task stations, and a reaction for each of the five stations chosen from the existing effects:

| Station | Effects |
| --- | --- |
| balloon | `float`, `hover`, `sink`, `eaten`, `rock` |
| burner | `boom`, `tint` (+colour), `out`, `roar`, `ember`, `white`, `inferno`, `none` |
| zap | `glow` (+colour), `spark`, `none` |
| water | `bubbles`, `steam`, `fizz`, `boom`, `sink`, `glowsink` |
| mic | `pitch` (voice), `lick`, `refuse` |

Mixer recipes live in `MIXES` in the same file, keyed by the two symbols in alphabetical order (`'H+O'`).

## Safety

The chemistry facts are real. The lab safety is not. Do not try any of this at home.
