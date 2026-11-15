# Elements Lab: full reference

Generated from `js/data.js`. Elements 1 to 18 are playable; 19 to 118 are shown but locked.

## Contents
1. [Flow](#flow)
2. [Controls](#controls)
3. [Stations](#stations)
4. [Elements 1 to 18](#elements-1-to-18)
5. [Mixer recipes](#mixer-recipes)
6. [Liquid nitrogen reactions](#liquid-nitrogen-reactions)
7. [Loose objects and their reactions](#loose-objects)
8. [Multiplayer](#multiplayer)
9. [Saving and reset](#saving-and-reset)

## Flow
- Start menu: Play, sound on/off, Reset progress (asks first).
- Periodic table: the next element you have not cleared pulses. Tapping a locked cell shows a line; elements 19 to 118 say they are on backorder.
- Entering an element: the first time, you open the lab door (a knock sequence and a thrown package), open the package, and the sample arrives on the trolley. Later visits skip the delivery and place the sample on the trolley.
- Discoveries: each element has three hidden discoveries, shown as `???` until you find them. Finding all three clears the element and unlocks the next one (up to 18), then a popup offers continuing or returning to the table.
- Mixer: needs two different delivered elements you have already unlocked. Mixing the same element with itself is allowed and gives a joke line.

## Controls
Desktop: W/A/S/D or arrow keys walk, drag mouse to look, left click to grab or drop, F or right-click to throw, E to drop, ArrowLeft/ArrowRight turn.
Touch (tablet or phone): left thumb in lower-left 40% of the screen opens a thumbstick; the rest of the screen drags to look; tap to grab; tap again to drop; the Throw button appears while holding.
Other: Sound toggle in the HUD and menu. Pinch and double-tap zoom are blocked. The game lowers resolution, then bloom, if frame time stays high.

## Stations
Equipment is not labelled and is not in a fixed order. Each station has a hit zone; bringing the sample or any loose object into the zone triggers its reaction.

| Station | Where | Zone radius (m) | Notes |
| --- | --- | --- | --- |
| Balloon rig | side table, x ≈ -2.6, z ≈ 1.0 | 0.28 | Inflates the sample into a balloon; a gas on a balloon floats |
| Burner | back bench, x ≈ -2.8, z ≈ -2.55 | 0.26 | Gas flame, tinted by some elements |
| Zapper | side table, x ≈ 2.2, z ≈ 1.6 | 0.30 | High-voltage tube, lever and clip |
| Tank | back bench, x ≈ -0.4, z ≈ -2.55 | 0.32 | Water tank with a rubber duck; loose objects float or sink |
| Microphone | side table, x ≈ 4.0, z ≈ 2.4 | 0.30 | Recording mic; speaks in a voice pitched by the element |
| Mixer | back bench, x ≈ 2.0, z ≈ -2.55 | 0.28 | Flask with a stirrer; mixes two elements |
| Liquid nitrogen dewar | left side, x ≈ -4.2, z ≈ -1.1 | 0.34 | Cold reactions (cryo) |

Station reactions per element are listed in the element tables below.

## Elements 1 to 18

Key: Balloon, Burner, Zapper, Tank, Mic, Mixer, Liquid nitrogen (cryo). Discoveries are the three tasks listed for each element.

### 1. Hydrogen (H)

- Category: nonmetal (colour #7fd6ff)
- Form: gas
- Sample colour: #e23d3d
- Label tagline: "Contains 75% of the universe. Handle accordingly."
- Intro: Hydrogen. One proton, one electron, zero chill. Let's poke it.
- Discoveries (the three that count): Balloon, Burner, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | float | Lightest thing in existence. It left before you finished tying the knot. |
| Burner (discovery) | boom | That was the Hindenburg speedrun. Your eyebrows have been filed under "missing". |
| Zapper (discovery) | glow, colour #ff4fa0 | Pink! Hydrogen glows like a flamingo at a rave. |
| Tank | bubbles | It bubbles straight out. Hydrogen is literally IN water and still wants nothing to do with it. |
| Mic | voice pitch 1.6 | Squeaky AND flammable. Please do not speak near the burner. |
| Liquid nitrogen | cryo | At −253 °C hydrogen finally turns liquid. Your nitrogen only reaches −196. It stays a gas and stays smug. |

### 2. Helium (He)

- Category: noble (colour #d59bff)
- Form: gas
- Sample colour: #b7773c
- Label tagline: "Do not inhale. (You are going to inhale it.)"
- Intro: Helium. Second lightest, first funniest. It refuses to react with anything, including criticism.
- Discoveries (the three that count): Balloon, Mic, Burner

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | float | Up it goes. Party gas, reporting for duty. |
| Burner (discovery) | none | Nothing. Helium is a noble gas. It does not "do" reactions. It has people for that. |
| Zapper | glow, colour #ffb46a | A classy peach glow. Even its plasma is smug. |
| Tank | bubbles | The bubbles rise, unbothered. Helium will not dissolve, on principle. |
| Mic (discovery) | voice pitch 2.3 | You sound like a chipmunk giving a keynote. Science has peaked. |
| Liquid nitrogen | cryo | Helium needs −269 °C to turn liquid, the coldest of anything. Liquid nitrogen is a warm bath to it. |

### 3. Lithium (Li)

- Category: alkali (colour #ff8d6b)
- Form: solid, metal, stored in oil
- Sample colour: #c9ccd1
- Label tagline: "Softest metal. Emotionally and physically."
- Intro: Lithium. A metal so soft you could cut it with a butter knife and so light it floats. It lives in oil because it has trust issues with air.
- Discoveries (the three that count): Tank, Burner, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | You put a rock in a balloon. The balloon is now a paperweight. |
| Burner (discovery) | tint, colour #ff1f3d | Crimson flame! That exact red is in every firework finale. |
| Zapper (discovery) | spark | It conducts! You have invented a worse battery. Your phone uses the better one. |
| Tank (discovery) | fizz | It floats AND fizzes. A metal with the personality of a bath bomb. |
| Mic | lick | You licked it. You feel oddly calm. Please stop licking the elements. |
| Liquid nitrogen | cryo | It is now a very cold soft metal. Still soft. Still has trust issues. |

### 4. Beryllium (Be)

- Category: alkaline (colour #ffc46b)
- Form: solid, metal
- Sample colour: #8d9399
- Label tagline: "Light, strong, toxic. The whole package."
- Intro: Beryllium. Lighter than aluminium, stiffer than steel, and absolutely not a snack.
- Discoveries (the three that count): Tank, Burner, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | Thud. Light for a metal is still heavy for a balloon. |
| Burner (discovery) | none | It just sits there. It melts at 1287 °C. Your burner is a hair dryer to this thing. |
| Zapper (discovery) | spark | Conducts nicely. It is also see-through to X-rays, so it has nothing to hide. |
| Tank (discovery) | sink | Plop. No reaction. Beryllium does not get out of bed for water. |
| Mic | lick | DO NOT. It tastes sweet, and that is the last nice thing it will ever do for you. |
| Liquid nitrogen | cryo | Cold beryllium. Just as toxic, now with frostbite. |

### 5. Boron (B)

- Category: metalloid (colour #7fe3b0)
- Form: solid
- Sample colour: #3a2f2a
- Label tagline: "Not boring. It is boron. Totally different."
- Intro: Boron. Not quite a metal, not quite not. The "it's complicated" of the periodic table.
- Discoveries (the three that count): Burner, Zapper, Balloon

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | rock | Exactly as aerodynamic as it looks. The floor has filed a complaint. |
| Burner (discovery) | tint, colour #3dff5c | Green flame! Boron is why movie witches have such good lighting. |
| Zapper (discovery) | none | Barely a tingle. Boron is a metalloid. It conducts only when it feels like it. |
| Tank | sink | It sinks, then sulks. |
| Mic | lick | Tastes like laundry day. That is the borax talking. Stop licking things. |
| Liquid nitrogen | cryo | Frosty boron. It did not notice. |

### 6. Carbon (C)

- Category: nonmetal (colour #7fd6ff)
- Form: solid
- Sample colour: #1c1c1e
- Label tagline: "Some assembly required: pencil, diamond, or you."
- Intro: Carbon. You are about 18% this. So is your pencil. Try not to make it awkward.
- Discoveries (the three that count): Burner, Zapper, Tank

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | A lump of coal in a balloon. Worst birthday ever. |
| Burner (discovery) | ember | It glows like a barbecue. With enough pressure it would be a diamond. You are not enough pressure. |
| Zapper (discovery) | spark | Graphite conducts. Your pencil has been a wire this whole time. |
| Tank (discovery) | sink | It sinks. Somewhere, a water filter nods with respect. |
| Mic | lick | Tastes like a pencil. You know this because you were once seven. |
| Liquid nitrogen | cryo | Cold carbon. It does not care. It has been through worse inside stars. |

### 7. Nitrogen (N)

- Category: nonmetal (colour #7fd6ff)
- Form: gas
- Sample colour: #2f6fd6
- Label tagline: "78% of every breath. You are soaking in it."
- Intro: Nitrogen. Most of the air, none of the credit.
- Discoveries (the three that count): Balloon, Burner, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | hover | It just... hovers. It is basically air. You have built a balloon full of normal. |
| Burner (discovery) | out | The flame went out. Nitrogen is the fun police. |
| Zapper (discovery) | glow, colour #b05cff | Purple lightning in a tube. Nitrogen finally shows some personality. |
| Tank | bubbles | Bubbles. Scuba divers get these in their blood if they surface too fast. Rise slowly, friend. |
| Mic | voice pitch 1.03 | You sound exactly the same. Deeply disappointing. |
| Liquid nitrogen | cryo | You dipped nitrogen in nitrogen. It condensed into more of the same. Peak efficiency. |

### 8. Oxygen (O)

- Category: nonmetal (colour #7fd6ff)
- Form: gas
- Sample colour: #e8eef2
- Label tagline: "You have been on the free trial since birth."
- Intro: Oxygen. You have been using this your whole life without reading the terms and conditions.
- Discoveries (the three that count): Burner, Balloon, Tank

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | sink | It sinks. Oxygen is heavier than air and, frankly, it is carrying the whole planet. |
| Burner (discovery) | roar | WHOA. Fire loves oxygen. Most toxic relationship in chemistry. |
| Zapper | glow, colour #a9d6ff | A ghostly blue-white. This is also how ozone is made, a.k.a. that thunderstorm smell. |
| Tank (discovery) | bubbles | The fish in this tank would be thrilled. There are no fish. There is a duck. |
| Mic | voice pitch 0.94 | You feel fantastic. Suspiciously fantastic. |
| Liquid nitrogen | cryo | Oxygen turns into a pale blue liquid at −183 °C, and that liquid is magnetic. Really. |

### 9. Fluorine (F)

- Category: halogen (colour #f5ee6a)
- Form: gas
- Sample colour: #d9d24a
- Label tagline: "Reacts with everything. Including this box."
- Intro: Fluorine. The most reactive element there is. It has beef with every atom it has ever met.
- Discoveries (the three that count): Balloon, Tank, Burner

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | eaten | The fluorine ate the balloon. It is not a gas, it is a grudge. |
| Burner (discovery) | inferno | Everything is on fire. Fluorine can ignite water, sand and your hopes. |
| Zapper | glow, colour #eaff7a, smoke | The tube is glowing and also dissolving. We are calling that a pass. |
| Tank (discovery) | steam | The water is... burning? Fluorine does not follow rules. It replaces them. |
| Mic | refuses | NO. The microphone has fainted in protest. |
| Liquid nitrogen | cryo | Fluorine becomes a yellow liquid at −188 °C. It is still angry, just slower. |

### 10. Neon (Ne)

- Category: noble (colour #d59bff)
- Form: gas
- Sample colour: #ff5a2b
- Label tagline: "Open 24 hours."
- Intro: Neon. Famous for exactly one thing and, to be fair, it is very good at it.
- Discoveries (the three that count): Zapper, Balloon, Burner

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | float, slow | It floats. Lazily. Lighter than air but in no hurry about it. |
| Burner (discovery) | none | Nothing. Another noble gas, another refusal to participate. |
| Zapper (discovery) | glow, colour #ff3d14 | THE classic. Every "OPEN" sign and questionable motel owes this glow. |
| Tank | bubbles | Fancy bubbles. They are exactly as useful as regular bubbles. |
| Mic | voice pitch 1.3 | Slightly squeaky. Budget helium. |
| Liquid nitrogen | cryo | Neon holds out until −246 °C. It stays a gas and keeps glowing about it. |

### 11. Sodium (Na)

- Category: alkali (colour #ff8d6b)
- Form: solid, metal, stored in oil
- Sample colour: #d3d6da
- Label tagline: "Keep dry. KEEP. DRY."
- Intro: Sodium. Half of table salt, all of the drama. It ships in oil for reasons you are about to discover.
- Discoveries (the three that count): Tank, Burner, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | Down it goes. At least it stayed dry. |
| Burner (discovery) | tint, colour #ffb020 | Blazing yellow. Every old street lamp on Earth is this colour because of sodium. |
| Zapper (discovery) | spark | Conducts beautifully. It would make great wire if it did not explode in the rain. |
| Tank (discovery) | boom | And THAT is why it ships in oil. The duck has briefly achieved orbit. |
| Mic | lick | Salty? No. That is sodium CHLORIDE. This one just detonates on your tongue. |
| Liquid nitrogen | cryo | Cold sodium. For once it is not exploding. Enjoy the quiet. |

### 12. Magnesium (Mg)

- Category: alkaline (colour #ffc46b)
- Form: solid, metal
- Sample colour: #c2c5c9
- Label tagline: "Burns bright. No, brighter than that."
- Intro: Magnesium. Sits quietly in your vitamins until someone shows it a flame.
- Discoveries (the three that count): Burner, Zapper, Tank

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | Clonk. Magnesium is light, but not "balloon" light. |
| Burner (discovery) | white | MY EYES. Magnesium was the original camera flash, and now it is your whole field of vision. |
| Zapper (discovery) | spark | Conducts well. Nobody is surprised. It is a metal. |
| Tank (discovery) | sink, bubbles | A few lazy bubbles. Magnesium reacts with water the way you reply to emails. |
| Mic | lick | Tastes like vitamins and regret. |
| Liquid nitrogen | cryo | Frozen magnesium. Still waiting for someone to bring a flame. |

### 13. Aluminium (Al)

- Category: metal (colour #b9c7d6)
- Form: solid, metal
- Sample colour: #d0d4d8
- Label tagline: "Once worth more than gold. Now wraps your sandwich."
- Intro: Aluminium. Emperors once ate off it to show off. You threw some away at lunch.
- Discoveries (the three that count): Zapper, Tank, Mic

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | Crunch. That is the sound of a balloon learning about density. |
| Burner | none | It just gets warm. Aluminium grows invisible oxide armour in nanoseconds. |
| Zapper (discovery) | spark | Superb conductor. Most power lines are made of this stuff. |
| Tank (discovery) | sink | It sinks, perfectly safe behind its oxide layer. Smug. |
| Mic (discovery) | lick | You bit the foil. Every filling you own just screamed. |
| Liquid nitrogen | cryo | Aluminium gets stronger when it is cold. That is why rockets use it for fuel tanks. |

### 14. Silicon (Si)

- Category: metalloid (colour #7fe3b0)
- Form: solid, metal
- Sample colour: #56616e
- Label tagline: "Sand with a computer science degree."
- Intro: Silicon. It is a beach, a window and the brain of the device you are holding.
- Discoveries (the three that count): Zapper, Burner, Balloon

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | rock | You have made a very small, very sad sandbag. |
| Burner (discovery) | none | Nope. Melts at 1414 °C. Your flame is adorable. |
| Zapper (discovery) | spark | It conducts... sometimes. That "sometimes" runs every computer on Earth. |
| Tank | sink | It is a fancy rock. It sinks like one. |
| Mic | lick | Crunchy. You are eating a future microchip. |
| Liquid nitrogen | cryo | Chilled silicon. Computer chips love this. Some people do it to theirs for fun. |

### 15. Phosphorus (P)

- Category: nonmetal (colour #7fd6ff)
- Form: solid, waxy
- Sample colour: #e9e2b8
- Label tagline: "Discovered by a man boiling his own pee. True story."
- Intro: Phosphorus. Found in 1669 by an alchemist boiling down buckets of urine hoping for gold. He got something that glows instead.
- Discoveries (the three that count): Tank, Burner, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | The balloon is smoking slightly. That is not a feature. |
| Burner (discovery) | roar, smoke | It caught fire before it even reached the flame. Overachiever. |
| Zapper (discovery) | none | No conduction. It is too busy plotting. |
| Tank (discovery) | glowsink | It sits underwater and glows. This is its happy place. Leave it there. |
| Mic | lick | NO LICKING. This one is not a bit. This one is in matches and worse. |
| Liquid nitrogen | cryo | Cold slows phosphorus down. It has stopped smoking. Do not trust it. |

### 16. Sulfur (S)

- Category: nonmetal (colour #7fd6ff)
- Form: solid
- Sample colour: #f0d21c
- Label tagline: "Smells fine. Its friends smell terrible."
- Intro: Sulfur. Bright yellow, totally odourless on its own, and blamed for everything.
- Discoveries (the three that count): Burner, Zapper, Tank

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | rock | A yellow rock in a balloon. Art. |
| Burner (discovery) | tint, colour #3a5cff | An eerie blue flame, and a smell that will follow you home. |
| Zapper (discovery) | none | Zero conduction. Sulfur is the world's smelliest insulator. |
| Tank (discovery) | sink | It sinks and does not dissolve. It is just visiting. |
| Mic | lick | Tastes like a struck match. Rotten eggs are next in line. |
| Liquid nitrogen | cryo | Frozen sulfur goes brittle and snaps like chalk. |

### 17. Chlorine (Cl)

- Category: halogen (colour #f5ee6a)
- Form: gas
- Sample colour: #9bd13a
- Label tagline: "The smell of public pools and poor decisions."
- Intro: Chlorine. Keeps pools clean and was banned from warfare. It contains multitudes.
- Discoveries (the three that count): Balloon, Tank, Zapper

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon (discovery) | sink | Sinks like a stone. Chlorine is heavy, green and up to no good. |
| Burner | tint, colour #7dff5a | The flame turns a sickly green and looks worried. |
| Zapper (discovery) | glow, colour #b9ff7a | A pale green glow. Spooky, but pool-safe. |
| Tank (discovery) | bubbles | Congratulations, you made pool water. No running. |
| Mic | refuses | No. The Geneva Protocol has opinions about this. So does the microphone. |
| Liquid nitrogen | cryo | Chlorine turns into a yellow-green liquid at −34 °C. It was the first gas anyone ever liquefied. |

### 18. Argon (Ar)

- Category: noble (colour #d59bff)
- Form: gas
- Sample colour: #7a5bd1
- Label tagline: "The name literally means "lazy"."
- Intro: Argon. Greek for "lazy". Nearly 1% of the air, and it has never once helped.
- Discoveries (the three that count): Zapper, Burner, Mic

| Station | Effect | Result text |
| --- | --- | --- |
| Balloon | sink | It sinks. Committed to the bit. |
| Burner (discovery) | out | Flame out. Welders use argon to stop fire getting ideas. |
| Zapper (discovery) | glow, colour #b98cff | A lovely lilac. Lazy, but pretty. |
| Tank | bubbles | Bubbles, delivered with minimum effort. |
| Mic (discovery) | voice pitch 0.72 | Your voice drops. Argon is heavy, so you get the movie-villain voice. |
| Liquid nitrogen | cryo | Argon liquefies at −186 °C, so it actually condensed. The laziest element did something. |

## Mixer recipes

34 recipes (of 34 stored). Keys are the two symbols alphabetically, joined by "+".

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

Mixer rules not in the table:
- Mixing an element with itself gives a joke line and no compound.
- Helium with hydrogen gives no reaction (a note about it).
- Any pair containing He, Ne or Ar (noble gases) gives a refusal line.
- Any other pair gives a "stare at each other" line.
- Each compound is counted once, the first time it is made.

## Liquid nitrogen reactions

Each element has its own cryo line. Cold effects: the sample is lowered into a fog, held, then returned to the trolley. The lines are listed in the element tables above.

## Loose objects

Objects you can pick up: glassware (beakers, flasks, bottles), books, brass weights, a cannonball, cardboard boxes, a cactus pot, a clipboard, a microscope, a mug, a stool, the bin, the fire extinguisher, balloons, the rubber duck. Party balloons float; the duck floats.

| Object | Kind | Notes |
| --- | --- | --- |
| Glassware | glass | breaks at speed; burn heats and fogs; freezing then dropping shatters |
| Balloons | balloon | float up; pop if burnt; frozen balloons shrink |
| Duck | rubber | squeaks on bump and mic; melts when burnt |
| Books, clipboard, cardboard | paper | scorch when burnt; float on water |
| Cannonball, weights, microscope, stool, bin, extinguisher | metal | sink in water; sparks when zapped |
| Mug, cactus | ceramic | breaks at speed (cactus, mug) |

Sample: carried to a station, it triggers that station reaction. Gas samples are shown as a sealed cylinder; solid samples are a lumpy chunk inside a jar.

## Multiplayer

- Works only when the page runs as a shared Claude artifact with the `room` capability. Elsewhere it is single-player.
- Each player appears as a robot with a colour and a screen face.
- Shared: position, facing, carried object id and its position, and the object positions when thrown or dropped.
- Not shared: samples, element reactions (only a message that someone is trying an element), discoveries and saves.
- A player who joins late sees objects in their starting places until they are moved.

## Saving and reset

- Progress is stored in the browser (`localStorage`): unlocked elements, delivered elements, discoveries, cleared elements and compounds.
- Reset progress wipes saves and keeps the sound setting.
- If storage is blocked, the game still runs but does not save.

