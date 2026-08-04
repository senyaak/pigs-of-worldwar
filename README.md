# Pigs of Worldwar

Fan-made remake engine for **Hogs of War** (1998), built with Electron, TypeScript and Three.js.

This project does **not** distribute any game assets. You need your own legally
purchased copy of the original game (e.g. from Steam) — the app reads models,
maps, textures and sounds directly from your installation folder.

## Game folder resolution

The path to the original game is resolved in this order:

1. `--game-dir=<path>` command-line argument (overrides everything)
2. `GAME_DIR` entry in the `.env` file at the project root
3. A folder-picker dialog on first launch (the choice is saved to `.env`)

A folder is considered valid if it contains `warhogs_.exe`.

## Development

```bash
npm install
npm run dev        # start with HMR
npm run typecheck  # TypeScript check
npm run test:e2e   # build + Playwright end-to-end tests
```

## Status

Early stub: the app locates the game installation and lists its files.
Next up: parsers for the game's data formats (`.MAD`/`.MTD` archives,
`.PMG` map geometry, `.PTG` terrain textures, `.POG` object placement)
and a Three.js viewer.
