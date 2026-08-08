# Network play — the slice

Everything decided for network play, written down before any of it is built,
so that none of it has to be re-argued. Nothing in here is implemented yet
beyond the MULTI-PLAYER screen; the rest is the plan and the reasons.

The work lives on branch `net`, in a worktree beside the game folder. It is
cut from **local** `master` — `origin/master` trails by many commits, so
branching from origin silently loses everything since.

## The decision: lockstep, not a host

Peers exchange **input**, not state. Every peer runs the same engine over the
same inputs and arrives at the same world.

Two alternatives were weighed and dropped. A **dedicated host** puts the
client's input through a round trip and needs prediction to feel right. An
**authority that rotates with the turn** — the acting peer simulates and
streams, with a full snapshot at handover — is robust against divergence but
is not the honest one, and the user picked against it.

Lockstep fits this game unusually well because **only one player provides
input at a time**. Ordinary lockstep makes everyone wait for everyone, and the
acting player eats the delay. Here there is nobody to wait for: the acting
peer sends its input and computes immediately, and the others trail by RTT and
catch up. **The turn handover is the sync barrier** — the one moment a peer
can be checked against its neighbours cheaply, because the world is quiet.

## What lockstep demands

### A fixed step

This is the real cost and it was nearly mis-estimated. The battle is already
**frame-rate independent**: every constant is lifted off the exe in FRAMES and
converted once (`fromExeSpeed = perFrame / FRAME_SECONDS`), so a pig walks the
same distance a second at 30 fps and at 144. That was asked for, and it was
delivered.

What it is not is **frame-rate deterministic**. The sim integrates in seconds
against the real `delta`, so 60 Hz takes 60 steps and 144 Hz takes 144. While
the integration is linear the two agree; the moment anything is a threshold or
a state — a landing at an impact of 25, a step clamped against a wall, the
grenade's substep by its own size, `Math.floor(time / FRAME_SECONDS)`, a
terrain sample per step — they part. Over a turn that is centimetres. Over a
match it is a different world.

So the engine gets one constant step. `STEP = 1/30`, the engine's own rate
(`EXE_FRAME_SECONDS`); what matters is that it never varies. **No constant
moves and `lib/game/*` is untouched by this** — only who calls it, and with
what.

### A seeded RNG, split in two

Eight `Math.random()` calls today. They are not all the same kind:

- **in the sim** — `grenade.ts` (the fuse's `rand() & 7`, which decides when it
  goes off) and `effects.ts` / `cloud.ts` (visual, but `effects.busy()` holds
  the beat after a blow, so it decides when the turn comes back);
- **cosmetic** — `wobble.ts` (moves the eye, never the aim — settled, see
  CLAUDE.md), `audio/battle.ts` (pitch jitter), `three/dropIn.ts`.

The sim ones take a seeded generator that is part of the world state. The
cosmetic ones take their own and are free to differ between peers.

### The same build on both sides

`Math.sin`, `Math.cos` and `Math.atan2` are **not** specified bit-for-bit and
may differ between V8 versions. Two peers on the same Electron build agree;
two peers on different builds may not. This is a hard requirement of the
design, not a wish, and the lobby should refuse a mismatch rather than desync
an hour in. (`Math.sqrt` is IEEE-exact and is fine.)

## The architecture: engine in its own process

The engine runs in Electron's **main** process. Not a Web Worker — that is a
thread in a browser sandbox — and not merely a module in the renderer.

Three reasons it is `main` specifically:

- it is Node, so the engine can hold a socket and read a file;
- **the assets are already parsed there.** `main/assets.ts` reads the map,
  the collision, the models through the pure readers and hands results over
  IPC. The engine needs exactly those; in `main` it gets them without a
  second parse or a second bridge;
- a dedicated server later is this same code with no window — a different
  host, not a rewrite.

`main/ipc.ts` is the bridge and already exists. Because the two sides speak
only in plain data, **replacing the engine is replacing one side of the
bridge** — which is what makes a mod possible, and is why the boundary is
worth having even though a module boundary alone would give determinism.

```
renderer  ── intents ──▶  main / engine     tick at STEP = 1/30
   │                          │
   └──◀── snapshots ──────────┘   plain objects, never live references
```

### Rendering

The view interpolates between the **last two snapshots**, at whatever rate the
display runs. Nothing else changes rate:

- the animation mixer keeps its flat 25 (`three/clips.ts`) — it is cosmetic
  and never feeds the world;
- the camera reads an already-interpolated subject;
- the HUD is unchanged.

### The honest cost

Input goes renderer → IPC → tick → IPC → renderer, so a player's own pig
starts moving a tick or two after the key — roughly 30–60 ms. For tank
controls in a turn-based game that is acceptable. **It is the price of the
process boundary, not of lockstep.**

**Client-side prediction is wanted** and is the fix if it reads as sluggish in
play — the renderer runs the acting pig's locomotion locally against the same
rules and reconciles when the snapshot arrives. It is deliberately NOT first:
prediction over an engine that is not yet deterministic debugs neither.

## What is already true, and what has to move

`src/lib/game/*` is **completely pure** — not one import of `three` anywhere
in it; the only mentions are in comments. The rules are already out.

What is not out is **who owns the live entities**. `three/shots.ts` holds
`live: Shot[]` beside `bullets: THREE.Mesh[]`; the same shape is in
`grenades.ts`, `effects.ts`, `squad.ts`, `airDrop.ts`, `damageNumbers.ts`.
State and mesh in one object is exactly why the sim runs at display rate —
there is nowhere else for it to run. Those lists move to the engine, and the
`three/*` modules become presenters that read and draw.

A thin `world.ts` owns only the ORDER of the ticks. The rules stay in their
own modules; one fat world file would undo the split that was asked for.

## The mine: the strike reads a bone

`three/swing.ts` takes its strike points off the posed **hand bone** —
`soldier.mesh.bones[5]`, `updateMatrixWorld`, `localToWorld`. So whether a
blow lands is decided by a skeleton that three's mixer interpolated at render
rate.

This is not merely a dependency on graphics: **it is already
nondeterministic**, and it is the same bug class `scopeEye` had, where
"sampling an interpolated skeleton at sixty was the bug".

The fix is not a workaround. The strike is already tied to CLIP FRAMES — four
key-frame events at frames 11–14 of 36 — and the domain already owns which
clip plays (`locomotion.ts`). So the pose at a given frame comes from pure
forward kinematics over `hir` + `mcap`: both readers exist, the rotation
composition is derived and written down (`local = Rx(-x)·Ry(-y)·Rz(-z)`,
parent-relative, XYZ order), and `../pigs-disasm/anim/notes.md` carries three
scripts that prove it.

The camera hangs off bone 5 too (`chase.ts`, `SCOPE_BONE`) and does **not**
need this — it decides nothing in the world and may keep reading three's
skeleton.

## Transport

The transport layer is **swappable**, and WebRTC is wanted first.

One thing to know before designing the connect screen: **the original asks for
an IP address.** `ENTER TARGET IP ADDRESS` (fetext 460) and `- HOST GAME -`
(461) — the art is drawn for a direct connection. WebRTC needs either a
signalling server, which does not exist, or a pasted SDP blob, which the
original's screen has no field for. Direct IP over Node `net` costs no
dependency and fits the art as it stands; WebRTC lands behind the same
interface once signalling is answered.

## The screens, out of fetext

Decoded from `Language/Text/fetext.bin`, so none of it is guessed:

| # | string | where |
|---|---|---|
| 59 | `MULTI-PLAYER` | the screen's title |
| 60–63 | `TEAM A`…`TEAM D` | four slots |
| 330–332 | `PLAYER` / `CPU` / `OFF` | what is in a slot |
| 65 | `NETWORK` | into the network branch |
| 66 | `FIELD CONDITIONS` | 276–320: LANDMASS, THEME, MINES, HEIGHT, VEHICLES, MIRRORED, SKY, PICK-UPS, PIGS, TURN TIME, DEATHMATCH LIMIT, HEALTH, SUDDEN DEATH |
| 64 | `DONE` | on to the level select |
| 105 | `MULTI-PLAYER SELECT LEVEL` | 106–118 its modes, 720–744 the arenas |
| 155/157/159/161/163 | `NETWORK: CONNECT` / `GAMES` / `PLAYERS` / `HOSTING NEW GAME` / `CHOOSE ARMY` | the network branch |
| 460–463 | `ENTER TARGET IP ADDRESS`, `- HOST GAME -`, `OK`, `PRESS TAB TO START` | connecting |
| 782 | "…UP TO 4 HUMAN OR COMPUTER PLAYERS" | the ceiling is four |

## A lead nobody has followed: which map is which ARENA

Measured off the shipped `.POG`s, filtered by the player-count byte:
**exactly 25 maps field three or four sides** — ARCHI ARTGUN BHILL BOOM BUTE
CMASS CREEPY2 DBOWL DVAL2 FINAL HELL2 HELL3 ICE ICEFLOW ISLAND LAKE LECPROD
LUNAR1 MAZE MLAKE ONEWAY PLAY1 PLAY2 RIDGE SEPIA1 — and fetext carries
**exactly 25 arena names** at 720–744. Fifty-three maps field two.

Several pairs are obvious (DBOWL→DEATH BOWL, CMASS→CRATERMASS,
ONEWAY→ONE WAY SYSTEM, DVAL2→DEATH VALLEY 2, MAZE→HEDGE MAZE), but the
bijection does not close: FINAL is the campaign's six-sided last level, and
BRIDGE THE GAP and DEATH VALLEY want BRIDGE and DVAL, which field two. **So it
is a lead, not a reading, and it is not applied anywhere.** The answer is the
exe's own map-name array — the same gap `ui/titleCard.ts` has for the
campaign, where only CAMP is answered.

Until it is read there is no honest **MULTI-PLAYER SELECT LEVEL** (fetext 105):
a level list would show `DBOWL` in the original's font, and 53 entries want a
scrolling column this art does not have. Deliberately not built.

## Order of work

1. **The engine moves out.** Entity ownership leaves `three/*`, `world.ts`
   orders the ticks, `STEP = 1/30`, and it runs in `main`. The view reads
   snapshots with **no** interpolation at first — the picture judders, and
   that is the point: it shows the seam went all the way through.
2. **The bone.** Forward kinematics in the domain, the strike off the clip
   frame. Done with (1) rather than after it, or "headless" would be a lie in
   the one place that decides a hit.
3. **Interpolation** in the presenters. The picture comes back.
4. **The seeded RNG**, split sim from cosmetic.
5. **Determinism harness** — run an input tape through the headless engine
   twice, hash the world, assert equal. No Electron, no display. This is the
   safety net everything after it stands on.
6. **Transport and lockstep** over a finished engine.
7. **Prediction**, if play says it is needed.

The `NETWORK: *` screens are pure frontend and collide with nothing, but they
are deliberately NOT built ahead of the transport: a field that takes an IP
address and goes nowhere is a stand-in with no way to test it, and the shape
of the screen depends on which transport answers (a direct address, or a join
code a signalling server hands out).

## Done so far

- **The MULTI-PLAYER screen** (`ui/multiPlayer.ts`), read out of fetext. The
  frontend's machine came out into `ui/barScreen.ts`, since the main menu and
  this are the same furniture; a bar may now carry a setting, and left/right
  change it, which is the original's own instruction (fetext 780). Three of
  its seven bars are dark and the module says what each waits on. DONE opens
  LIBERATE — a shipped map with two real squads — because the level select is
  not built, which makes two people on one keyboard the rung under all of
  this. Pinned by `e2e/001/multiplayer.spec.ts`.
- **FIELD CONDITIONS** (`ui/fieldConditions.ts` over `lib/game/conditions.ts`),
  with the turn clock, starting health and the squad cap reaching the battle
  for real — `e2e/001/field-conditions.spec.ts` walks the whole path and
  checks each pig against its CLASS's own figure, because a settings screen
  that sets nothing passes every pure spec.

  Two bugs fell out of building it and both were older than it. Screens share
  one controller and tell themselves apart by a `visible` flag, so a
  synchronous view swap delivered the same key press to the screen it had just
  opened — navigation is queued now. And `menu.spec.ts` opened by asserting
  the lit bar was at zero, which held only while nothing before it had ever
  moved; `lightBar` came out of `choose`, and it leaves the machine settled,
  because `nudge` returns the instant a bar starts its third-of-a-second flip.
