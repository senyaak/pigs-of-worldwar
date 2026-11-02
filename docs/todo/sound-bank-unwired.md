# P2. THE SOUND BANK, IDENTIFIED BY EAR — 2026-08-21, and nine of them are unwired

Ninety-nine entries and the exe names them by NUMBER, so what a file IS was
always a guess from its name. Play walked all thirty-seven that are neither a
footstep nor a pig and said what each one is; the table lives where the wiring
is (`src/renderer/src/audio/battle.ts`, above `BATTLE_SOUNDS`) with the
measured length beside each.

**SETTLED, after every effect in the install was heard**: there is **no
burning fuse in the game**. Play walked the battle bank's ninety-nine, then
the pig's own forty-one, then the front end's — and the front end is the only
other place with effects in it. `hiss1` is hydraulics or gas escaping,
`Sparks02` is electricity, `Steam001` is steam, `Crunch` is the menu's "you
cannot press that": all of it is the machine.

The arithmetic closes: 2019 audio files, 1823 of them speech and 31 music,
leaving 165 — the battle's 99, the front end's 64, and two orphaned night
ambiences. A sweep for embedded WAVE headers across every other file in the
install came back empty. And a MEASUREMENT agrees with the ear — ranked by
noisiness against steadiness of envelope, the only three hisses in the game
are `BG_GAS`, `hiss1` and `hiss2`, and all three are placed elsewhere.

So a charge's burn is its TIMER and nothing else, and that is an answer rather
than a gap. Every identification is written up above `BATTLE_SOUNDS`
(`src/renderer/src/audio/battle.ts`).

**Two loose ends the same sweep turned up**: `Audio/AMB_1N.wav` and
`AMB_2N.wav` — the NIGHT ambience pair — are indexed by nothing, because
`sfxnight.srl` is byte-identical to `sfxday.srl` and names the DAY pair. And
thirty-seven `FESounds/Indu0NN.wav` are in the folder and in no bank, two of
them named "Looped".

**How to hear any of it** (all installed from the app's own start, no mission
needed): `pow.sfx.next(undefined, false)` steps all ninety-nine in bank order,
`pow.sfx.next()` steps only what is not yet placed, `pow.sfx.left()` says
what that is, `pow.sfx.walk(filter, { fresh })` does it hands-free paced by
each sample's own length, `pow.sfx.file('FESounds/hiss1.wav')` plays anything
in the install by path, and `pow.sfx.queue([...paths])` points the stepper at
a shortlist. `pow.sfx.set('fuseTimer', 'NAME')` rebinds a moment live.

**What is placed and wired to nothing**, roughly in the order it would be worth
doing:

- ~~**`S_CLOCK` is the TURN CLOCK starting to run out**~~ **WIRED
  2026-08-24** — `clockLow`, emitted on the crossing of `CLOCK_WARNING`
  (10 s, lib/game/turns.ts — the same mark the exe's own late-turn window
  opens on). It still plays for a charge's timer too; that was never the
  problem, the silence was.
- ~~**`I_BUILD` against `I_BULIT1`/`I_STAB`**~~ **WIRED** — `shotLanded`
  carries the verdict and `hitHard`/`hitFlesh` answer it.
- ~~**`I_METAL`** — a blast inside a bunker~~ **WIRED 2026-08-24, once play
  re-read the sample**: it is not "inside" anything, it is a blast **ON
  METAL** — "взрыв по танку, пушке и прочему" — which the engine can answer
  where the other reading could not, because what a blow lands on is a
  named model (`isMetal`, lib/game/breakable.ts). The TANK and the BIG GUN
  themselves still wait on the BUILDING class (0x4bc5d0), which nothing in
  the remake breaks; everything metal that already breaks rings now.
- ~~**`I_SWMISS`** is a swing that MISSED~~ **WIRED 2026-08-24** —
  `swungWide` off lib/game/strikes.ts, beside the throw's own whoosh; two
  moments, one sample, at slightly different pitches.
- ~~**`S_UNHOLS`**~~ **WIRED** — the turn's end holsters what is in hand.
- ~~**`BG_GAS`** — the gas grenade~~ **WIRED 2026-08-27**, with the weapon
  itself: a poll beside the fuse's tick (`gasHissing`,
  audio/battleAudio.ts), the 0.38-second sample laid end to end while a
  canister is live; the pop is `I_BULIT1` at the exe's own half volume
  (0x432d83), and the touch squeals through `damaged` like any hit.
- ~~**`BATT_L1..3` and `BATT_S1..3`**~~ and ~~**`AMB_1D`/`AMB_2D`**~~
  **BUILT 2026-08-24** — `audio/ambience.ts`, a CLOCK rather than a
  listener, because nothing on the field causes them: one distant round
  every 9–22 s and a bird every 14–40 s, both stopped dead by a pause. The
  cadence and the volumes are `[CHECK — remake]` — the samples are play's
  ear, but how often the ORIGINAL fires one has not been looked for.
- **`EN_BIP`** — the AIRSHIPS that fly over a map, and **play notes we have
  none**: "дережабли летают на картах - их кстати щас нет вроде". That is a
  missing PROP before it is a missing sound.
- The weapon reports we do not field yet — `L_ARTIL`, `L_MORT`, `L_ROC`,
  `L_SHOTG`, `L_HVYMG`, `L_MGUN`, `L_FLAME` — one line each the day their
  weapon lands (`BARREL_SOUND`).
