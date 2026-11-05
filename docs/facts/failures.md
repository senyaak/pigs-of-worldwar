# How a failure reaches the person

The rule is the shared `.claude/rules/failures.md`; this is what the remake
built to meet it. None of it is the original's: the exe is not the source here,
the rule is.

## Where a report goes

- **The screen.** A strip of red lines along the top of the window, over every
  screen and the battle (`src/renderer/src/failures/strip.ts`). A click takes a
  line away; the newest five stay; a line already showing is not shown twice.
- **The session log.** `_tmp/telemetry-<start>.log`, as `[failure] <what>: <why>`
  or `[refusal] …` (`src/main/telemetry.ts`).
- **The console.** `console.error` with that same line, which `e2e/launch.ts`
  collects into `errors`, so a spec fails on it. A refusal is `console.info`
  instead: shown the same, and not an error. A refusal's line goes when the person
  answers it, as well as on a click (`clearRefusals`).

## The layers

- **The renderer**: `reportFailure(what, error)`,
  `src/renderer/src/failures/report.ts`. It also puts on the screen and in the
  log what no catch took, an uncaught throw or a rejection nobody waits on.
- **The main process**: `reportFailure(what, error)`, `src/main/failures.ts`. It
  writes the log and stderr and sends the report to the page, whose reporter
  shows it. What it reports before the page listens waits for the page. A
  rejection nobody waits on is reported; an uncaught throw keeps Electron's own
  dialog.
- **`lib/`** has no reporter and no I/O. A catch in it throws, returns the error
  as a value, or is marked `not a failure: <why>`. `Refusal`, `UnknownFailure`
  and the words of a report are `src/lib/failures.ts`.

## An `{ ok: false }` answer

The main process answers a load or a save it could not do with `{ ok: false }`.
That is not a catch, so the guard does not see it; every renderer path that takes
one does one of these (`e2e/failures.spec.ts`):

- **Reports it, and goes on without the thing.** The sounds, music and voices
  (`src/renderer/src/audio/`), the hats, skins, canopy, sky and the rest of a
  battle's dressing (`ui/battle/open.ts`, `ui/teamScreen.ts`), a screen's words
  (`ui/briefing.ts`, `ui/debrief.ts`, `ui/missionSelect.ts`), the weapon in the
  hand (`three/heldWeapon.ts`), the asset viewers.
- **Reports it, and stays where it is.** A battle whose ground, words or pig art
  will not load does not open, and an asset viewer does not change view.
- **Reports it, and the game goes on.** A save that will not write
  (`campaign.ts`, `write`): `saving the campaign, so your progress is not being
  kept`, on the strip, while the player plays on. Each failed write says so again
  if the line has been clicked away.
- **Hands it on.** `ui/font.ts`, `ui/sprites.ts` and `ui/barScreen.ts` throw it to
  the screen's own catch, which reports; `ui/mapData.ts` returns it to `open.ts`.
- **Is marked.** `three/lobArt.ts`: a name not in `Chars/WEAPONS.MAD` is routine,
  because `three/grenades.ts` asks the map's archive next (below).
  `audio/console.ts`: `pow.sfx.file` answers a path typed at the console with `no
  sound at <path>`.

The picker on the welcome screen answers in the main process, by its own error
box (`src/main/ipc.ts`), and never reaches the renderer as `{ ok: false }`.

## The refusals

- **A game folder that will not do** (`ui/welcome.ts`): the pasted path is empty,
  not there, or has no `warhogs_.exe`, and the person is told which. It replaced
  the line under the field.
- **A map name that is not a map**, typed at `pow.swapMap` (`ui/battle/console.ts`).
- **A map that carries no spawn markers** (`ui/battle/open.ts`). No spec reaches
  this one: it would need a map file made for it.

A file the game needs that is missing is not a refusal: the person did nothing
wrong. So the same load in a campaign's battle is a failure.

## What changed for a missing or damaged file

- A fabricated or stripped install now says what it lacks on the strip, the sound
  banks among it, and goes on as it did. `e2e/cli-game-dir.spec.ts` runs on one and expects that report.
- A real install reports none of these `[measured]`: every TIM and BMP entry of
  the 96 `.mad` and 80 `.mtd` archives the loaders read parses, and all 2019
  `.wav` and `.ogg` files decode, measured on 2026-11-05 by a throwaway spec
  through `window.api.loadSound` and `AudioContext.decodeAudioData`.
- A real install answers none of the `{ ok: false }` paths above with one
  exception `[measured]`, by a throwaway script calling the main process's own
  loaders on 2026-11-05: 128 bank sounds, 30 music clips, 28 speech clips, 1620 pig
  voice lines (nine voices, six languages, every line a rotation reaches), every
  hat, skin and weapon in the hand, and the ground, objects, sky and weather of all
  61 shipped maps. The exception is the marked one, `three/lobArt.ts`: `WE_BAZZ`,
  `WE_SU_GR` and `WESUBB` are not in `Chars/WEAPONS.MAD`. `SGEN2208.wav` does not
  ship either, but only `pow.sarge` can ask for it: a battle plays sections 0, 1,
  2, 3 and 8 (`src/lib/game/sergeant.ts`), and it is section 21's eighth line.
- The pause menu's click loads when a battle opens (`audio/menuClick.ts`), and the
  battle's sound bank once there is a game folder (`main.ts`, `showGame`). Both used
  to load at page start, when a first run has no folder yet, and keep the failure,
  so that run's battles and pauses were silent until the next launch.
- About saves, only `ENOENT` is the empty answer (`src/main/saves.ts`): no folder
  is no saves, a missing file is `null`, deleting a missing one is done. Anything
  else goes on as `{ ok: false }`, and the campaign reports a list it could not
  read (`src/renderer/src/campaign.ts`).
- A new campaign whose save list could not be read writes nothing, for its whole
  life: it has no slot, because any slot picked blind could be a save the player
  has. The game goes on, and the strip says `listing the saves, so this campaign
  is not being saved`. What the player does in that campaign is lost when the
  game closes; the saves on disk are untouched (`.claude/rules/failures.md`,
  "Where a loop meets a bad item"; `e2e/failures.spec.ts`).
- One unreadable save among several is reported and left out of the list.

## The guard

`npm run catches` (`scripts/catches.mjs`) runs in CI over `src/`. It names every
catch clause and `.catch(` that does not throw, reject, return or pass on the
error, call `reportFailure`, or carry `not a failure: <why>`, and it fails when
the count of `new UnknownFailure` differs from its `CEILING`, which only goes
down. It reads the text with strings and comments blanked, not a syntax tree:
TypeScript 7 gives a script no parser. A `.then(done, failed)` is not seen.
