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
  instead: shown the same, and not an error.

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

## What changed for a missing or damaged file

- A fabricated or stripped install now says what it lacks on the strip and goes
  on as it did. `e2e/cli-game-dir.spec.ts` runs on one and expects that report.
- A real install reports none of these `[measured]`: every TIM and BMP entry of
  the 96 `.mad` and 80 `.mtd` archives the loaders read parses, and all 2019
  `.wav` and `.ogg` files decode, measured on 2026-11-05 by a throwaway spec
  through `window.api.loadSound` and `AudioContext.decodeAudioData`.
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
