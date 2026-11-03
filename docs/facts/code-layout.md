# How the code is laid out — SEPARATE DOMAINS, and a check that says so

`npm run boundaries` is the authority, not this list: one table of who may not
import whom, run ahead of the e2e build. TypeScript never caught any of this —
every breach the repo has had compiled cleanly.

- `src/lib/formats/` — one pure reader per format (mad, tim, mgl, bmp, model,
  hir, mcap, pmg, ptg, pog, srl). Bytes in, structures out. May not know the
  rules.
- `src/lib/game/` — **the ENGINE**: the rules AND the battle, poses included —
  `clipPose.ts` samples a clip, `skeleton.ts` walks the bone chain and
  `bonePose.ts` answers where the muzzle, the blade and the scope's eye are,
  so nothing has to pose a mesh to find out. `muster.ts` says
  who a map fields and stands them on it; `engine.ts` BUILDS the battle —
  parsed map data in, something that steps with `update(delta)` out — so a
  battle can be assembled with no scene to assemble it in, which
  `e2e/000/engine-headless.spec.ts` runs in plain Node to prove;
  `battle.ts` is one frame's order of events, and `battle/` its phases — one
  module each, sharing one core and one state; `attack.ts` the fire button, the gauge and the
  fuse; `sights.ts` the aim, the tremor and the zoom; `bullets.ts`, `lobs.ts`,
  `strikes.ts` the weapons and every verdict about what they hit; `scenery.ts`
  the crates, the map script and the collision world; `airDrop.ts`/`dropIn.ts`
  the descents; `effectField.ts`, `damage.ts`, `anim.ts` the lists the battle
  WAITS on. No three, no Electron, no DOM: it can be stepped headless.
- `src/renderer/src/three/` — **graphics, and only that**. It builds art around
  an engine and reads `battle.view()` once the frame has run. It ticks nothing
  (`engine.update(delta)` is the whole game frame) and it ANIMATES nothing: the
  pose is the engine's and `wear.ts` writes it onto the bones. `battle.ts`
  wires the scene and runs its frame; `battle/` holds the parts it wires. It
  may not import `ui/` or `audio/` at all.
- `src/renderer/src/audio/` — **sound, and only that**. `battleSound.ts`
  assembles the domain and subscribes it to the bus; it knows nothing about
  what is drawn.
- `src/renderer/src/input/` — drives the ENGINE (`Battle`), never the scene,
  and plays nothing. `pow.ts` is the shape of `window.pow`, the console and
  the specs' surface.
- `src/renderer/src/ui/` — one module per view, and `battle.ts` is the
  COMPOSITION ROOT: it builds the bus and hangs the domains off it, with its
  parts in `battle/`. The dashboard is `hud.ts`, its parts in `hud/`.
- `src/renderer/src/contracts/` — the shapes two domains share, importing
  nobody: `overlay.ts` what the scene projects for the dashboard, `sound.ts`
  the two polls the scene owes sound.
- `src/main/` — `index.ts` lifecycle only, `gameDir.ts` locating the install,
  `assets.ts` loading through the readers, `saves.ts` the campaign saves,
  `ipc.ts` the IPC surface, `brainHost.ts` forking the AI's process and
  relaying its two channels. **A save crosses as TEXT**: the shape is
  `lib/game/save.ts` and neither the main process nor the preload parses one,
  so a new field never reaches either.
- `src/brain/` — **a PLAIN NODE PROCESS, and the third one the app runs.** It
  is the enemy AI and nothing else: facts in, one order out. It imports `lib/`
  and `node:` builtins and may import neither Electron nor `main/`, because
  the day it runs on a dedicated server there is nothing to import them from.
  Why it exists at all is the frame — see below.

**The engine steps in FIXED quanta, and rolls from ONE stream.**
`engine.update(delta)` accumulates real time and runs whole `STEP_SECONDS`
steps, returning how many; `alpha()` is how far into the next one the clock
stands, which is what the scene draws the acting pig between. Chance is a port
like any other — `lib/game/random.ts`, seeded per battle, threaded to the drop's
stagger, the sights' tremor and the smoke. Both together are what lockstep
needs: same seed, same inputs, same battle, proved in
`e2e/000/engine-headless.spec.ts`. Never reach for `Math.random` in `lib/game`.

**THE MACHINE THINKS IN ANOTHER PROCESS, and its orders are INPUTS.** A
turn's plan floods the whole map — about 25 000 cells, a few hundred
milliseconds — and it used to do that inside one engine step, which the
renderer runs inside its frame callback, which is the same JS task as
`renderer.render`: the picture stopped dead every time a pig thought. So the
seat is ASK and ANSWER (`lib/game/brainPort.ts`), the app's brain lives in
`src/brain/`, and the pig standing still meanwhile is the MULL the seat always
had. Two consequences worth knowing before touching any of it: the brain draws
chance from a stream OF ITS OWN (a brain that answers whenever it is done
cannot take numbers out of a shared stream in a fixed order), and what keeps
lockstep is therefore one rung up — peers replay the same ORDERS, not the same
thoughts. A battle built without a port seats a brain that thinks on the step
it is asked, which is what every headless run does. `docs/ai.md`.

**The renderer draws a SNAPSHOT, not the engine.** `engine.snapshot()` is one
flat reading of the battle — numbers, strings and arrays of those, nothing live
(`lib/game/snapshot.ts`). Everything with an identity carries an id: pigs,
bullets, grenades, crates. The pose is NOT on it — the four numbers that say
which clip and how far into it are, and `three/wear.ts` works the bones out
with the engine's own sampler. The debug surface still reads the engine
directly; it is test-only and in-process.

**The engine ANNOUNCES; it does not show.** `lib/game/events.ts` is one bus,
and the renderer and the audio bank are independent listeners on it — neither
knows the other exists. Three things are deliberately NOT events, because the
battle waits on them and a wait is a rule: the crate's descent, the pose port
(`lib/game/pose.ts` — where a bone is, answered today by three, tomorrow by
forward kinematics), and the two polls in `contracts/sound.ts`.

Keep modules small and single-purpose; that split was an explicit request.
`battle.ts` reached 1365 lines doing every job in the game and was taken apart,
grew back to 2421 and was taken apart again into `battle/` — and the scene,
the battle view and the dashboard with it. A phase of the frame is a module of
its own; a new one goes in its own file, not into the order.
