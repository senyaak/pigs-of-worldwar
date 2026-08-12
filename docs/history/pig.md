# The pig itself

Its model, its footing, its animation and the noise it makes.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## The BATTLE MODEL is `_me`, and a keyframe has a HEAD

Two format-level things behind one report, and play had to make it three times
before the search left the pose and went to the assets: "жёпка так и не вертится…
именно та часть тела не шевелится вообще… должно двигаться вместе с туловищем а не
стоять колом."

**`Chars/british.mad` ships THREE models per class and only two of them are rigged
for the animation.** Measured across all twenty-seven: `pcXXX_hi` (627..668
vertices) hangs 30..35 vertices off bone 0 — the ROOT — and its bone 1 stops short
of the hip, so the whole pelvis is welded to a bone the shipped clips barely move
(4.9° of pitch, no yaw at all). `pcXXX_me` (457..496) and the short `XX_hi`
(168..201) put 6..8 there — the tail — and carry the hip band on bone 1, the
torso, where the run cycle's ±19.6° of swing lives. So on `_hi` the behind cannot
follow the body: it is not attached to it. `three/soldiers.ts` dresses a battle pig
in `_me`, and two things agree on that — a rig that matches the animation, and
`_ME` being the suffix the map's own spawn markers wear (`GR_ME`, `HV_ME`).
`pcXXX_hi` is for whatever shows a pig close up and standing still.

**An MCAP keyframe's first 32 bytes are TWO int32 vec3s, not an u16 and ten s8
triples.** how-doc's reading was wrong and nothing had ever consumed it. The
library settles it (`_d3d.dll` 0x1001228f): after the fifteen bone rotations it
reads dwords at +0x00/+0x04/+0x08 and +0x10/+0x14/+0x18, interpolates each between
the two keyframes as an INTEGER and ftols it into its own root record — two
16-byte slots, three live components each, which is also why the rotations start
at +0x20. The first slot is the body's own offset and its y MOVES: 21 units over
the run cycle's stride, two dips, one per footfall — the BOB. The second is zero
in all 93 shipped clips. `lib/formats/mcap.ts` reads it, `rootAt` samples it, and
it lands on the root of both the engine's skeleton and the drawn one.

Only the VARIATION is applied, against the clip's own first frame, and that half
is the remake's: the constant is about −100 on every clip and the original adds all
of it to a body it places its own way, while this engine stands a pig by the foot
offset measured off the art. Both would double up.

Found on the way and worth knowing: the model struct carries FOUR clip/frame pairs
— current and previous for each of the two channels, 0xFFFF for none — so **the
original CROSSFADES one clip into the next** where this engine cuts. Not modelled.

## A landing on a WALL tile settles, and only the get-up is refused

Play: "соскользнул с подьема и попал в бесконечный цыкл — туда сюда скользит на 1м
месте", with the tile's own address (CAMP 43,17 — type 0x85, a wall over terrain
type 5). The landing had two conditions where the exe has one: its impact handler
compares the ARRIVAL SPEED with 25 a frame (`cmp di,19h`, 0x4711d8) and that alone
picks the bounce (0x471247) or `0x471350`, which zeroes the velocity. What
`Map::IsBlocked` gates is the GETTING UP. Read as "a pig in a wall never lands", a
pig on that tile kept 99% of its slope-parallel speed off `WALL_MATERIAL` every
frame and the wedge counter relaunched it every 25 for ever. `002/wedge.spec.ts`
pins it; `002/locomotion.spec.ts` had the old reading as an assertion while its own
comment described the right rule.

## The pig's DRAW SCALE: the question dissolves

Open item 5 is closed and nothing had to change. The pig's constructor pushes
`0x1000` three times where the loader's building arm pushes `0x800`, and the worry
was that the original draws a pig at full model scale. It does not read either
number: both paths funnel into one base constructor, **`0x4a7db0`**, which is thirty
instructions and ends `ret 0x2c` — eleven dword arguments — and it reads exactly
**two** of them, arguments 1 and 3, into `word [this+0x2c]` and `[this+0x2e]`.
Everything else it writes is a zero or a constant. The scale triple is arguments 7,
8 and 9, and on the pig's path they are dropped twice over: its intermediate
`0x4407e0` ignores the three it was handed and pushes three fresh `0x1000`s, which
`0x4a7db0` then also drops. A dead argument in the engine's object constructor. The
body stands on the two measurements that agree — the shape table's 0xAA halved, and
the drawn shoulders.

## A HOOF KNOWS WHAT IT IS STANDING ON — footsteps, 2026-08-12

Done, and decoded end to end rather than picked: **when** a hoof lands is a
key-frame event on the clip (`lib/game/footsteps.ts` holds all 22 clips'
rows), **what** it lands on is the tile's terrain type through the exe's own
twelve-way switch (`SURFACE_SOUNDS`, `audio/battle.ts`), and the mix is the
exe's. The read is `anim/audio-events.md`, with `anim/key-events.js` to dump
any clip's events; nothing about it needs deriving from the skeleton, which is
what the plan that stood here for a week was going to do.

Four behaviours that will look like bugs and are not: **scrambling is silent**
(clip 11 authors no footfall) and so is standing still; **swimming's four
kicks a cycle are deliberately quiet**; the **climbing tile plays LAVA**, which
is the switch's own odd row and audible on ICEFLOW; and **`FT_SAND` plays under
every step**, at the same mix, because the handler plays it a second time. That
last one is the only thing here play might overrule — `STEP_UNDERLAY` is one
line to drop.