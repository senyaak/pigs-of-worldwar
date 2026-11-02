# P1. THE SERGEANT — **HEARD AND PLACED 2026-08-20**, and he named a system

Two of his 22 categories were built off the exe alone (a kill, a loss —
`lib/game/sergeant.ts`). The other nineteen had their MOMENT read and their
WORDS read by nobody: the lines are never printed, neither `gtext` nor `fetext`
holds one, so listening was the only way. Play listened the same evening and
the table below is what he heard, against what the exe had said.

```
pow.sarge.list()          // what each of the 22 is
pow.sarge.file(3, 1)      // hear SGEN0301 — the praise for a kill
pow.sarge.play(2, 1)      // …the same line by the exe's own SECTION argument
pow.sarge.stop()
```

`file` takes the FILE's number, which is what the folder shows; `play` takes
the section, which is one lower and is what the exe's call sites pass.

| file | the moment (READ) | what he SAYS (heard) |
| --- | --- | --- |
| 01 | end of turn, you LOST a pig, behind | **built** — a threat: one more loss and he has your guts |
| 03 | end of turn, you KILLED, ahead | **built** — you and your boys have no equal |
| 02 | START of a turn that is not yours, THEY are behind | **built** — "will you really let these amateurs beat you?" |
| 04 | START of a turn that is not yours, THEY are ahead | **built** — "a victory of legendary proportions" |
| 05 | an OBJECT finished, action kind 13, value byte not 0xFF | a SUPPLY drop — useful equipment, use it wisely |
| 06 | the same, value byte 0xFF | MEDICAL supplies — bandages cost money, do not waste them |
| 07 | action kind 2 or 14 — a medal dropped at the record's own spot | "I am so impressed I am dropping you a medal" |
| 08 | action kind 4 or 16 — `[pig+0x1DE] -= value`, one instruction | a MEDAL TAKEN BACK — "I told you not to blow that up" |
| 09 | an object finished and its LINK partner found (0x4A7600) | the DROP POINT reached — "here are some toys". **Built on the PROPOINT** `[CHECK — remake]` |
| 10 | the same arm, the other branch | a MEDAL for doing it IN TIME — "a big fat medal" |
| 11 | start of turn, ONCE a battle | there may be things lying about, medals included |
| 12 | start of turn, ONCE a battle | collect medals or you will not be promoted |
| 13+14 | the clock running out, ONE pool of sixteen — **MULTIPLAYER ONLY** | "tick tock, get a move on" / "time is of the essence" |
| 15..21 | MULTIPLAYER, by nation: 1..4 praise, 5..8 commiseration | 16 confirmed as praise; the other six unheard |
| 22 | **the exe's front-end arm** | **NOT an idle nag — the MEDAL CEREMONY on the squad screen after a mission**, played over the award animation |

**The ear found a SYSTEM the reader had missed: there is a MEDAL ECONOMY, and
12 says what it is for — *collect them or you are not promoted*.** Five of the
six categories talk about medals: given (07, 10), refused, taken back (08).

**What they hang off was got WRONG here first and is corrected below**: these
are not the weapon crate. They are an OBJECT being finished — a gun, a tent, a
pillbox — through an action record the ordinary crate never gets. See "The
OBJECTIVES machine" further down; the medal counter is `[pig+0x1DE]`.

**One reading was wrong and is corrected.** 22 was written up as "the front end
and its idle nag after twelve idle ticks". Play placed it as the ceremony after
the first mission, on the squad screen, once the award animation has run —
which is consistent with the call site being in the front end, and its seven
lines being 13 to 37 seconds long where every other category runs 1 to 9. The
idle-nag half of that entry is unproven and should not be repeated.

**02 and 04 are BUILT** (2026-08-21) — `sargeAtTurnStart` in
`lib/game/sergeant.ts`, emitted from `announceTurn` in `lib/game/battle.ts`,
pinned in `unit/sergeant.spec.ts`. He speaks over the top of a turn that is not
yours, one turn in four, about how the side that is MOVING stands. Two count
gates in that arm are read and deliberately not applied; the reason is written
where the code is.

**What is left, and what each one is really blocked on:**

- **05..10 — the CRATES, and this is the real item.** Not blocked on the
  sergeant at all: the remake has no medals and no pickup TYPE, only a crate.
  The exe's shape is now known end to end — a pickup carries a type word and a
  value byte, the pig carries the tally at `[pig+0x1DE]`, and file 08's own
  call site is the instruction that SUBTRACTS one from the other. Build the
  economy and six of his categories fall out of it.
- **22 — the ceremony after a mission**, which needs the medals above before
  there is anything to award.
- **11 and 12** — one latch each per battle, but their gates are the medal
  crates again: 11 wants an uncollected pickup of type 2 or 8 still on the map,
  12 an objective of kind 3. They come with the crates, not before.
- **13+14 — MULTIPLAYER ONLY**, and that is read rather than assumed
  (`[0x5206F0] > 1` at 0x4915E9). The window is ten to six seconds left on a
  turn limit over fifteen seconds, once a turn, out of a pool of sixteen. It
  belongs with the net work, not with the campaign.
- **15..21** — multiplayer, one file a nation.

So the sergeant is FINISHED for the single-player campaign as it stands today:
what is left of him is either the medal economy or the network.

**The gate on 01 and 03 is worth remembering before judging the others**: the
praise is refused unless your side leads on TOTAL TEAM HEALTH, so it is not
heard after every kill. The whole chain — the builder at `0x43B850`, all 21
call sites, the camera and the beat — is in `docs/history/turns.md`.
