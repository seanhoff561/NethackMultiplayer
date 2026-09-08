# Native window bridge

## Cooperative transport

Cooperative browsers connect to `/party`; native solo broadcasts never enter that socket. `party-create` / `party-join` establish a server-owned room with at most four characters. `party-joined` returns an individual ID and a secret reconnect token only to its owner. Tokens must not be shared with invitation codes. `party-roster` carries public identities and voice readiness. Existing `input`, `action`, `jump`, `defend`, `release`, `answer` and `cancel` messages are scoped by the WebSocket's authenticated character, never a client-supplied player ID. Private `snapshot` packets contain only that character's inventory and discovered map; `motion.players` contains public party positions, equipment, animation state and floor IDs. Projectiles have server-owned IDs and positions. Voice signaling is accepted only between enabled voice participants in the same room; `from` is assigned by the server. Invalid, repeated, unavailable or out-of-reach actions are rejected with `action-status`.

`lib/party-dungeon.mjs` uses an isolated native process for floor generation only. `lib/party-simulation.mjs` owns cooperative rules and shared world state; it never attempts to swap the native engine's global hero. Cooperative save files include versioned content and all characters/floors. See the README's cooperative compatibility boundary.

The engine executable reads stdin and writes stdout. Both streams are line-delimited; stdout is JSON and stdin is a small text protocol. stderr is diagnostic output. All strings in stdout are JSON escaped.

## Engine events

- `commands`: regular compiled command names, descriptions, native key codes and general-action flags.
- `snapshot`: `width`, `height`, `turn`, `actionSerial`, `levelId`, `player`, `tiles`, `actors`, `spatialSerial`, `inventory`, and the last 40 `messages` with sequence IDs. `actionSerial` counts time-consuming hero actions separately from dungeon rounds, preserving the engine's speed and haste rules.
- `request`: `kind` is `command`, `key`, `menu`, `text`, `yn`, `extcmd`, or `display`. Includes `prompt`; menus include `how` (0 display, 1 single, 2 multiple) and `items` with `id`, `key`, `text`, `selectable`. Yes/no requests may contain `choices` and `default`.
- `document`: `title` and text `lines` for native help files.
- `message`: text emitted through native raw-print callbacks.
- `ended`: the window port has exited. The server waits for process termination and checks the native save file before announcing save completion.

Snapshots expose the full level structure, with `seen` and `explored` flags kept for cartography. Secret doors and corridors retain their concealed wall/stone form. The separate `actors` array supplies persistent IDs, native anchors, speed, mobility, visibility, faction and pet goals; lighting and occlusion determine what is on screen. Hidden and invisible creatures remain filtered. Object and inventory naming uses native naming APIs. Inventory names are player-facing `doname` strings, including identification and equipped state. The core remains authoritative.

## Inputs

```text
k 104          # key code: h / west
k 27           # Escape
t Elbereth     # line of text
m 3,5          # native menu item IDs
m              # cancel a native menu
x pray         # extended command name
p 800          # update occupation pacing, milliseconds
v 1 0 1 31.2 16.8 0 10 5  # sequence, dungeon, level, x/z/foot metres, legacy anchor x/y
n 39 32.1 17.2 0 1        # monster ID, continuous x/z/foot metres, unobstructed melee flag
a 39                      # spatial melee target; zero is a miss
```

There are no JSON comments on the wire; comments above explain the examples. Input text must not contain embedded newlines. `p`, `v` and `n` are controls consumed without answering the pending prompt or spending a movement turn. `v` is scoped to a level to reject stale input after transitions. Crossing a compatibility anchor processes native spot effects. `a` performs native melee against an in-range actor and spends an action. The port disables native safe-wait refusal so nearby danger cannot freeze idle time. Ordinary inputs answer exactly one request.

The Node adapter cancels a displayed menu back to command input, retaining an input journal for replay. It compares prompt kinds, text, choices and selectable item IDs/text before submitting a saved response. Free overlays need no engine input. Blocking occupations bypass command input, so the bridge paces the core's event callback as those actions advance.


## Browser/server spatial stream

The browser sends `input` with normalized `forward`/`strafe`, `yaw`, `run` and `crouch`. The server simulates fixed 1/60-second steps and broadcasts `motion` about 30 times per second: `levelId`, `time`, `player` and `actors` in metres, plus `blocked` and `transition`. Input expires after 300 ms without a refresh. Closing a panel or releasing pointer lock clears movement without stopping the simulation.

Native anchor projection is separate from physical position, including doorway approaches and multiple bodies sharing an authored map cell. Full snapshots carry infrequent content changes; motion packets carry continuous placement. Body positions and footing persist in a `.descent-spatial.json` sidecar to the native saved game.
