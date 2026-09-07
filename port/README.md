# NetHack: Descent

A first-person, real-time adaptation of **the NetHack 5.0 source in this repository**. The native C engine supplies dungeon content, objects, characters and rules. A continuous spatial simulation supplies player and creature movement, collision, physical reach and stair traversal; Three.js renders the dungeon.

This is a substantial development build, not a finished commercial game or a claim that every NetHack situation has been playtested. The original content remains available through the engine. The spatial conversion still has the remaining compatibility boundaries described below.

## Play

Double-click **`Play NetHack 3D.cmd`** in the repository root. It starts the local server and opens the game in a standalone Chrome window, or your default browser if Chrome is unavailable. The spatial executable is already built for Windows x64. The earlier build on port 5173 and its runtime are separate; this launcher opens the new build on 5174. Node.js 22 or newer and a browser supporting WebGL 2 are required.

Alternatively, from this directory:

```powershell
npm ci
npm start
```

Open `http://127.0.0.1:5174`. Choose a name, role, race, gender and alignment, then enter the dungeon. Click the view to capture the mouse. Escape releases it. The interface restricts character combinations to valid role/race/alignment combinations.

**Save using Tab → Save → Yes before closing the game.** Continue restores the last character through NetHack's native save system. Closing a browser window does not stop the server's world clock. Fractional body positions and stair height are saved alongside the native save. Save files and scores are in `engine/runtime-spatial/`; keep that directory to keep your expeditions.

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
| E | Open the door in front of you, talk, or pick up at your feet |
| F / T | Fire quivered ammunition / throw an item |
| I | Inventory; select an item, then Wield, Wear, Apply, Drink, Eat, Read or Drop |
| Tab / C | Search the complete engine command registry |
| 1 / 2 / 3 / 4 / 5 / 6 | Wield / cast / zap / quaff / apply / eat |
| Q / R / X | Quaff / read / swap weapons |
| G / K / P / V | Pick up / kick / pray / search |
| Walk along stairs | Follow the left flight, turn on the landing, then follow the return flight to the next floor |
| < / > | Original ascend / descend command shortcuts |
| Arrow keys | Keyboard turning and forward/backward movement |
| Escape | Release mouse, close a panel or cancel the pending command |

Menus accept clicks and their original letter accelerators. Commands whose original letters conflict with WASD remain available in the searchable palette. Directional actions use your facing direction; specialized position selection still uses native eight-way keys. Shields are worn through **Wear** and provide NetHack's original armor protection. Weapon damage, resistances, spell success, wand charges, armor, curses and status effects are resolved by the original engine.

## What is implemented

- Native C engine and Lua dungeon content, inventory, equipment, magic, hunger, branches, quests, death and native save/restore. Spatial build hooks replace ordinary monster and companion locomotion while retaining native combat, pet hunger, food/fetch goals and trap processing.
- A continuously running server clock, independent of browser rendering and open panels. Idle time advances monsters and the rest of the world. Failed movement or free commands cannot freeze the clock. Multi-turn occupations and helplessness are paced too.
- A live inventory and native menu bridge. A displayed command choice is detached from the engine while it waits for a decision. When selected, the command is replayed and its prompt/items are checked again. Changed choices are presented for review instead of applying a stale selection.
- Authoritative 60 Hz movement in metres, with matching client prediction: walking at 3.1 m/s, running at 5.15 m/s and crouching at 1.55 m/s, modified by native haste. Swept circle collision, wall sliding, normalized diagonal speed, door slabs, architectural props and creature bodies. WASD sends analog intent, never grid movement commands.
- Continuous creature steering with route finding, line-of-sight awareness, pursuit memory, pet goals, fleeing, collision and walk animation. Motion and native status updates continue while menus are open.
- Physical melee targeting uses a forward cone, metre-space reach, elevation and obstruction tests, followed by native damage resolution.
- Full-height 4.2 metre stairwells, two flights, a turning landing, treads, rails, masonry and light. Foot elevation follows the flights in both directions. Reaching the final landing invokes the native floor connection with a brief fade.
- Whole-level architectural geometry remains present independent of map exploration. Merged floors, ceilings and walls use consistently scaled masonry textures. Hardware occlusion, torchlight, shadows and distance fog determine the view; discovery flags apply to the map only.
- Procedural stone and wood textures, ceilings and masonry, animated torches, local lights and shadows, fog, dust, branch color variation, fountains, altars, doors, stairs, trees, graves, thrones, bars, lava, water and discovered traps.
- Procedural creature families covering humanoids, quadrupeds, insects, bats, dragons, fungi, slimes, snakes, floating creatures and mimics. Items and wielded weapons have distinct model families.
- A character builder, native command search, live health/power/armor/conditions, message history, an explored minimap and larger map, inventory actions, settings and synthesized dungeon ambience.

All runtime assets are local. There are no CDN, account or hosting requirements.

## Current boundaries

- Player and ordinary creature locomotion are continuous. The native engine still needs coarse compatibility anchors for its existing commands and rules. Spell rays, thrown objects, specialized location prompts, boulder pushing, tunnelling, NPC movement special cases, mounting and engulfment are not yet complete continuous 3D conversions. Shield protection remains native armor rather than active parrying.
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

`npm run test:browser` starts its own isolated QA server and runtime, checks the rendered game in Chrome, then closes that server. It checks fractional movement, crouching, time in inventory, native saving and fractional-position restoration, and captures the game and stairwell under `test-results/`. `npm test` also checks swept collision, diagonal speed, door projection, whole-floor stair traversal in both directions and a real native level change. No tests use the player runtime.

`PORT`, `NETHACK_ENGINE` and `NETHACK_RUNTIME` can override the server port, executable and save/data directory. The server binds only to `127.0.0.1` and accepts same-origin WebSocket connections.

## Architecture

`engine/bridge.c` implements NetHack's existing shim window interface and emits newline-delimited JSON snapshots and input requests. `engine/windmain-bridge.c` adapts the Windows entry point for a headless process and local portable paths. The spatial executable compiles guarded `DESCENT_SPATIAL` hooks in `src/monmove.c`, `src/dogmove.c` and `src/mhitu.c`. Normal upstream builds do not enable those hooks.

`src/spatial.js` owns shared collision, stair dimensions and surface merging. `lib/spatial-simulation.mjs` owns authoritative bodies, steering, native anchor projection and spatial saves.

`lib/native-session.mjs` translates input and manages detached menus. `lib/realtime.mjs` drives wall-clock actions. `server.mjs` owns the engine process, serves the local frontend and transports state over WebSocket. `src/main.js` owns controls, prediction and server reconciliation; `src/renderer.js`, `src/ui.js` and `src/audio.js` present the game.

The engine exposes its regular command registry at runtime. The source-derived fallback in `lib/commands.mjs` supports the interface before engine startup.

## License and provenance

This is a **modified NetHack build**, developed on 2026-09-07; it is not an official NetHack release. The derivative work is distributed under the NetHack General Public License in `../dat/license` and `LICENSE`. Original copyright notices are retained. Three.js and ws are MIT-licensed dependencies; their notices are retained in their installed packages. Build tools retain their respective licenses. The complete NetHack source and port source are in this repository.
