# B23. THE HERO'S FIVE, READ — 2026-09-01, and two of them are not weapons

The block B22 priced at 323 bytes, taken. `weapons/fire.md` has all of it; what
follows is what it means for the build.

- **53 MEDIC is a first-aid kit.** `min(deficit, 50)` on the pig ITSELF, no cone
  and no target search — and it runs at FULL health whenever the status byte is
  set, which is the same gate the medicine ball carries and is what cures the
  poison. Buildable today: it is `healing.ts`'s arithmetic pointed at the user.
- **56 SHOCKWAVE is a PUSH.** Fifteen points over 2048 — but a FORCE of 9750
  against TNT's 6500, the largest in the game. And it does NOT take the pig out
  of the world the way the suicide arm does, so **it throws and hurts its own
  user**. That asymmetry is the design, and the remake's `burst` already has
  every piece: it is one call with the right numbers and no `isDead` shortcut
  in front of it.
- **58 AIR STRIKE and 59 CLUSTER AIR STRIKE send a VEHICLE.** Both call one
  general routine with kind 5 = `AIRSHIP1` (name row 450), placed 16384 units
  back along the pig's own aiming bearing at the map ceiling + 2048. They differ
  in ONE argument, and what the airship does with it lives in the vehicle
  constructor 0x499870 — **the next thing to read**, and it is also where the
  ARTILLERY's delivery must live, since the routine is general.
- ~~**57 SPECIAL OPS is not a weapon.** No arm in the fire table (it points at the
  shared tail) and a SHOUT in `Pig::Fire` (sound 0x5C) and nothing else. Both
  dispatchers read to their last instruction.~~ **WRONG — there is a THIRD
  dispatcher** (2026-09-15): the after-fire routine 0x469610, reached ten
  frames after the press, spends the slot and switches on the skill, and its
  arm for 57 sends an AIRSHIP with the pig aboard to the targeted point.
  `objects/airship.md`. The lesson is the file's own: two dispatchers read to
  their last instruction are not the dispatchers.

So the HERO's kit is smaller than it looks: of the five that made it half dead,
~~**two are real, one is a delivery that needs the vehicle read, and two do not
exist** (57 here, and 23 CONFUSION which B22 had already found).~~ **four are
real and one does not exist** — 53, 56, 57 (the airlift), 58/59 (the airship
is read now) — and only 23 CONFUSION is the one the exe never fires.

Also mapped on the way: `Pig::Fire`'s own switch over all 62 weapons, eight
entries of which two are the epilogue.

**One thread left**: a THIRD caller of the send-a-vehicle routine (0x469B4C)
asks for the same airship with a fourth cargo, from inside the pig's reaction
code. If the canopied supply drop is ever wanted, that is the door.
