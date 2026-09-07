# Native window bridge

The engine executable reads stdin and writes stdout. Both streams are line-delimited; stdout is JSON and stdin is a small text protocol. stderr is diagnostic output. All strings in stdout are JSON escaped.

## Engine events

- `commands`: regular compiled command names, descriptions, native key codes and general-action flags.
- `snapshot`: `width`, `height`, `turn`, `actionSerial`, `levelId`, `player`, `tiles`, `inventory`, and the last 40 `messages` with sequence IDs. `actionSerial` counts time-consuming hero actions separately from dungeon rounds, preserving the engine's speed and haste rules.
- `request`: `kind` is `command`, `key`, `menu`, `text`, `yn`, `extcmd`, or `display`. Includes `prompt`; menus include `how` (0 display, 1 single, 2 multiple) and `items` with `id`, `key`, `text`, `selectable`. Yes/no requests may contain `choices` and `default`.
- `document`: `title` and text `lines` for native help files.
- `message`: text emitted through native raw-print callbacks.
- `ended`: the window port has exited. The server waits for process termination and checks the native save file before announcing save completion.

Snapshots expose explored terrain and displayed glyphs. Monster and object information comes from NetHack's glyph and naming APIs. Inventory names are player-facing `doname` strings, including identification and equipped state. The core remains authoritative.

## Inputs

```text
k 104          # key code: h / west
k 27           # Escape
t Elbereth     # line of text
m 3,5          # native menu item IDs
m              # cancel a native menu
x pray         # extended command name
p 800          # update occupation pacing, milliseconds
```

There are no JSON comments on the wire; comments above explain the examples. Input text must not contain embedded newlines. `p` is consumed as a pacing control without answering the pending prompt. Ordinary inputs answer exactly one request.

The Node adapter cancels a displayed menu back to command input, retaining an input journal for replay. It compares prompt kinds, text, choices and selectable item IDs/text before submitting a saved response. Free overlays need no engine input. Blocking occupations bypass command input, so the bridge paces the core's event callback as those actions advance.
