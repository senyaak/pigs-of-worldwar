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

It opens on the game's own main menu. `↑`/`↓` move the lit bar and `Enter`
chooses it — or use the mouse, which the original has no time for. Only ONE
PLAYER leads anywhere yet: it opens the training ground. `F1` opens the asset
browsers, which are the remake's own debug screens.

Controls in the battle (tank-style, as in the original):

| key | action |
| --- | ------ |
| `W` / `↑` | walk forward |
| `S` / `↓` | walk back |
| `A` / `←` | turn left |
| `D` / `→` | turn right |
| `Space` | jump — and, in the skill menu, take what is under the cursor |
| `R` | open the skill menu (the original's own key is Return) |
| `Q` / `E` | aim up / down (the original's are Page Up and Page Down) |
| `F` | use what is in hand (the original fires with the select button) |
| `C` | get into the building you are standing at, or come back out |
| `Enter` | end turn |

A pig standing against a BOMB SHELTER can get in with `C`. Inside it is out of
sight and cannot be driven, and the only thing its menu offers is SKIP TURN;
`C` again puts it back on the spot it came from. Three fit in a shelter.

Walk into a crate to collect it: what is inside goes into the pig's
inventory — fifteen slots, as in the original, and everything is unlimited on
the training ground — or straight into its health. `R` opens the menu over
what it is carrying; the same walk/turn keys move the cursor while it is up,
and the pig stands still.

`Space` in that menu takes the skill in hand: the pig reaches for it, comes
up holding its model out of `Chars/WEAPONS.MAD`, and stands in the weapon's
own aiming pose — which is a second animation channel over the walking one,
so it can carry a rifle at a run. `Q` and `E` point it, ±90° and accelerating
while held; the brass dial top right turns with the angle and its slot shows
what is in hand. A rifle comes up level and a grenade already lobbing at 45°,
which is the weapon's own record talking.

`F` uses it — and it is HELD now, because that is what the original's power
gauge is. A weapon whose record asks for one charges while the button is down
and throws when it comes up, or by itself if it fills first; everything else
goes off on the press. The gauge shows along the bottom of the dashboard while
it fills.

A **grenade** is what that gauge is for. It leaves the hand on a parabola —
the engine's own plain gravity, ten units a frame squared — arcs, bounces off
the ground on the same per-surface friction a pig lands with, and goes off
where it stops. No crate on the training ground carries one, so reach it from
the console: `pow.give(19)`, then `R` to take it in hand. Its fuse and blast
radius are the remake's guesses and want correcting by eye.

Five skills still answer the old way — the ones the original resolves by
CONTACT rather than by a projectile: the trotters, the knife, the **bayonet**,
the sword and the cattle prod. The pig winds up for ten frames, swings the
whole-body clip its record names, and the blade is live for four frames of it,
sampled along its own length off the hand bone. Ten health off a pig it
catches — five swings put a grunt down, because health is the pig's CLASS's
and a grunt has fifty, not a hundred. Once per swing, and only what is in
front of it inside 67.5°. The training ground's **dummies** are targets too,
and they carry exactly one point, so any swing at all knocks one down — hit
one and it goes off the map, and the damage floats up off whatever was hit in
the game's own letters — the original does that too, and in points. Walking
is refused for the length of it, as the original refuses it, and the camera
swings round to the pig's side and closes in — the original has a camera mode
for exactly this and uses it for nothing else. The aim angle plays no part:
the strike comes off the hand, and the original's does the same.

CAMP fields one pig, so try any of it on a map with two sides:
`pow.swapMap('LIBERATE')`.

Every one of these is a named action in
[src/renderer/src/input/controller.ts](src/renderer/src/input/controller.ts);
keys, on-screen buttons and the e2e suite all go through it.

The dashboard's layout can be nudged live from the devtools console
(`Ctrl+Shift+I`) — every number is in the 640×480 units the art was drawn
in, so what you print is what the source says:

```js
pow.hud.layout.dial.slot.bottom -= 1      // move a piece, watch, repeat
pow.hud.layout.dial.green = [90, 150, 60] // repaints on the next frame
pow.hud.print()                           // paste that into ui/hud.ts
```

The battle's sounds work the same way. Each moment carries a sound, a volume
and a pitch — the original's own three numbers, 100 being nominal on the last
two. Several are read straight out of the game; the rest are guesses off the
bank's file names, and those are meant to be picked by ear:

```js
pow.sfx.list('P_')                             // the bank, with indices
pow.sfx.play('P_SLIP')                         // hear one, by name or index
pow.sfx.now()                                  // every moment's current cue
pow.sfx.set('splash', 'I_SPLASH', {pitch: 120}) // rebind live, and hear it
pow.sfx.print()                                // paste into audio/battle.ts
```

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

A battle you can walk around: the map's own terrain, props and squads, the
turn clock, the parachute drop the level opens with, the training ground's
crates and the instructor talking you through them, the skill menu over what
a pig is carrying, the weapon it takes out of it — held, posed and aimed —
and the first attack: a bayonet you can swing at another pig for real damage,
with the original's own health behind it. A pig has its class's points, a
fallen one stays down and is stepped over by the turn order, and nothing can
die on the training ground because the original will not let it.

Guns fire, and grenades arc: the power gauge is the original's own, the throw
speed comes off it the way the exe scales it, and the parabola is the engine's
plain gravity. What a grenade's fuse and blast really are is not read yet, and
those two numbers are the remake's.
