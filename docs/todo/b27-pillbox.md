# B27. THE PILLBOX HAS ITS GUN, AND NOTHING SHOWS IT — 2026-09-03

The first of the MACHINES: play asked for the stationary ones before the ones
that drive. Read out of the exe the same day (`weapons/emplaced.md`, which
closed five arms `fire.md` had only sized), built, and 18 specs in
`unit/pillbox.spec.ts`.

**What works.** Sitting in a PILLBOX puts 45 HEAVY M-GUN and 46 FLAME THROWER
in the menu, both unlimited; the pig can TURN on the spot but not walk; the aim
is clamped to the mount's own **±512** instead of a pig's ±1023; the round is
born OUTSIDE the building's box and flies. Off a mount the pair is inert — no
round, no sound, no refusal — which is the exe's own gate on `[pig+0x170]` and
not an omission (a crate hands both over, bytes 41 and 42).

**What is worth watching in play, because it reads as a bug and is not:**

- **A pillbox gun THROWS NOBODY.** Row +0x08 is zero on both, where a rifle's
  bullet still shoves 48. Nothing an emplaced gun hits is moved by it.
- **And it barely hurts.** The HMG is **eight** points against the rifle's
  twenty; the flamethrower is **four**. They are the two weakest rows in the
  weapon table. A pillbox is a cheap position that never has to walk, not a
  strong one — but if play remembers it hitting harder than a rifle, the row
  reading is what to doubt.
- **Nothing turns on screen.** The pig inside is not drawn (the exe's rule) and
  the barrel is not a model here, so the only visible thing is the round
  leaving the wall. `BARREL_CLEAR`/`BARREL_DROP` in `lib/game/barrel.ts` are
  the remake's own numbers and can be nudged if it looks wrong.
- **The camera is the gun's, not the barrel's** — mode 0x0E where the exe uses
  0x11 for these two. Section C.

**Left open beside it.** The BIG_GUN's barrel elevates too (kind−1 of 0, range
[0, 512]) and **what it fires is not read** — the AI scores 39 ARTILLERY RANGE
differently for a pig inside one (0x4429c9), which is a hint. `buildingSkills(1)`
stays empty rather than guessing.
