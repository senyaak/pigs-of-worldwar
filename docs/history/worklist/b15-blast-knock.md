# B15. A BLAST'S KNOCK WAS SWALLOWED WHOLE — found and settled 2026-08-31

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

**Found by rewriting `002/knockback.spec.ts`, and it was play's own old report
back again**: "он на месте катился". Left `test.fail()` overnight — green suite,
executable TODO — and chased the next session.

**What was measured.** ESTU, the thrower on the hill at (6400, −8600), heading 0,
a plain grenade at half charge, the victim planted 100 units from where the
grenade actually bursts:

```
damaged   30 points  (a core hit)
flung     (-1634, -1909, 988)      horizontal 1909, vertical 1909 — a clean 45°
travel    8 units, peak and resting alike
```

**And the cause was not the slope.** The suspicion written down here was rising
ground refusing the first substep; tracing `state.airborne` frame by frame killed
it in one reading — the horizontal was **already zero on the first logged frame**,
before the body had moved at all. What zeroed it was the flight's own blocked
step in `lib/game/locomotion.ts`:

```ts
if (obstruction.blocks(to.x, to.z, state.y, 0)) { a.vx = 0; a.vz = 0 }
```

**The pig that threw the grenade was standing 185 units away, on the far side of
the victim** — which is where a thrower always is, because the grenade flies from
it and bursts past the body. `withPigs` blocks at exactly 2·PIG_RADIUS = 170, so it had 15 units
to spare; the first substep of the 1909 carried 32 of them at a sixtieth of a
second, and the body was inside the thrower's cylinder from that frame on. From
there nothing ever writes a horizontal back: the pig went straight up and
straight down on the spot.

**What replaced it is a reading.** A non-landscape contact goes through the SAME
impact handler a landing does — 0x470d10, callers 0x4772bb (landscape) and
0x4777e2 (object) — and that handler forks on the arrival speed alone
(`cmp di,19h` at 0x4711d8, `di` = `[hit+0x14]` = the LENGTH of the relative
velocity): at or over 25 a frame it BOUNCES, and the bounce's kick rides the ADD
primitive at 0x4712e0, so whatever the solver left survives the contact. Only
under 25 does 0x471350 build zero vectors. **The remake was applying the under-25
arm to every contact in the game**, and no knock in the game is that slow — the
weakest fling a grenade hands out, nine points at the rim, is 810 a second
against a cutoff of 375.

So a blocked step now REFUSES the move and keeps the speed, re-tested next frame:
a 45° knock rides OVER the mate it was thrown at — a pig is 320 tall and a
throw of 1900 up clears that in a sixth of a second — and carries on. The under-cutoff arm is deliberately
not built — it would kill the vertical too, which in the air is a body hanging on
the side of a crate, and nothing that slow is ever thrown at one.

**Pinned twice, and both fail without the fix**: `002/knockback.spec.ts` on the
whole real chain, and `002/tumble.spec.ts` "a body thrown AT another still
travels" on the mechanism alone — the sibling of the older "thrown while INSIDE
another", which fixed the melee half of the same thing and left this half
standing.

**Two things it was NOT.** The fling itself was never the bug — the event's
vector is right, and `unit/blast.spec.ts` pins the geometry. Nor was the
footprint rule: `hurlVelocity` splits on `flat < PIG_RADIUS` and this round is at
100 against a radius of 85, clear of it.

**And the gap it left is CLOSED the same day** — play: "конечно строить." The
exe's own pig-versus-pig answer is a SHOVE, not a block: 0x477842 throws the
OTHER pig at 0x40, 45°, on the flyer's own heading plus a one-sided `rand & 0xFF`
(22.4°). Built as `BARGE_SPEED` in `lib/game/tumble.ts`, and building it took the
pig-wall out of the air, because the two cannot both be there: a flight held off
at 2·PIG_RADIUS can never reach a contact tested at the same distance. See
`docs/history/weapons.md`.

**What is still not written down anywhere**, and is the remake's own until it
is: whether the contact re-fires every frame the bodies overlap (ours fires once,
keyed by the PAIR), whether a body ALREADY IN THE AIR can be bowled over (ours
says no — with it in, two pigs of one blast rob each other and this very spec
went red at 420 against a floor of 486), what becomes of the FLYING one's own
velocity, and whether the shove carries a clip, a sound or damage. The pig body class's three contact
methods (0x411c90 / 0x412070 / 0x411620) are named in `movement/notes.md` and
unread, and `weapons/fire.md` says the whole prologue arm 0x477390..0x477898 has
never been transcribed — all three shove sites live in it and share one
sentence.

**What the spec rewrite changed, and why it had to.** It used to throw five
grenades down ONE turn and measure the victim after each. The thrower stands
inside its own blast at that range, so it took rim damage, was flung, and threw
the next one from somewhere else — every round depended on the ones before it,
and whether a round connected at all was an accident of drift. It also aimed at
a dip at (7909, −8090) that a clean throw has not reached in a long while: the
grenade actually bursts about 285 units from the thrower, and the spec passed
only because the drift occasionally carried it into range. Now: a fresh engine
per offset off the same seed, one probe round to MEASURE where the burst lands,
and the victim planted at offsets back along the throw from there.
