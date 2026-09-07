# NetHack: Descent

A playable first-person, real-time **window port of the NetHack 5.0 source in this repository**. The actual C game runs locally. Three.js presents its explored map, monsters, equipment and messages in a torchlit 3D dungeon. There is no replacement dungeon simulator or fabricated item database.

This is a substantial development build, not a finished commercial game or a claim that every NetHack situation has been playtested. The complete original rules and content run in the engine; the spatial presentation and real-time adaptation have limitations described below.

## Play

Double-click **`Play NetHack 3D.cmd`** in the repository root. It starts the local server and opens the game in a standalone Chrome window, or your default browser if Chrome is unavailable. The executable is already built for Windows x64. Node.js 22 or newer and a browser supporting WebGL 2 are required.

Alternatively, from this directory:

```powershell
npm ci
npm start
```

Open `http://127.0.0.1:5173`. Choose a name, role, race, gender and alignment, then enter the dungeon. Click the view to capture the mouse. Escape releases it. The interface restricts character combinations to valid role/race/alignment combinations.

**Save using Tab → Save → Yes before closing the game.** Continue restores the last character through NetHack's native save system. Closing a browser window does not stop the server's world clock. Save files and scores are in `engine/runtime/`; keep that directory to keep your expeditions.

## Controls

| Input | Action |
| --- | --- |
| Mouse | Look in any direction |
| W A S D | Walk relative to the direction you are facing |
| Shift | Run |
| Control | Crouch; lowers your view and slows movement |
| Left mouse / Space | Attack toward the crosshair with your wielded weapon |
| Right mouse / Z | Choose a spell to cast |
| Shift+Z | Zap a wand |
| E | Open a door, take stairs, talk, or pick up at your feet |
| F / T | Fire quivered ammunition / throw an item |
| I | Inventory; select an item, then Wield, Wear, Apply, Drink, Eat, Read or Drop |
| Tab / C | Search the complete engine command registry |
| 1 / 2 / 3 / 4 / 5 / 6 | Wield / cast / zap / quaff / apply / eat |
| Q / R / X | Quaff / read / swap weapons |
| G / K / P / V | Pick up / kick / pray / search |
| < / > | Ascend / descend |
| Arrow keys | Keyboard turning and forward/backward movement |
| Escape | Release mouse, close a panel or cancel the pending command |

Menus accept clicks and their original letter accelerators. Commands whose original letters conflict with WASD remain available in the searchable palette. Directional actions use your facing direction; specialized position selection still uses native eight-way keys. Shields are worn through **Wear** and provide NetHack's original armor protection. Weapon damage, resistances, spell success, wand charges, armor, curses and status effects are resolved by the original engine.

## What is implemented

- The compiled original C engine, Lua dungeon content, monster AI, hunger, inventory, equipment, magic, shops, companions, traps, stairs, branches, quests, death and native save/restore.
- A continuously running server clock, independent of browser rendering and open panels. Idle time advances monsters and the rest of the world. Failed movement or free commands cannot freeze the clock. Multi-turn occupations and helplessness are paced too.
- A live inventory and native menu bridge. A displayed command choice is detached from the engine while it waits for a decision. When selected, the command is replayed and its prompt/items are checked again. Changed choices are presented for review instead of applying a stale selection.
- Mouse look, smooth camera transitions, walking/running/crouching, eight-direction aiming, melee animation, ranged/spell presentation and damage feedback.
- Procedural stone and wood textures, ceilings and masonry, animated torches, local lights and shadows, fog, dust, branch color variation, fountains, altars, doors, stairs, trees, graves, thrones, bars, lava, water and discovered traps.
- Procedural creature families covering humanoids, quadrupeds, insects, bats, dragons, fungi, slimes, snakes, floating creatures and mimics. Items and wielded weapons have distinct model families.
- A character builder, native command search, live health/power/armor/conditions, message history, an explored minimap and larger map, inventory actions, settings and synthesized dungeon ambience.

All runtime assets are local. There are no CDN, account or hosting requirements.

## Current boundaries

- **Logical positions, collision and combat still use NetHack's grid and original attack rules.** The camera and animations are smooth, but this is a real-time adaptation of the original simulation, not a physics-based free-movement or hitbox-combat rewrite. Run changes the cadence of movement actions; crouch changes camera height and pace, not enemy line-of-sight rules. Shield protection is passive original armor, not a new parry system.
- Monsters share procedural model families. There are not hundreds of bespoke rigged creature models, unique artifact art, animation sets or authored environments for every special level.
- Complex native multi-stage prompts use cancel-and-replay. This is tested for inventory, equipment, spell selection and saving, but every possible interaction has not been audited for partial side effects. Some exceptional uncancellable native prompts can still require an answer before the simulation can proceed.
- Terrain is shown from explored memory. Special presentation for engulfment, underwater vision, mounts, flying, boulder pushing and other rare states needs further work. The original engine still resolves those mechanics.
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

With the local server running, `node scripts/browser-smoke.mjs` tests the rendered game in Chrome: startup, real WASD movement, crouching, live inventory time, wielding, save, and continue. It creates isolated QA characters in the runtime directory and captures screenshots under `test-results/`. Tests against the native engine use their own isolated directories.

`PORT`, `NETHACK_ENGINE` and `NETHACK_RUNTIME` can override the server port, executable and save/data directory. The server binds only to `127.0.0.1` and accepts same-origin WebSocket connections.

## Architecture

`engine/bridge.c` implements NetHack's existing shim window interface and emits newline-delimited JSON snapshots and input requests. `engine/windmain-bridge.c` adapts the Windows entry point for a headless process and local portable paths. All gameplay source in `src/` remains unchanged.

`lib/native-session.mjs` translates input and manages detached menus. `lib/realtime.mjs` drives wall-clock actions. `server.mjs` owns the engine process, serves the local frontend and transports state over WebSocket. `src/main.js` owns controls and authoritative camera targets; `src/renderer.js`, `src/ui.js` and `src/audio.js` present the game.

The engine exposes its regular command registry at runtime. The source-derived fallback in `lib/commands.mjs` supports the interface before engine startup.

## License and provenance

This is a **modified NetHack build**, developed on 2026-09-07; it is not an official NetHack release. The derivative work is distributed under the NetHack General Public License in `../dat/license` and `LICENSE`. Original copyright notices are retained. Three.js and ws are MIT-licensed dependencies; their notices are retained in their installed packages. Build tools retain their respective licenses. The complete NetHack source and port source are in this repository.
