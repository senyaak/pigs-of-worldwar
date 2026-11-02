# P0. PLAY'S LIST, 2026-08-20 evening — **ALL SIX DONE 2026-08-20**

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Written down at play's request to survive the chat ending. Everything below is
a report from a session, in play's own order; the numbers at the end are ones
play tuned live in the console and they are the ANSWER, not a starting point.

**Three of the six turned on a READ that had never been done**, and two of
those came out against what this list assumed — see P0.2 and P0.4. Everything
here is built; what is left is play's ear on it.

## P0.1 The battle plate wears the WRONG FONT — put BIG back, just smaller ✔

**Reverting a decision made earlier the same day.** The plate had been moved to
`SMALL` at ×2 after play called BIG too big; play then saw it in the game —
**"не тот шрифт! верни тот что был — но просто сделай меньше его."**

`PLATE_FONT = 'BIG'` and `LAYOUT.plate.scale = 0.75` (`ui/hud.ts`). The two come
to the SAME height — BIG's 32 at 0.75 is 24, exactly SMALL's 12 at 2 — so only
the letterforms changed, which is what was asked. The heart keeps a scale of
its own (2) and no longer follows the letters'. A fraction softens a bitmap
glyph; if that reads badly the knob is `pow.hud.layout.plate.scale` and the
clean fallback is 0.5.

## P0.2 A BAYONET does not throw the body it hits ✔ — and the READ corrected this entry

**This entry named the wrong routine.** The melee does not go through
`0x4A9260`; it goes through **`0x4A9100`**, and the difference matters —
0x4A9100 SETS the velocity where 0x4A9260 ADDS to it. Disassembled 2026-08-20:

- `Pig::HitByHandToHand` is **0x4785C0** (0x478618 is the `shl eax,7` inside
  it, damage into 128ths). Its five-way switch carries damage AND knockback:
  trotter 15/100, knife 15/125, **bayonet 10/75**, sword 25/150, prod 25/200.
- 0x4786c1 calls `0x4A9100(knockback, 0x200, bearing, 0)` — 45° up, along the
  attacker's own line to the body, which is the same local the 67.5° cone test
  measures the swing by.
- 0x4786c8 then calls **0x470C70**, which puts the victim in movement state 5
  and plays **clip 38** — the FLYING clip, not the bounce. State 5 returns out
  of `UpdateMovement` immediately, so a struck pig is not driven until it lands.
- **The BLAST has no impulse in its damage arm at all** (0x477C22), so the
  remake's `FLING_PER_POINT` is still an invention and the melee's is now READ.
  On one scale a bayonet is **5/12 of a grenade at the core** and the cattle
  prod's 200 is exactly `FLING_CAP` — the hardest swing throws a body as far as
  TNT, which is the reading agreeing with itself.

Built: `melee.ts`'s `knockback` column is live, `StrikeWorld` grew an optional
`fling` beside `BlastWorld`'s, and the throw carries an `ejected` flag through
`battle.fling` → `tumbles.fling` so the body wears clip 38 rather than the
bounce.

**One correction for the disasm repo**: `weapons/melee.md:286-288` says a set
`[target+0x3B2]` diverts the whole thing to 0x4760f1 with no damage. It does
not — at 0x478627 the damage has already been dealt, and that branch only
un-HIDEs and falls through to the impulse.

## P0.3 There is no MUSIC on a level ✔ — and the trigger is the TURN

The install ships `MUSIC/Track02.ogg`..`Track32.ogg`, 31 Ogg Vorbis files that
Chromium decodes unaided. The game reaches them through a CD: the exe sends MCI
`cdaudio` commands and the install's own `winmm.dll` — a MinGW shim, not
Microsoft's — turns a track number into `MUSIC\Track%02d.ogg`.

- **`0x43b4c0` is `Sound::PlayMusicClip`**, named by its own complaint at
  0x4c2ab4 ("ERROR:Music clip requested is out of range"). It clamps 0..29 and
  turns a clip into the MCI pair `(clip+3, clip+4)`, so clip N is `Track{N+3}` —
  the thirty clips land exactly on Track03..Track32 and Track02, the only long
  piece at 171 s, is the front end's.
- **A side owns FOUR clips and takes one A TURN.** Disassembled at 0x491222,
  inside mode 4 (the START OF TURN card) and only on the arm the local human's
  controller takes: `clip = counter + 4·[pig+0x1e9]`, volume 0x46, then the
  counter steps 0..3. It does not loop and a finished track is not chased with
  another: a thirteen-second sting at the top of your turn, then quiet. That is
  why the folder's pieces are short.
- `[pig+0x1e9]` is `[squad+3]` (written at 0x466b42) — the same byte the
  pig-voice path reads as its LANGUAGE, beside `[squad+2]`'s VOICE. What fills
  the squad record has never been read, so WHICH set of four a side owns is
  `[CHECK — remake]` exactly as its voice is. `pow.music.play(n)` hears any of
  the thirty; `pow.music.now()` says which is sounding.

Built: `audio/music.ts`, a MUSIC bus under the master in `audio/bank.ts` (so the
pause freezes the track mid-bar and the master knob reaches it, which is what
0x43C720 does), wired in `audio/battleSound.ts` off the new `turnBegan` event.
`e2e/002/audio.spec.ts` drives the whole road.

## P0.4 The turn's opening BARK, and a beat before GET READY ✔ — the bark is the OTHER way round

**The read went against play's guess, and the arm is not ambiguous.** Play
thought only the player's own side says a line. `Pig::React(7)` (0x472320,
case 7) splits on whose CONTROLLER the acting pig has, `cmp eax,2` at 0x4724e5:

- **anybody else's pig SPEAKS** — 0x47256B calls the voice player with
  **category 0**, which is not a category but the builder's signal to pick the
  line off the pig's HEALTH (0x43b1e3): above 0xC80 (25 points) lines 1–2,
  above 0x500 (10) lines 3–4, below that 5–6. `category++` makes every one of
  them file **01**, the category `speech/pigs.md` had never placed. The line
  inside a band alternates on the squad's byte 4, over two.
- **your own pig only GRUNTS** — 0x4725be plays **69 P_HMMM** at 60/90+rand&15,
  no words at all — and the side's MUSIC steps instead (P0.3). So the thing you
  hear on your own turn is the music; the thing you hear on theirs is a pig.

That also completes the taxonomy: category 01 is the top of a turn, 02/03 is
firing, **04/05 is the DEATH LINE** — corrected 2026-08-23: the caller at
0x46f947 sits right after the state 6→7 edge writes the dying clip, twelve
lines on the squad's byte 6 (wired: audio/pigVoice.ts `death`, off the
`dying` event). "Getting up after a blast" was a misread of where 0x46f6e9
lands. And there are only FOUR callers of 0x43AF70 in the whole image.

**GET READY takes a key too early** ✔ — `TURN_START_FLOOR_SECONDS = 1` in
`lib/game/game.ts`. `beginTurn()` now answers `false` for the beat's first
second and `startingSettled` says whether it will take an answer; the floor is
in the rules, so the timeout, the pad and the pause button all wait it out. The
SPECS' own door is `cutTurnStart()`, which skips the floor with the beat — a
suite this size cannot pay ten seconds a turn for a card it is not testing.

Built: `turnBegan` on the bus (`lib/game/events.ts`), announced where a turn
actually starts — the handover, and the frame the opening drop lands — rather
than polled off `game.starting`, which a cut beat can skip past. `PigVoice.turn`
carries the health bands; the grunt is `BATTLE_SOUNDS.ready` and WAITS for the
bank if the bank is still loading, or a battle's first turn would be silent.

## P0.5 `pigpro` belongs BEHIND the columns ✔

`ui/playerScreen.ts` draws the board FIRST now, so the two column panels stand
over its edges. **This is deliberately NOT the arm's order** — 0x41DB85 blits
`pigpro` last, in front of everything — and it is play's ruling; the note says
so where the change is.

## P0.6 The numbers play tuned live ✔ — pasted in

- **START MISSION**: `options.rows = [385]` (48 under the tail's own 337) and
  `options.text = -14`, fourteen above the plate's middle.
- **The name**: `columns[0].name` is `{ x: 157, y: 21 }`. The right column was
  not measured; it takes the left's own relationship to the badge (`badge.x −
  4`, the same y) rather than staying at the portrait it was just moved off,
  and is flagged `[CHECK — remake]`.
- **The class badge** wanted a different y per ROW, so it IS a table now:
  `LAYOUT.badgeRows = [43, 43, 41, 42, 44]`, beside `rows` and `selectorRows`
  because it is the SLOT's number and both columns read it. The per-column
  `badge.y`/`stripes.y` are gone; the trapezoid and the stripes ride the same
  table. The right column's three were not measured either and take the same
  numbers.
