# Pigs of Worldwar

Fan-made remake engine for **Hogs of War** (1998), built with Electron, TypeScript and Three.js.

This project does **not** distribute any game assets. You need your own legally
purchased copy of the original game (e.g. from Steam) — the app reads models,
maps, textures and sounds directly from your installation folder.

## Game folder resolution

The path to the original game is resolved in this order:

1. `--game-dir=<path>` command-line argument (overrides everything)
2. `GAME_DIR` entry in the `.env` file at the project root
3. First launch: a folder-picker dialog, or a pasted path — either way the
   choice is saved to `.env`

A folder is considered valid if it contains `warhogs_.exe`.
`POW_ENV_FILE=<path>` redirects where the `.env` is read/written (used by
tests — see [docs/testing.md](docs/testing.md)).

## Playing

Double-click `play.bat` — it installs dependencies if needed, builds, and
launches. Add `--windowed` to play in a desktop window instead of fullscreen.

Controls (tank-style, as in the original):

| key | action |
| --- | ------ |
| `W` / `↑` | walk forward |
| `S` / `↓` | walk back |
| `A` / `←` | turn left |
| `D` / `→` | turn right |
| `Space` | jump |
| `Enter` | end turn |

Every one of these is a named action in
[src/renderer/src/input/controller.ts](src/renderer/src/input/controller.ts);
keys, on-screen buttons and the e2e suite all go through it.

The battle opens on CAMP. To play another map, open the devtools console
(`Ctrl+Shift+I`) and type `pow.swapMap('ARTGUN')` — the battle restarts
there with fresh spawns. `pow.swapMap()` with no argument lists every map
the installation ships. (CAMP has no climbing ground; the Scramble shows on
maps like ARTGUN and ICEFLOW.)

## Development

```bash
npm install
npm run dev        # start with HMR
npm run typecheck  # TypeScript check
npm run test:e2e   # build + Playwright end-to-end tests
```

The game launches borderless fullscreen. `--windowed` keeps a desktop
window; `npm run dev` is windowed by default (`--fullscreen` overrides),
and the e2e suite runs windowed so tests don't take over the screen. It also
launches with `POW_NO_FOCUS=1`: the window comes up **inactive and parked
off the desktop**, so a run neither steals the keyboard nor pops up over
whatever is fullscreen. Background throttling goes off with it, since the
window still has to draw where nobody can see it. The one exception is the
spec that checks the real fullscreen launch — a fullscreen window cannot be
moved off the display it fills, and that spec is about exactly that.

## Status

Early stub: the app locates the game installation and lists its files.
Next up: parsers for the game's data formats (`.MAD`/`.MTD` archives,
`.PMG` map geometry, `.PTG` terrain textures, `.POG` object placement)
and a Three.js viewer.
