# NetHack: Descent

A first-person, real-time adaptation of **the NetHack 5.0 source in this repository**. The native C engine supplies dungeon content, objects, characters and rules. A continuous spatial simulation supplies player and creature movement, collision, physical reach and stair traversal; Three.js renders the dungeon.

This is a substantial development build, not a finished commercial game or a claim that every NetHack situation has been playtested. The original content remains available through the engine. The spatial conversion still has the remaining compatibility boundaries described below.

## Play

Double-click **`Play NetHack 3D.cmd`** in the repository root. It starts the local server and opens the game in a standalone Chrome window, or your default browser if Chrome is unavailable. The polished executable is already built for Windows x64. This launcher opens version 0.6 on port 5177; the earlier builds on 5173–5176 and their save directories remain separate. Node.js 22 or newer and a browser supporting WebGL 2 are required.

Alternatively, from this directory:

```powershell
npm ci
npm start
```

Open `http://127.0.0.1:5177`. Choose a name, role, race, gender and alignment, then enter the dungeon. Click the view to capture the mouse. Escape opens the Expedition menu, with settings, all controls, a field guide, command search and save/resume actions. The interface restricts character combinations to valid role/race/alignment combinations.

**Save using Tab → Save → Yes before closing the game.** Continue restores the last character through NetHack's native save system. Closing a browser window does not stop the server's world clock. Fractional body positions and stair height are saved alongside the native save. Settings → New run saves the current expedition before opening character creation. Starting again with the same name moves its old native and spatial saves into a dated `archive/` folder in the runtime directory, with character metadata, rather than overwriting them. Continue selects the most recent expedition; archived saves currently require manual restoration. Save files and scores are in `engine/runtime-polished-v06/`; keep that directory to keep your expeditions.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look in any direction |
| W A S D | Walk relative to the direction you are facing |
| Shift | Run |
| Control | Crouch; lowers your view and slows movement |
| Left mouse | Attack toward the crosshair with your wielded weapon |
| Space | Jump; a short physical hop with wall collision |
| M | Raise/lower the parchment map; look down to read it |
| F / Z | Choose a spell by letter while continuing to aim with the mouse |
| Hold right mouse | Defend with your shield or wielded weapon |
| B | Zap a wand |
| E | Pick up the nearby object you are facing, open a door or interact |
| C / T | Fire quivered ammunition / throw an item |
| I | Inventory; select an item, then Wield, Wear, Apply, Drink, Eat, Read or Drop |
| Tab | Search the complete engine command registry |
| 1 / 2 / 3 / 4 / 5 / 6 | Wield / cast / zap / quaff / apply / eat |
| Q / R / X | Quaff / read / swap weapons |
| G / K / P / V | Pick up / kick / pray / search |
| Walk along stairs | Follow the left flight, turn on the landing, then follow the return flight to the next floor |
| Tab → Ascend / Descend | Original stair commands |
| Arrow keys | Keyboard turning and forward/backward movement |
| F10 | Enter or leave true fullscreen; also available in Settings |
| Escape | Open the Expedition menu; cancel a pending choice. From any open menu, close it and return to play |

In Chrome/Edge, ordinary Escape opens Settings while remaining fullscreen, using the browser’s Escape keyboard capture permission. F10 exits fullscreen. Holding Escape still invokes the browser’s emergency exit; browsers without Keyboard Lock may also exit fullscreen on a short press.

Each physical key has one gameplay binding. Menus own their displayed letter accelerators while open; holding a menu key cannot start walking after closing it. Releasing one movement key preserves other held directions. Attacks are acknowledged and briefly buffered while the native engine is busy, and holding an attack key does not queue repeated swings. Inventory selections follow object IDs if letters change; missing objects are rejected.

**To enter a command: press Tab, type its name, then press Enter or click a result.** Exact command names rank first. The Expedition menu also has an Open commands button. Menus accept clicks and their original letter accelerators. Commands whose original letters conflict with WASD remain available in the searchable palette. Directional actions use your facing direction; specialized position selection still uses native eight-way keys. Shields are worn through **Wear** and provide NetHack's original armor protection. Holding right mouse raises a shield for an additional bonus equal to its native armor contribution (including enchantment), or gives one extra point of armor with a wielded weapon. Releasing right mouse, opening a menu or losing focus lowers the guard. Weapon damage, resistances, spell success, wand charges, armor, curses and status effects are resolved by the original engine.

## What is implemented

- Native C engine and Lua dungeon content, inventory, equipment, magic, hunger, branches, quests, death and native save/restore. Spatial build hooks replace ordinary monster and companion locomotion while retaining native combat, pet hunger, food/fetch goals and trap processing.
- A continuously running server clock, independent of browser rendering and open panels. Idle time advances monsters and the rest of the world. Failed movement or free commands cannot freeze the clock. Multi-turn occupations and helplessness fade the view to black, simulate their native turns at accelerated pace, then fade back in. Hunger, damage and creatures still advance. Traps and overloading keep their visible controls because they require a player action to resolve.
- A live inventory and native menu bridge. Equipment and item commands immediately use native valid-choice menus. Spell, wand and throw menus are translucent keyboard lists that preserve mouse capture; the selected effect uses the aim at selection time. Scroll longer lists with the wheel. A displayed command choice is detached from the engine while it waits for a decision. When selected, the command is replayed and its prompt/items are checked again. Changed choices are presented for review instead of applying a stale selection.
- Authoritative 60 Hz movement in metres, with matching client prediction: walking at 3.1 m/s, running at 5.15 m/s and crouching at 1.55 m/s, modified by native haste and carrying capacity. Burdened, Stressed, Strained and Overtaxed multiply speed by 0.75, 0.5, 0.25 and 0.125; Overloaded prevents movement. Swept circle collision, wall sliding, normalized diagonal speed, door slabs, architectural props and creature bodies. WASD sends analog intent, never grid movement commands.
- Continuous creature steering with route finding, line-of-sight awareness, pursuit memory, pet goals, fleeing, collision and walk animation. Normal-speed hostile creatures can match the player’s run; native fast/slow creature speeds remain distinct. Motion and native status updates continue while menus are open.
- Physical melee targeting uses a forward cone, metre-space reach, elevation and obstruction tests, followed by native damage resolution.
- Full-height 4.2 metre stairwells, two flights, a turning landing, treads, rails, masonry and light. Foot elevation follows the flights in both directions. Reaching the final landing invokes the native floor connection with a brief fade.
- Whole-level architectural geometry remains present independent of map exploration. Merged floors, ceilings and walls use consistently scaled masonry textures. Hardware occlusion, torchlight, shadows and distance fog determine the view; discovery flags remain available to native commands.
- Layered stone color and relief textures, wood grain, ceilings and masonry, animated torches, local lights and shadows, fog, dust, branch color variation, fountains, altars, doors, stairs, trees, graves, thrones, bars, lava, water and discovered traps.
- Procedural creature families covering humanoids, quadrupeds, insects, bats, dragons, fungi, slimes, snakes, floating creatures and mimics. Human-sized creatures stand roughly as tall as the player; large creatures and major bosses fill much of a corridor. Legs and arms respond to movement, and native attack events drive visible strikes and lunges, including misses. Armor slots, tools, food, projectiles and weapons use appearance-aware models so unidentified equipment does not reveal its hidden magical identity.
- A compact top-left status panel with health, power, level, XP, hunger, carrying status and gold, plus a compass and the existing chronicle. M raises an animated, curved parchment sheet in the first-person view. It captures discovered native symbols, dungeon depth and elapsed expedition time when opened. Reopen it to refresh the sketch. The corner map, corner timer, center pickup notifications and interaction text are removed; nearby targeted pickups highlight their own models. Recent chronicle messages fade out. Inventory, native command search and settings remain available on demand.
- Sealed unused stair lanes at both floor entrances; dust stays inside walkable dungeon geometry. Torch pool transitions, blindness and first-person lighting ease smoothly. Deterministic room themes place crypt niches, ossuaries, armored reliefs, ruined storage, weapon racks, violet banners, runestones, mushrooms and roots along walls. Cloth, chains, roots, water trickles and faint wisps move subtly; static dressing is instanced to limit draw calls. Spacing and density limits leave larger quiet stretches between clusters. Small scattered debris and overhead details also dress room interiors. The Gnomish Mines use earthier rough rock, timber supports and ore; Sokoban has cool geometric inlays and clear puzzle floors; Gehennom gains obsidian and embers, and Astral levels use pale stone and suspended banners. These visual details leave routes and stair approaches clear.
- A cool slate/violet palette, voxel-shaped creatures and props, pixel-scale stone relief, physically shaded surfaces and localized torchlight. Longswords have longer, dull steel blades, a raised windup, a downward cut into the scene and a low follow-through; first-person hands and arms are removed. Other weapon families retain appropriate slashing/thrusting motions. Creatures flash red on actual native HP loss or death, and player damage produces a red screen vignette.
- Stable, separated floor objects with direct targeting and collision-aware placement. Walking onto a pile no longer opens a chronicle window. Successful native pickups, throws and wand use emit explicit feedback events.
- Soft stereo dungeon air, low stone creaks, non-tonal water sounds, subdued torch noise, grounded footsteps, weapon whooshes, impacts and pickup sounds. Piercing footstep hiss and incidental chimes are removed; two low-pass stages soften the full mix. All audio is synthesized locally and starts on a user gesture.

All runtime assets are local. There are no CDN, account or hosting requirements.

## Current boundaries

- Player and ordinary creature locomotion are continuous. The native engine still needs coarse compatibility anchors for its existing commands and rules. Spell rays, thrown objects, specialized location prompts, boulder pushing, tunnelling, NPC movement special cases, mounting and engulfment are not yet complete continuous 3D conversions. Held defense modifies native armor class; directional hitbox parries and timed perfect blocks are not implemented.
- The physical jump is a short hop. It retains wall/prop collision and native trap anchoring; it does not replace NetHack’s special `#jump` ability or implement airborne projectile hitboxes.
- Stair flights are physical, but connected native levels are loaded one at a time at the final landing. This is not a single simultaneously simulated stack of every dungeon floor.
- Monsters share procedural model families. There are not hundreds of bespoke rigged creature models, unique artifact art, animation sets or authored environments for every special level.
- Complex native multi-stage prompts use cancel-and-replay. This is tested for inventory, equipment, spell selection and saving, but every possible interaction has not been audited for partial side effects. Some exceptional uncancellable native prompts can still require an answer before the simulation can proceed.
- The current native build and launcher target Windows x64. A web browser is the renderer, but the game requires the local Node server and native executable; it is not a standalone hosted browser game.
- No full ascension playthrough, long-duration balance pass, performance certification or comprehensive accessibility pass has been completed.

## Development

```powershell
# Static ES modules, useful while editing:
node server.mjs --dev

# Build the production frontend:
npm run build

# Unit tests and tests against the actual native engine:
npm test

# Rebuild the native bridge using existing core objects:
powershell -ExecutionPolicy Bypass -File engine/build.ps1 -BridgeOnly

# Build the original core and the native bridge:
powershell -ExecutionPolicy Bypass -File engine/build.ps1
```

The native build uses Visual Studio C++ Build Tools. The script finds them with `vswhere`, with a fallback for the installed VS 2019 toolchain. Set `NETHACK_VCVARS` to another `vcvars64.bat` if necessary. Microsoft SDK NuGet packages are pinned and SHA-256 checked, and extracted locally under `.tools/sdk/`. The upstream NMake build supplies Lua and the game's generated data.

`npm run test:browser` runs five browser suites with isolated QA servers and runtimes, then closes them. It checks fractional movement, crouching, time in inventory, native saving and fractional-position restoration, and captures the game and stairwell under `test-results/`. `npm test` also checks swept collision, diagonal speed, door projection, whole-floor stair traversal in both directions and a real native level change. The polish suite also exercises true fullscreen, input repeat, overlapping movement keys, live inventory, direct floor pickup and attack acknowledgments. A separately labeled presentation fixture verifies isolated red flashes, the damage overlay, physical stair caps, fixed dust and weapon motion. The dark-fantasy presentation suite checks all four dressing families and their motion, the full longsword attack, the absence of hands/arms and gradual lighting transitions. Escape, browser pointer release, the guide, controls and exact command entry are tested in the live game. The combat suite verifies Escape in fullscreen, Space casting, held shield armor, focus-safe guard release, removal of corner icons and saving/archiving before a new run. The native tests check shield and weapon armor bonuses, encumbrance, and movement-speed ratios. Presentation fixtures cover branch palettes and build 385 source-catalog item models; this catches missing geometry and classification failures, not every possible visual detail. The immersion suite verifies native armor blackouts, physical jumping, map discovery and frozen timestamps, pickup highlighting, keyboard casting/throwing with captured aim, and Escape closing menus. Native tests also exercise eating and paralysis. No tests use the player runtime.

`PORT`, `NETHACK_ENGINE` and `NETHACK_RUNTIME` can override the server port, executable and save/data directory. The server binds only to `127.0.0.1` and accepts same-origin WebSocket connections.

## Architecture

`engine/bridge.c` implements NetHack's existing shim window interface and emits newline-delimited JSON snapshots and input requests. `engine/windmain-bridge.c` adapts the Windows entry point for a headless process and local portable paths. The spatial executable compiles guarded `DESCENT_SPATIAL` hooks in `src/monmove.c`, `src/dogmove.c`, `src/mhitu.c`, `src/mon.c`, `src/pickup.c`, `src/dothrow.c` and `src/zap.c` and `src/do_wear.c`. Normal upstream builds do not enable those hooks.

`src/spatial.js` owns shared collision, stair dimensions and surface merging. `lib/spatial-simulation.mjs` owns authoritative bodies, steering, native anchor projection and spatial saves.

`lib/native-session.mjs` translates input and manages detached menus. `lib/realtime.mjs` drives wall-clock actions; `lib/action-queue.mjs` buffers and validates commands. `src/input.js` owns exclusive physical bindings. `src/loot.js` shares floor-object layout and targeting between rendering and the server; `lib/feedback.mjs` detects native health changes. `server.mjs` owns the engine process, serves the local frontend and transports state over WebSocket. `src/main.js` owns controls, prediction and server reconciliation; `src/renderer.js`, `src/ui.js` and `src/audio.js` present the game. `src/voxel.js` generates closed voxel meshes and deterministic wall dressing; `src/presentation.js` supplies continuous weapon poses.

The engine exposes its regular command registry at runtime. The source-derived fallback in `lib/commands.mjs` supports the interface before engine startup.

## License and provenance

This is a **modified NetHack build**, developed on 2026-09-07; it is not an official NetHack release. The derivative work is distributed under the NetHack General Public License in `../dat/license` and `LICENSE`. Original copyright notices are retained. Three.js and ws are MIT-licensed dependencies; their notices are retained in their installed packages. Build tools retain their respective licenses. The complete NetHack source and port source are in this repository.
