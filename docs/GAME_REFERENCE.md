# Elements Lab and R.E.P.O.: full reference

One file, two parts. **Part 1** is the game this repo builds, Elements Lab. Everything in it comes from the code, so it is exact for this version. **Part 2** is R.E.P.O., the game you referenced. I wrote it from memory and could not check it, so it is a checklist with blanks for you to fill in, not a list of facts.

## Contents

**Part 1: Elements Lab**
1. [Flow](#flow)
2. [Controls](#controls)
3. [Physics and feel](#physics-and-feel)
4. [Stations](#stations)
5. [Element index](#element-index)
6. [Element details, 1 to 18](#element-details-1-to-18)
7. [Station reaction effects](#station-reaction-effects)
8. [Mixer recipes](#mixer-recipes)
9. [Mixer rules](#mixer-rules)
10. [Liquid nitrogen](#liquid-nitrogen)
11. [Loose objects](#loose-objects)
12. [Breakage and reactions to objects](#breakage-and-reactions-to-objects)
13. [Scene: props, lights and animation](#scene-props-lights-and-animation)
14. [Sound](#sound)
15. [Multiplayer](#multiplayer)
16. [Saving and reset](#saving-and-reset)
17. [Performance and devices](#performance-and-devices)
18. [Glossary](#glossary)

**Part 2: R.E.P.O.** (checklist)
19. [What R.E.P.O. is](#what-repo-is)
20. [To fill in](#to-fill-in)

---

# Part 1: Elements Lab

## Flow

1. **Start menu.** Play, Sound on/off, Reset progress (asks first).
2. **Periodic table.** Cells are coloured by category when unlocked. Grey cells are locked. The next element to play pulses. Locked cells show a joke line when tapped. Elements 19 to 118 say "on backorder".
3. **First visit to an element.** The lab opens. You walk to the door (a knock sequence plays, the door swings open, and a labelled package is thrown and lands). Open the package by tapping it; peanuts burst out and the sample rises out of the box.
4. **Later visits.** The delivery is skipped and the sample is already on the trolley.
5. **Discoveries.** Each element has three hidden discoveries. They show as `???` until you find them. Finding all three clears the element and unlocks the next one (up to element 18).
6. **Unlock popup.** After clearing an element: "Keep experimenting" or "Periodic table".
7. **Mixer.** Opens with two different delivered elements you have unlocked. Needs both selected; "Mix them" is disabled until two are chosen.
8. **Leaving.** The Table button returns to the table. Any object you hold is dropped.

## Controls

| Action | Desktop | Touch (tablet, phone) |
| --- | --- | --- |
| Walk forward / back | W / S, or Arrow Up / Down | Thumbstick push up / down |
| Strafe | A / D | Thumbstick left / right |
| Turn | Drag the mouse, or Arrow Left / Right | Drag anywhere outside the thumbstick zone |
| Grab an object | Click it | Tap it |
| Drop a held object | Click again, or E | Tap again |
| Throw a held object | F, or right-click | Throw button (appears while holding) |
| Use the mixer | Carry your sample to the flask on the back bench | Same |

Notes:
- The thumbstick appears where the left thumb touches, in the lower-left 40% of the width and the lower 65% of the height. It has a 56-pixel travel limit; the stick is full at that distance.
- A tap counts as a tap if the finger moves less than 10 pixels and is released within 500 ms.
- Pinch zoom, double-tap zoom and the context menu are blocked on the canvas.
- Looking up and down is clamped to pitch between -1.2 and 1.2 radians (about -69° to 69°).
- Yaw is unlimited; the view can turn all the way round.
- Walking speed: 2.4 m/s per axis. Diagonal movement is not normalised, so walking forward and sideways at once is about 1.4 times faster.
- The camera stands at eye height 1.45 m.

## Physics and feel

These constants come from `js/grab.js` and `js/main.js`.

| Quantity | Value | Where |
| --- | --- | --- |
| Gravity | 9.8 m/s² | grab.js step() |
| Held-object follow strength | 13 (velocity toward target) | grab.js |
| Held-object max speed | 9 m/s | grab.js |
| Hold distance | 0.75 to 1.5 m from the camera, set on grab | grab.js grab() |
| Throw velocity | 7.5 m/s forward, +1.6 m/s upward | grab.js release() |
| Drop speed cap | 5 m/s | grab.js release() |
| Floor friction on resting objects | exp(-7·dt) applied to x and z | grab.js constrain() |
| Bounce on walls | velocity × -0.4 | grab.js constrain() |
| Bounce on furniture | velocity × -0.35 | grab.js constrain() |
| Collision between props | objects pushed apart; relative speed > 2.5 m/s causes an impact | grab.js step() |
| Impact sound threshold | speed > 1 m/s | grab.js hit() |
| Glass shatters at | > 3.4 m/s impact | main.js hooks.onImpact |
| Frozen objects shatter at | > 2.4 m/s impact | main.js hooks.onImpact |
| Shake on heavy hit | > 4 m/s for the cannonball | main.js hooks.onImpact |
| Water entry splash | any object entering the tank surface | main.js hooks.onWater |
| Floating items in water | pulled to the water line (×60 spring, ×6 damping) | grab.js step() |
| Sinking items in water | drift down at 2.2 m/s | grab.js step() |
| Balloon lift (buoyancy) | 12.3 (float), 10.5 (slow float), 9.8 (hover), 8.6 (sink start), against gravity 9.8 | experiments.js balloon |
| Room bounds | x -4.95 to 4.95, z -2.95 to 3.95, ceiling 3.17 m | grab.js constrain() |
| Bring-to-zone cooldown | 2.5 s per object per zone | grab.js zones() |
| Respawn after breaking | 8 s, back to the home position | grab.js step() |
| Player collision radius | 0.28 m | lab.js move() |
| Player bounds | x -4.65 to 4.65, z -2.7 to 3.65 | lab.js move() |

## Stations

Stations are unlabelled, and their order in the room is not a sequence. Each has a trigger zone. A held object (including the sample) that comes inside the zone causes that station reaction.

| Station | Position (x, z) | Trigger radius (m) | Trigger centre | What it does |
| --- | --- | --- | --- | --- |
| Balloon rig | -2.6, 1.0 | 0.28 | nozzle | Inflates a gas sample into a balloon; solids drop in as a chunk |
| Burner | -2.8, -2.55 | 0.26 | flame tip | Gas flame and heat tests |
| Zapper | 2.2, 1.6 | 0.30 | clips | High-voltage tube and lever |
| Water tank | -0.4, -2.55 | 0.32 | water surface | Bubbling, splashing, floating and sinking |
| Microphone | 4.0, 2.4 | 0.30 | mic head | Voice reaction and lick tests |
| Mixer | 2.0, -2.55 | 0.28 | flask neck | Mixes two elements |
| Liquid nitrogen dewar | -4.2, -1.1 | 0.34 | 1.0 m high, over the dewar | Cold reactions |

Liquid nitrogen is never one of the three discoveries. The mixer uses the two elements you select. Each element discoveries come from the balloon, burner, zapper, tank and microphone stations.

Station behaviour common to all:
- Activation is blocked while the mixer panel or the unlock popup is open, and while another reaction is still playing.
- After a cryo reaction the sample is returned to the trolley.
- Each reaction shows a caption in the lab notes box, and a toast when a discovery is made.

## Element index

| Z | Symbol | Name | Category | Form | Sample colour | Discoveries |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | H | Hydrogen | nonmetal | gas | #e23d3d | Fill a balloon with it; Introduce it to fire; Zap it with high voltage |
| 2 | He | Helium | noble | gas | #b7773c | Fill a balloon with it; Inhale some and speak; Try to set it on fire |
| 3 | Li | Lithium | alkali | solid, metal, oil-stored | #c9ccd1 | Drop it in the tank; Hold it in the flame; See if it conducts |
| 4 | Be | Beryllium | alkaline | solid, metal | #8d9399 | Drop it in the tank; Try to melt it; See if it conducts |
| 5 | B | Boron | metalloid | solid | #3a2f2a | Hold it in the flame; See if it conducts; Put it in a balloon (trust me) |
| 6 | C | Carbon | nonmetal | solid | #1c1c1e | Heat it up; See if it conducts; Drop it in the tank |
| 7 | N | Nitrogen | nonmetal | gas | #2f6fd6 | Fill a balloon with it; Introduce it to fire; Zap it with high voltage |
| 8 | O | Oxygen | nonmetal | gas | #e8eef2 | Feed it to the flame; Fill a balloon with it; Bubble it through water |
| 9 | F | Fluorine | halogen | gas | #d9d24a | Fill a balloon with it; Bubble it through water; Introduce it to fire |
| 10 | Ne | Neon | noble | gas | #ff5a2b | Light it up; Fill a balloon with it; Introduce it to fire |
| 11 | Na | Sodium | alkali | solid, metal, oil-stored | #d3d6da | Drop it in the tank; Hold it in the flame; See if it conducts |
| 12 | Mg | Magnesium | alkaline | solid, metal | #c2c5c9 | Hold it in the flame; See if it conducts; Drop it in the tank |
| 13 | Al | Aluminium | metal | solid, metal | #d0d4d8 | See if it conducts; Drop it in the tank; Bite it like foil |
| 14 | Si | Silicon | metalloid | solid, metal | #56616e | See if it conducts; Hold it in the flame; Stuff it in a balloon |
| 15 | P | Phosphorus | nonmetal | solid, waxy | #e9e2b8 | Drop it in the tank; Hold it in the flame; See if it conducts |
| 16 | S | Sulfur | nonmetal | solid | #f0d21c | Hold it in the flame; See if it conducts; Drop it in the tank |
| 17 | Cl | Chlorine | halogen | gas | #9bd13a | Fill a balloon with it; Bubble it through water; Zap it with high voltage |
| 18 | Ar | Argon | noble | gas | #7a5bd1 | Zap it with high voltage; Introduce it to fire; Inhale some and speak |
| 19 | K | Potassium | locked | - | - | backorder |
| 20 | Ca | Calcium | locked | - | - | backorder |
| 21 | Sc | Scandium | locked | - | - | backorder |
| 22 | Ti | Titanium | locked | - | - | backorder |
| 23 | V | Vanadium | locked | - | - | backorder |
| 24 | Cr | Chromium | locked | - | - | backorder |
| 25 | Mn | Manganese | locked | - | - | backorder |
| 26 | Fe | Iron | locked | - | - | backorder |
| 27 | Co | Cobalt | locked | - | - | backorder |
| 28 | Ni | Nickel | locked | - | - | backorder |
| 29 | Cu | Copper | locked | - | - | backorder |
| 30 | Zn | Zinc | locked | - | - | backorder |
| 31 | Ga | Gallium | locked | - | - | backorder |
| 32 | Ge | Germanium | locked | - | - | backorder |
| 33 | As | Arsenic | locked | - | - | backorder |
| 34 | Se | Selenium | locked | - | - | backorder |
| 35 | Br | Bromine | locked | - | - | backorder |
| 36 | Kr | Krypton | locked | - | - | backorder |
| 37 | Rb | Rubidium | locked | - | - | backorder |
| 38 | Sr | Strontium | locked | - | - | backorder |
| 39 | Y | Yttrium | locked | - | - | backorder |
| 40 | Zr | Zirconium | locked | - | - | backorder |
| 41 | Nb | Niobium | locked | - | - | backorder |
| 42 | Mo | Molybdenum | locked | - | - | backorder |
| 43 | Tc | Technetium | locked | - | - | backorder |
| 44 | Ru | Ruthenium | locked | - | - | backorder |
| 45 | Rh | Rhodium | locked | - | - | backorder |
| 46 | Pd | Palladium | locked | - | - | backorder |
| 47 | Ag | Silver | locked | - | - | backorder |
| 48 | Cd | Cadmium | locked | - | - | backorder |
| 49 | In | Indium | locked | - | - | backorder |
| 50 | Sn | Tin | locked | - | - | backorder |
| 51 | Sb | Antimony | locked | - | - | backorder |
| 52 | Te | Tellurium | locked | - | - | backorder |
| 53 | I | Iodine | locked | - | - | backorder |
| 54 | Xe | Xenon | locked | - | - | backorder |
| 55 | Cs | Caesium | locked | - | - | backorder |
| 56 | Ba | Barium | locked | - | - | backorder |
| 57 | La | Lanthanum | locked | - | - | backorder |
| 58 | Ce | Cerium | locked | - | - | backorder |
| 59 | Pr | Praseodymium | locked | - | - | backorder |
| 60 | Nd | Neodymium | locked | - | - | backorder |
| 61 | Pm | Promethium | locked | - | - | backorder |
| 62 | Sm | Samarium | locked | - | - | backorder |
| 63 | Eu | Europium | locked | - | - | backorder |
| 64 | Gd | Gadolinium | locked | - | - | backorder |
| 65 | Tb | Terbium | locked | - | - | backorder |
| 66 | Dy | Dysprosium | locked | - | - | backorder |
| 67 | Ho | Holmium | locked | - | - | backorder |
| 68 | Er | Erbium | locked | - | - | backorder |
| 69 | Tm | Thulium | locked | - | - | backorder |
| 70 | Yb | Ytterbium | locked | - | - | backorder |
| 71 | Lu | Lutetium | locked | - | - | backorder |
| 72 | Hf | Hafnium | locked | - | - | backorder |
| 73 | Ta | Tantalum | locked | - | - | backorder |
| 74 | W | Tungsten | locked | - | - | backorder |
| 75 | Re | Rhenium | locked | - | - | backorder |
| 76 | Os | Osmium | locked | - | - | backorder |
| 77 | Ir | Iridium | locked | - | - | backorder |
| 78 | Pt | Platinum | locked | - | - | backorder |
| 79 | Au | Gold | locked | - | - | backorder |
| 80 | Hg | Mercury | locked | - | - | backorder |
| 81 | Tl | Thallium | locked | - | - | backorder |
| 82 | Pb | Lead | locked | - | - | backorder |
| 83 | Bi | Bismuth | locked | - | - | backorder |
| 84 | Po | Polonium | locked | - | - | backorder |
| 85 | At | Astatine | locked | - | - | backorder |
| 86 | Rn | Radon | locked | - | - | backorder |
| 87 | Fr | Francium | locked | - | - | backorder |
| 88 | Ra | Radium | locked | - | - | backorder |
| 89 | Ac | Actinium | locked | - | - | backorder |
| 90 | Th | Thorium | locked | - | - | backorder |
| 91 | Pa | Protactinium | locked | - | - | backorder |
| 92 | U | Uranium | locked | - | - | backorder |
| 93 | Np | Neptunium | locked | - | - | backorder |
| 94 | Pu | Plutonium | locked | - | - | backorder |
| 95 | Am | Americium | locked | - | - | backorder |
| 96 | Cm | Curium | locked | - | - | backorder |
| 97 | Bk | Berkelium | locked | - | - | backorder |
| 98 | Cf | Californium | locked | - | - | backorder |
| 99 | Es | Einsteinium | locked | - | - | backorder |
| 100 | Fm | Fermium | locked | - | - | backorder |
| 101 | Md | Mendelevium | locked | - | - | backorder |
| 102 | No | Nobelium | locked | - | - | backorder |
| 103 | Lr | Lawrencium | locked | - | - | backorder |
| 104 | Rf | Rutherfordium | locked | - | - | backorder |
| 105 | Db | Dubnium | locked | - | - | backorder |
| 106 | Sg | Seaborgium | locked | - | - | backorder |
| 107 | Bh | Bohrium | locked | - | - | backorder |
| 108 | Hs | Hassium | locked | - | - | backorder |
| 109 | Mt | Meitnerium | locked | - | - | backorder |
| 110 | Ds | Darmstadtium | locked | - | - | backorder |
| 111 | Rg | Roentgenium | locked | - | - | backorder |
| 112 | Cn | Copernicium | locked | - | - | backorder |
| 113 | Nh | Nihonium | locked | - | - | backorder |
| 114 | Fl | Flerovium | locked | - | - | backorder |
| 115 | Mc | Moscovium | locked | - | - | backorder |
| 116 | Lv | Livermorium | locked | - | - | backorder |
| 117 | Ts | Tennessine | locked | - | - | backorder |
| 118 | Og | Oganesson | locked | - | - | backorder |

Categories and their table colours:

| Category | Colour |
| --- | --- |
| nonmetal | #7fd6ff |
| noble | #d59bff |
| alkali | #ff8d6b |
| alkaline | #ffc46b |
| metalloid | #7fe3b0 |
| halogen | #f5ee6a |
| metal | #b9c7d6 |

## Element details, 1 to 18

### 1. Hydrogen (H)

- **Category:** nonmetal (table colour #7fd6ff)
- **Form in the lab:** gas
- **Sample colour:** #e23d3d
- **Label tagline:** "Contains 75% of the universe. Handle accordingly."
- **Intro caption:** Hydrogen. One proton, one electron, zero chill. Let's poke it.
- **Discoveries:** Fill a balloon with it (balloon station); Introduce it to fire (burner station); Zap it with high voltage (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | float | Lightest thing in existence. It left before you finished tying the knot. |
| burner (discovery) | boom | That was the Hindenburg speedrun. Your eyebrows have been filed under "missing". |
| zap (discovery) | glow (colour #ff4fa0) | Pink! Hydrogen glows like a flamingo at a rave. |
| water | bubbles | It bubbles straight out. Hydrogen is literally IN water and still wants nothing to do with it. |
| mic | undefined (voice pitch 1.6) | Squeaky AND flammable. Please do not speak near the burner. |
| cryo | cold | At −253 °C hydrogen finally turns liquid. Your nitrogen only reaches −196. It stays a gas and stays smug. |

### 2. Helium (He)

- **Category:** noble (table colour #d59bff)
- **Form in the lab:** gas
- **Sample colour:** #b7773c
- **Label tagline:** "Do not inhale. (You are going to inhale it.)"
- **Intro caption:** Helium. Second lightest, first funniest. It refuses to react with anything, including criticism.
- **Discoveries:** Fill a balloon with it (balloon station); Inhale some and speak (mic station); Try to set it on fire (burner station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | float | Up it goes. Party gas, reporting for duty. |
| burner (discovery) | none | Nothing. Helium is a noble gas. It does not "do" reactions. It has people for that. |
| zap | glow (colour #ffb46a) | A classy peach glow. Even its plasma is smug. |
| water | bubbles | The bubbles rise, unbothered. Helium will not dissolve, on principle. |
| mic (discovery) | undefined (voice pitch 2.3) | You sound like a chipmunk giving a keynote. Science has peaked. |
| cryo | cold | Helium needs −269 °C to turn liquid, the coldest of anything. Liquid nitrogen is a warm bath to it. |

### 3. Lithium (Li)

- **Category:** alkali (table colour #ff8d6b)
- **Form in the lab:** solid (metal) (stored in oil, so shown in a sealed jar)
- **Sample colour:** #c9ccd1
- **Label tagline:** "Softest metal. Emotionally and physically."
- **Intro caption:** Lithium. A metal so soft you could cut it with a butter knife and so light it floats. It lives in oil because it has trust issues with air.
- **Discoveries:** Drop it in the tank (water station); Hold it in the flame (burner station); See if it conducts (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | You put a rock in a balloon. The balloon is now a paperweight. |
| burner (discovery) | tint (colour #ff1f3d) | Crimson flame! That exact red is in every firework finale. |
| zap (discovery) | spark | It conducts! You have invented a worse battery. Your phone uses the better one. |
| water (discovery) | fizz | It floats AND fizzes. A metal with the personality of a bath bomb. |
| mic | undefined (lick) | You licked it. You feel oddly calm. Please stop licking the elements. |
| cryo | cold | It is now a very cold soft metal. Still soft. Still has trust issues. |

### 4. Beryllium (Be)

- **Category:** alkaline (table colour #ffc46b)
- **Form in the lab:** solid (metal)
- **Sample colour:** #8d9399
- **Label tagline:** "Light, strong, toxic. The whole package."
- **Intro caption:** Beryllium. Lighter than aluminium, stiffer than steel, and absolutely not a snack.
- **Discoveries:** Drop it in the tank (water station); Try to melt it (burner station); See if it conducts (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | Thud. Light for a metal is still heavy for a balloon. |
| burner (discovery) | none | It just sits there. It melts at 1287 °C. Your burner is a hair dryer to this thing. |
| zap (discovery) | spark | Conducts nicely. It is also see-through to X-rays, so it has nothing to hide. |
| water (discovery) | sink | Plop. No reaction. Beryllium does not get out of bed for water. |
| mic | undefined (lick) | DO NOT. It tastes sweet, and that is the last nice thing it will ever do for you. |
| cryo | cold | Cold beryllium. Just as toxic, now with frostbite. |

### 5. Boron (B)

- **Category:** metalloid (table colour #7fe3b0)
- **Form in the lab:** solid
- **Sample colour:** #3a2f2a
- **Label tagline:** "Not boring. It is boron. Totally different."
- **Intro caption:** Boron. Not quite a metal, not quite not. The "it's complicated" of the periodic table.
- **Discoveries:** Hold it in the flame (burner station); See if it conducts (zap station); Put it in a balloon (trust me) (balloon station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | rock | Exactly as aerodynamic as it looks. The floor has filed a complaint. |
| burner (discovery) | tint (colour #3dff5c) | Green flame! Boron is why movie witches have such good lighting. |
| zap (discovery) | none | Barely a tingle. Boron is a metalloid. It conducts only when it feels like it. |
| water | sink | It sinks, then sulks. |
| mic | undefined (lick) | Tastes like laundry day. That is the borax talking. Stop licking things. |
| cryo | cold | Frosty boron. It did not notice. |

### 6. Carbon (C)

- **Category:** nonmetal (table colour #7fd6ff)
- **Form in the lab:** solid
- **Sample colour:** #1c1c1e
- **Label tagline:** "Some assembly required: pencil, diamond, or you."
- **Intro caption:** Carbon. You are about 18% this. So is your pencil. Try not to make it awkward.
- **Discoveries:** Heat it up (burner station); See if it conducts (zap station); Drop it in the tank (water station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | A lump of coal in a balloon. Worst birthday ever. |
| burner (discovery) | ember | It glows like a barbecue. With enough pressure it would be a diamond. You are not enough pressure. |
| zap (discovery) | spark | Graphite conducts. Your pencil has been a wire this whole time. |
| water (discovery) | sink | It sinks. Somewhere, a water filter nods with respect. |
| mic | undefined (lick) | Tastes like a pencil. You know this because you were once seven. |
| cryo | cold | Cold carbon. It does not care. It has been through worse inside stars. |

### 7. Nitrogen (N)

- **Category:** nonmetal (table colour #7fd6ff)
- **Form in the lab:** gas
- **Sample colour:** #2f6fd6
- **Label tagline:** "78% of every breath. You are soaking in it."
- **Intro caption:** Nitrogen. Most of the air, none of the credit.
- **Discoveries:** Fill a balloon with it (balloon station); Introduce it to fire (burner station); Zap it with high voltage (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | hover | It just... hovers. It is basically air. You have built a balloon full of normal. |
| burner (discovery) | out | The flame went out. Nitrogen is the fun police. |
| zap (discovery) | glow (colour #b05cff) | Purple lightning in a tube. Nitrogen finally shows some personality. |
| water | bubbles | Bubbles. Scuba divers get these in their blood if they surface too fast. Rise slowly, friend. |
| mic | undefined (voice pitch 1.03) | You sound exactly the same. Deeply disappointing. |
| cryo | cold | You dipped nitrogen in nitrogen. It condensed into more of the same. Peak efficiency. |

### 8. Oxygen (O)

- **Category:** nonmetal (table colour #7fd6ff)
- **Form in the lab:** gas
- **Sample colour:** #e8eef2
- **Label tagline:** "You have been on the free trial since birth."
- **Intro caption:** Oxygen. You have been using this your whole life without reading the terms and conditions.
- **Discoveries:** Feed it to the flame (burner station); Fill a balloon with it (balloon station); Bubble it through water (water station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | sink | It sinks. Oxygen is heavier than air and, frankly, it is carrying the whole planet. |
| burner (discovery) | roar | WHOA. Fire loves oxygen. Most toxic relationship in chemistry. |
| zap | glow (colour #a9d6ff) | A ghostly blue-white. This is also how ozone is made, a.k.a. that thunderstorm smell. |
| water (discovery) | bubbles | The fish in this tank would be thrilled. There are no fish. There is a duck. |
| mic | undefined (voice pitch 0.94) | You feel fantastic. Suspiciously fantastic. |
| cryo | cold | Oxygen turns into a pale blue liquid at −183 °C, and that liquid is magnetic. Really. |

### 9. Fluorine (F)

- **Category:** halogen (table colour #f5ee6a)
- **Form in the lab:** gas
- **Sample colour:** #d9d24a
- **Label tagline:** "Reacts with everything. Including this box."
- **Intro caption:** Fluorine. The most reactive element there is. It has beef with every atom it has ever met.
- **Discoveries:** Fill a balloon with it (balloon station); Bubble it through water (water station); Introduce it to fire (burner station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | eaten | The fluorine ate the balloon. It is not a gas, it is a grudge. |
| burner (discovery) | inferno | Everything is on fire. Fluorine can ignite water, sand and your hopes. |
| zap | glow (colour #eaff7a, smoke) | The tube is glowing and also dissolving. We are calling that a pass. |
| water (discovery) | steam | The water is... burning? Fluorine does not follow rules. It replaces them. |
| mic | undefined (refuses) | NO. The microphone has fainted in protest. |
| cryo | cold | Fluorine becomes a yellow liquid at −188 °C. It is still angry, just slower. |

### 10. Neon (Ne)

- **Category:** noble (table colour #d59bff)
- **Form in the lab:** gas
- **Sample colour:** #ff5a2b
- **Label tagline:** "Open 24 hours."
- **Intro caption:** Neon. Famous for exactly one thing and, to be fair, it is very good at it.
- **Discoveries:** Light it up (zap station); Fill a balloon with it (balloon station); Introduce it to fire (burner station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | float (slow) | It floats. Lazily. Lighter than air but in no hurry about it. |
| burner (discovery) | none | Nothing. Another noble gas, another refusal to participate. |
| zap (discovery) | glow (colour #ff3d14) | THE classic. Every "OPEN" sign and questionable motel owes this glow. |
| water | bubbles | Fancy bubbles. They are exactly as useful as regular bubbles. |
| mic | undefined (voice pitch 1.3) | Slightly squeaky. Budget helium. |
| cryo | cold | Neon holds out until −246 °C. It stays a gas and keeps glowing about it. |

### 11. Sodium (Na)

- **Category:** alkali (table colour #ff8d6b)
- **Form in the lab:** solid (metal) (stored in oil, so shown in a sealed jar)
- **Sample colour:** #d3d6da
- **Label tagline:** "Keep dry. KEEP. DRY."
- **Intro caption:** Sodium. Half of table salt, all of the drama. It ships in oil for reasons you are about to discover.
- **Discoveries:** Drop it in the tank (water station); Hold it in the flame (burner station); See if it conducts (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | Down it goes. At least it stayed dry. |
| burner (discovery) | tint (colour #ffb020) | Blazing yellow. Every old street lamp on Earth is this colour because of sodium. |
| zap (discovery) | spark | Conducts beautifully. It would make great wire if it did not explode in the rain. |
| water (discovery) | boom | And THAT is why it ships in oil. The duck has briefly achieved orbit. |
| mic | undefined (lick) | Salty? No. That is sodium CHLORIDE. This one just detonates on your tongue. |
| cryo | cold | Cold sodium. For once it is not exploding. Enjoy the quiet. |

### 12. Magnesium (Mg)

- **Category:** alkaline (table colour #ffc46b)
- **Form in the lab:** solid (metal)
- **Sample colour:** #c2c5c9
- **Label tagline:** "Burns bright. No, brighter than that."
- **Intro caption:** Magnesium. Sits quietly in your vitamins until someone shows it a flame.
- **Discoveries:** Hold it in the flame (burner station); See if it conducts (zap station); Drop it in the tank (water station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | Clonk. Magnesium is light, but not "balloon" light. |
| burner (discovery) | white | MY EYES. Magnesium was the original camera flash, and now it is your whole field of vision. |
| zap (discovery) | spark | Conducts well. Nobody is surprised. It is a metal. |
| water (discovery) | sink (bubbles) | A few lazy bubbles. Magnesium reacts with water the way you reply to emails. |
| mic | undefined (lick) | Tastes like vitamins and regret. |
| cryo | cold | Frozen magnesium. Still waiting for someone to bring a flame. |

### 13. Aluminium (Al)

- **Category:** metal (table colour #b9c7d6)
- **Form in the lab:** solid (metal)
- **Sample colour:** #d0d4d8
- **Label tagline:** "Once worth more than gold. Now wraps your sandwich."
- **Intro caption:** Aluminium. Emperors once ate off it to show off. You threw some away at lunch.
- **Discoveries:** See if it conducts (zap station); Drop it in the tank (water station); Bite it like foil (mic station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | Crunch. That is the sound of a balloon learning about density. |
| burner | none | It just gets warm. Aluminium grows invisible oxide armour in nanoseconds. |
| zap (discovery) | spark | Superb conductor. Most power lines are made of this stuff. |
| water (discovery) | sink | It sinks, perfectly safe behind its oxide layer. Smug. |
| mic (discovery) | undefined (lick) | You bit the foil. Every filling you own just screamed. |
| cryo | cold | Aluminium gets stronger when it is cold. That is why rockets use it for fuel tanks. |

### 14. Silicon (Si)

- **Category:** metalloid (table colour #7fe3b0)
- **Form in the lab:** solid (metal)
- **Sample colour:** #56616e
- **Label tagline:** "Sand with a computer science degree."
- **Intro caption:** Silicon. It is a beach, a window and the brain of the device you are holding.
- **Discoveries:** See if it conducts (zap station); Hold it in the flame (burner station); Stuff it in a balloon (balloon station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | rock | You have made a very small, very sad sandbag. |
| burner (discovery) | none | Nope. Melts at 1414 °C. Your flame is adorable. |
| zap (discovery) | spark | It conducts... sometimes. That "sometimes" runs every computer on Earth. |
| water | sink | It is a fancy rock. It sinks like one. |
| mic | undefined (lick) | Crunchy. You are eating a future microchip. |
| cryo | cold | Chilled silicon. Computer chips love this. Some people do it to theirs for fun. |

### 15. Phosphorus (P)

- **Category:** nonmetal (table colour #7fd6ff)
- **Form in the lab:** solid (waxy)
- **Sample colour:** #e9e2b8
- **Label tagline:** "Discovered by a man boiling his own pee. True story."
- **Intro caption:** Phosphorus. Found in 1669 by an alchemist boiling down buckets of urine hoping for gold. He got something that glows instead.
- **Discoveries:** Drop it in the tank (water station); Hold it in the flame (burner station); See if it conducts (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | The balloon is smoking slightly. That is not a feature. |
| burner (discovery) | roar (smoke) | It caught fire before it even reached the flame. Overachiever. |
| zap (discovery) | none | No conduction. It is too busy plotting. |
| water (discovery) | glowsink | It sits underwater and glows. This is its happy place. Leave it there. |
| mic | undefined (lick) | NO LICKING. This one is not a bit. This one is in matches and worse. |
| cryo | cold | Cold slows phosphorus down. It has stopped smoking. Do not trust it. |

### 16. Sulfur (S)

- **Category:** nonmetal (table colour #7fd6ff)
- **Form in the lab:** solid
- **Sample colour:** #f0d21c
- **Label tagline:** "Smells fine. Its friends smell terrible."
- **Intro caption:** Sulfur. Bright yellow, totally odourless on its own, and blamed for everything.
- **Discoveries:** Hold it in the flame (burner station); See if it conducts (zap station); Drop it in the tank (water station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | rock | A yellow rock in a balloon. Art. |
| burner (discovery) | tint (colour #3a5cff) | An eerie blue flame, and a smell that will follow you home. |
| zap (discovery) | none | Zero conduction. Sulfur is the world's smelliest insulator. |
| water (discovery) | sink | It sinks and does not dissolve. It is just visiting. |
| mic | undefined (lick) | Tastes like a struck match. Rotten eggs are next in line. |
| cryo | cold | Frozen sulfur goes brittle and snaps like chalk. |

### 17. Chlorine (Cl)

- **Category:** halogen (table colour #f5ee6a)
- **Form in the lab:** gas
- **Sample colour:** #9bd13a
- **Label tagline:** "The smell of public pools and poor decisions."
- **Intro caption:** Chlorine. Keeps pools clean and was banned from warfare. It contains multitudes.
- **Discoveries:** Fill a balloon with it (balloon station); Bubble it through water (water station); Zap it with high voltage (zap station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon (discovery) | sink | Sinks like a stone. Chlorine is heavy, green and up to no good. |
| burner | tint (colour #7dff5a) | The flame turns a sickly green and looks worried. |
| zap (discovery) | glow (colour #b9ff7a) | A pale green glow. Spooky, but pool-safe. |
| water (discovery) | bubbles | Congratulations, you made pool water. No running. |
| mic | undefined (refuses) | No. The Geneva Protocol has opinions about this. So does the microphone. |
| cryo | cold | Chlorine turns into a yellow-green liquid at −34 °C. It was the first gas anyone ever liquefied. |

### 18. Argon (Ar)

- **Category:** noble (table colour #d59bff)
- **Form in the lab:** gas
- **Sample colour:** #7a5bd1
- **Label tagline:** "The name literally means "lazy"."
- **Intro caption:** Argon. Greek for "lazy". Nearly 1% of the air, and it has never once helped.
- **Discoveries:** Zap it with high voltage (zap station); Introduce it to fire (burner station); Inhale some and speak (mic station)

| Station | Effect | Result text |
| --- | --- | --- |
| balloon | sink | It sinks. Committed to the bit. |
| burner (discovery) | out | Flame out. Welders use argon to stop fire getting ideas. |
| zap (discovery) | glow (colour #b98cff) | A lovely lilac. Lazy, but pretty. |
| water | bubbles | Bubbles, delivered with minimum effort. |
| mic (discovery) | undefined (voice pitch 0.72) | Your voice drops. Argon is heavy, so you get the movie-villain voice. |
| cryo | cold | Argon liquefies at −186 °C, so it actually condensed. The laziest element did something. |

## Station reaction effects

Counts of how often each effect name appears across the 90 station reactions (elements 1 to 18, five stations each):

| Effect | Count |
| --- | --- |
| undefined | 18 |
| rock | 10 |
| sink | 10 |
| glow | 8 |
| none | 8 |
| bubbles | 7 |
| spark | 7 |
| tint | 5 |
| float | 3 |
| boom | 2 |
| out | 2 |
| roar | 2 |
| fizz | 1 |
| ember | 1 |
| hover | 1 |
| eaten | 1 |
| inferno | 1 |
| steam | 1 |
| white | 1 |
| glowsink | 1 |

Effect names and what they do on screen:

- `float`: balloon rises to the ceiling area and stays as a loose floating object.
- `hover`: balloon drifts in the room air.
- `sink`: balloon sinks with a trombone sound.
- `eaten`: balloon shrinks while smoke-like flecks leave.
- `rock`: sample thuds down, bounces, then lands as a chunk.
- `boom`: fireball, shake, soot overlay, and the flame goes out and relights.
- `tint`: the flame changes colour to the element colour for a few seconds.
- `out`: flame goes out with a fizzle and smoke, then relights.
- `roar`: large flame, and optional smoke rising from the burner.
- `ember`: the sample glows orange and then intensifies.
- `white`: blinding white flash and a whiteout overlay.
- `inferno`: fire and alarm, a tinted screen, and a rising flame.
- `none`: nothing visible happens (a cricket chirp in some cases).
- `glow`: the zapper tube lights with the element colour and buzzes.
- `spark`: sparks and zap sounds around the clips.
- `bubbles`: bubbles rise through the water.
- `steam`: steam rises and the water tints yellow.
- `fizz`: fizzing sample with steam and bubbles.
- `sink`: sample sinks with optional bubbles.
- `glowsink`: sample sinks and glows green.
- `pitch`: microphone voice at the given pitch.
- `lick`: the sample is raised to the face and a slurp plays.
- `refuse`: the microphone tilts away with a thud.

## Mixer recipes

34 recipes, out of 34. Keys are the two symbols sorted alphabetically, joined by "+".

| Key | Name | Formula | Effect | Text |
| --- | --- | --- | --- | --- |
| H+O | Water | H₂O | boom | One spark later: water. You just did, with an explosion, what a tap does quietly. |
| H+N | Ammonia | NH₃ | stink | Ammonia. Feeds half the planet as fertiliser. Smells like a cat's revenge. |
| C+H | Methane | CH₄ | stink | Methane. Natural gas, swamp gas, and what cows contribute to the conversation. |
| F+H | Hydrofluoric acid | HF | smoke | It dissolves glass. The flask would like to speak to a manager. |
| Cl+H | Hydrochloric acid | HCl | fizz | Stomach acid. You are carrying about a cup of this right now. |
| H+S | Hydrogen sulfide | H₂S | stink | Rotten eggs. The whole lab now smells like a regret. |
| H+Li | Lithium hydride | LiH | crystal | A grey powder that hoards hydrogen. Astronauts have used it to make gas on demand. |
| Cl+Na | Table salt | NaCl | crystal | An exploding metal plus a poison gas equals... fries seasoning. Chemistry is unhinged. |
| C+O | Carbon dioxide | CO₂ | fizz | Fizzy-drink bubbles. Also what you are exhaling at me right now. |
| N+O | Laughing gas | N₂O | laugh | Nitrous oxide. Ha. Haha. HAHAHA. Okay, why is that funny. |
| O+Si | Silica | SiO₂ | crystal | Sand. Also glass. Also this flask. You have made more flask. |
| Al+O | Alumina | Al₂O₃ | crystal | Add a pinch of chromium and this is a ruby. You are welcome. |
| Mg+O | Magnesium oxide | MgO | glow | A blinding flash, then white powder. Old-timey photographers would applaud. |
| Li+O | Lithium oxide | Li₂O | crystal | A white crust. Lithium does this the moment it meets air, which is why it sulks in oil. |
| C+Si | Silicon carbide | SiC | crystal | Nearly as hard as diamond. It is the grit on your sandpaper. |
| B+N | Boron nitride | BN | crystal | White graphite. Slipperier than your excuses. |
| C+N | Cyanogen | (CN)₂ | smoke | That is cyanide's family. NOPE. The fume hood handled it. Let us never speak of this. |
| O+S | Sulfur dioxide | SO₂ | stink | The smell of volcanoes, struck matches and acid rain. |
| O+P | Phosphorus pentoxide | P₄O₁₀ | smoke | Thick white smoke. Very dramatic. Very not for breathing. |
| F+Na | Sodium fluoride | NaF | crystal | It is in your toothpaste. Two terrors team up to protect your smile. |
| Cl+N | Nitrogen trichloride | NCl₃ | boom | It explodes if you look at it wrong. You looked at it wrong. |
| H+P | Phosphine | PH₃ | stink | Rotting fish with a hint of garlic. Possibly what ghost lights in swamps are made of. |
| H+Si | Silane | SiH₄ | boom | Silane catches fire the instant it touches air. The lab is full of air. |
| B+H | Diborane | B₂H₆ | glow | Tried as rocket fuel in the 1950s. Burned bright green. Clogged every engine. |
| Cl+Mg | Magnesium chloride | MgCl₂ | crystal | Sets tofu and de-ices roads. A real overachiever. |
| Al+Cl | Aluminium chloride | AlCl₃ | smoke | Fumes like mad. Its cousin is in your antiperspirant. You are welcome, everyone near you. |
| F+Li | Lithium fluoride | LiF | crystal | The most reactive metal-ish thing meets the most reactive gas and they form... a calm crystal. Couples therapy works. |
| N+Na | Sodium azide | NaN₃ | boom | The stuff that inflates airbags. BANG. You are now very safe. |
| Li+N | Lithium nitride | Li₃N | crystal | Lithium is the only alkali metal that bothers reacting with nitrogen. Ruby-red result. Fancy. |
| F+O | Oxygen difluoride | OF₂ | boom | You combined the two most aggressive elements you own. What did you think would happen? |
| C+S | Carbon disulfide | CS₂ | stink | Smells like rotting radishes and catches fire from a warm pipe. Lovely. |
| Al+Si | Silumin | Al–Si alloy | crystal | An alloy! This is what engine blocks are cast from. You made a tiny bit of car. |
| Al+Mg | Magnalium | Al–Mg alloy | glow | Lightweight alloy. Also the sparkle in sparklers. |
| F+Si | Silicon tetrafluoride | SiF₄ | smoke | Fluorine just ate the silicon. And is now eyeing the glass flask, which is also silicon. |

## Mixer rules

- A pair with the same element gives a joke line and no compound.
- Hydrogen with helium gives a note with no reaction.
- Any pair with He, Ne or Ar (noble gases) gives a refusal line naming the noble gas.
- Any other pair not in the recipe list gives a "stare at each other" line and no compound.
- A compound is counted the first time it is made. Repeats give no toast.
- The mixer panel shows the number of compounds found out of the total.

## Liquid nitrogen

Each element 1 to 18 has its own cryo line. The sample is lowered into a cold fog, held for about 1.3 seconds, then raised and returned to the trolley. Cryo is not one of the three discoveries.

## Loose objects

These can be grabbed, carried, thrown, dunked, burnt, zapped, frozen and broken.

| Object | Kind | Radius (m) | Starts |
| --- | --- | --- | --- |
| Beakers, flasks, bottles | glass | 0.045 to 0.1 | bench, shelves |
| Mug | ceramic | 0.05 | bench |
| Cactus pot | ceramic | 0.08 | side table |
| Books (5) | paper | 0.05 | bench, shelves |
| Clipboard | paper | 0.04 | side table |
| Cardboard boxes (3) | paper | 0.18 | right side |
| Brass weights (3) | metal | 0.04 to 0.06 | bench |
| Cannonball | metal | 0.13 | floor |
| Microscope | metal | 0.13 | bench |
| Stool | metal | 0.2 | right side |
| Bin | metal | 0.16 | floor |
| Fire extinguisher | metal | 0.13 | wall, pinned |
| Party balloons (5) | balloon | 0.2 | ceiling area, pinned until grabbed |
| Rubber duck | rubber | 0.05 | in the tank |
| Sample | metal (in the physics model), any form | 0.08 solid, 0.13 gas | trolley |

Object types and how they react:

- **glass:** breaks at more than 3.4 m/s. Burning heats it with no change.
- **ceramic:** clinks on impact. Breaks at speed if flagged fragile (mug, cactus).
- **paper:** scorches when burnt and floats in water.
- **metal:** sinks in water, sparks when zapped.
- **rubber:** the duck squeaks on bump and mic, and melts when burnt.
- **balloon:** floats up on buoyancy, pops when burnt.

## Breakage and reactions to objects

- Breaking a glass object shows a glass sound, a burst of sparkles and a screen shake, then the object is hidden for 8 seconds and returns to its home position.
- Freezing an object with liquid nitrogen turns it pale blue and makes it brittle. It shatters at more than 2.4 m/s impact.
- Burning a frozen object thaws it instead of scorching it.
- A balloon burnt in the flame pops with a pop sound.
- Zapping metal sparks; zapping other things does nothing.
- Putting an object in the mic zone squeaks for a duck and does nothing for others.
- Water entry plays a splash and a spray of droplets.
- Object captions are one-time per page load: once an object type has said its line, it stays quiet for the rest of that page load.

## Scene: props, lights and animation

- **Room:** 10.3 m by 9.8 m, ceiling 3.2 m high. Walls and floor have procedural texture with bump and roughness maps.
- **Hallway:** a small corridor behind the door, with a lit ceiling strip.
- **Lights:** a hemisphere light, a spot light casting shadows from the ceiling, a fill point light, a hallway point light, a flame point light at the burner, a zapper point light, and per-reaction flash lights.
- **Ceiling panels:** five panels. The rightmost one flickers at random, with bursts of 0.4 and 2.6 intensity.
- **Fan:** a ceiling fan with four blades turning at 5 rad/s.
- **Clock:** a wall clock with hour, minute and second hands driven by the real time of day.
- **Monitor:** a small live oscilloscope on the side table, redrawn about 8 times a second, with a "SCIENCE LEVEL" readout and a blinking REC tag.
- **Spare robot:** a charging robot in the far corner. Its head turns toward the player.
- **Dewar:** the liquid nitrogen flask emits fog particles about 7 times a second.
- **Mixer:** the liquid rotates slowly, and small bubbles rise while it is in use.
- **Balloons:** party balloons sway, and their strings are attached to a weight.
- **Shelves:** two wall shelves with bottles, beakers and books, in random order.
- **Posters and signs:** a periodic table poster, a whiteboard with jokes, a "SAFETY THIRD" sign, a "DELIVERIES" sign and a "FLAMMABLE" sign on the cabinet.
- **Fire extinguisher:** a red cylinder with an "EMPTY (AGAIN)" tag.
- **Film grain:** an animated grain overlay over the whole screen.
- **Vignette:** a soft dark edge over the scene.

## Sound

All sound is generated with the Web Audio API. There are no audio files.

- Sound effects: click, tap, ding, fanfare, boom, pop, hiss, roar, buzz, zap, fizzle, inflate, inhale, thud, knock, creak, whoosh, splash, bubbles, slurp, trombone, cricket, scratch, stink, alarm, squeak, sparkle, glass, clink, bump.
- Voice: a sawtooth-based gibberish voice whose pitch follows the element (helium high, argon low).
- The sound toggle mutes everything; the setting is saved.
- Audio starts on the first tap or click, because browsers block sound until the player interacts.

## Multiplayer

Multiplayer runs only when the page is opened as a shared Claude artifact with the `room` capability. Anywhere else the game is single-player.

- Each other player appears as a robot in a colour from their own hue.
- Shared presence, sent about 14 times a second: position, facing, pitch, colour and the id and position of any object they are holding.
- Shared events: an object moved or thrown (`obj` topic) and an element attempt (`fx` topic).
- The `obj` and `fx` topics are open to interact-level members, not only admins.
- Other players' held objects are moved toward the holder's hand with a short lag.
- Other players are removed when they leave the lab or disconnect.
- A "N scientists here" badge shows the count.
- Not shared: samples, element reactions, discoveries, saves, and what happens to objects after they move.
- A joining player sees objects where they were last shared, and objects are not re-sent to late joiners.

## Saving and reset

- Storage key: `elements-lab-save-v1` in `localStorage`.
- Saved values: unlocked element number, delivered elements, discoveries per element, cleared elements, compounds found, and the sound setting.
- Reset progress keeps the sound setting.
- If storage is blocked or full, the game still runs and does not save.

## Performance and devices

- Pixel ratio is capped at 2.
- If frames run slower than about 22 per second for a while, the game first lowers the pixel ratio by 0.5 (down to 1), then turns bloom off.
- Tablet layout (coarse pointer, at least 700 px wide and 600 px tall) enlarges buttons, the caption and the dock.
- Phone portrait layout uses smaller type and hides the wide view.
- The game can be added to the home screen on iPad and iPhone through its manifest and touch icon.
- WebGL is required. If it is missing, the page shows a message saying so.

## Glossary

- **Discovery:** one of the three station tests that each element needs to clear it.
- **Trolley:** the metal stand in the middle of the room where your sample waits and where it is returned.
- **Zone:** the trigger area of a station.
- **Hold:** carrying an object with the beam.
- **Compound:** a product made in the mixer.
- **Backorder:** the locked-element label for 19 to 118.

---

# Part 2: R.E.P.O.

## What R.E.P.O. is

From memory, so check it:

- A co-operative multiplayer physics game in which a small team grabs and carries objects in a dark, dangerous facility.
- Most objects are physical, and players can pick up, throw and stack many of them.
- The team collects valuables while threats hunt them.

## To fill in

Each row is a detail I cannot confirm from memory. Fill in the answer, or send a link to the game page and I will complete the table.

### Game basics

| Item | What it should say |
| --- | --- |
| Developer and publisher | |
| Release status and version | |
| Platforms | |
| Player count per lobby | |
| Price and free-to-play status | |
| Current patch number and date | |

### Run structure

| Item | What it should say |
| --- | --- |
| Length of a run | |
| Map or facility names | |
| How a run starts and ends | |
| Win condition | |
| Loss condition | |
| Lobby and join rules | |

### Objective and value

| Item | What it should say |
| --- | --- |
| Quota or goal (amount and how it rises) | |
| How value is calculated | |
| What is worth the most | |
| Extraction point rules | |
| Shared or individual rewards | |

### Physics and carrying

| Item | What it should say |
| --- | --- |
| How grabbing works (distance, strength) | |
| Throwing rules | |
| Weight and carry limits | |
| Which objects break and at what force | |
| Stacking and collision rules | |

### Players

| Item | What it should say |
| --- | --- |
| Health or downed state | |
| Revive or rescue mechanic | |
| Abilities or equipment | |
| Movement speed and stamina | |
| Voice or text chat | |

### Enemies and threats

| Item | What it should say |
| --- | --- |
| Enemy names and types | |
| How each one detects players (sight, sound, light) | |
| Attack behaviour | |
| Ways to avoid or stop them | |
| Which enemies appear in which areas | |

### Items and upgrades

| Item | What it should say |
| --- | --- |
| Item names and effects | |
| Shop or upgrade system | |
| Currency | |
| Unlocks between runs | |

### Controls

| Item | What it should say |
| --- | --- |
| Keyboard and mouse bindings | |
| Controller bindings | |
| Touch controls, if any | |

### Interface and feedback

| Item | What it should say |
| --- | --- |
| HUD elements | |
| Sound design notes | |
| Visual style notes | |

### Differences from this game

| Item | What it should say |
| --- | --- |
| Physics fidelity | |
| Multiplayer design | |
| Progression style | |
| Tone and humour | |

