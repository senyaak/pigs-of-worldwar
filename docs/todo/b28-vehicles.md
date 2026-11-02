# B28. A VEHICLE IS A MOUNT NOW, AND IT DOES NOT DRIVE — 2026-09-03

Play asked for the machines, stationary first. The parked half is built and the
moving half is not, which is a deliberate line and not a stall: a parked tank
IS a pillbox with a different table, and that table is now read
(`objects/vehicles.md`, which opened a class the notes had listed as never
touched, plus the stat table at 0x4D94A0 that nothing had found).

**What works.** A TANK, CARRY or AMLAUNCH record is a thing a pig gets into,
with the shelter's own door and glide. A tank offers its three weapons —
47 TANK AIRBURST, 48 TANK BAZOOKA, 49 TANK MORTAR — and the turret elevates
**0..1024**, twice a pillbox's reach and with no depression at all. `indoors.ts`
holds both classes now and `mounts.ts` is the dispatch, so nothing can read a
vehicle kind off the building table (kind 3 means M_TENT2 to one and TANK to
the other — that is the bug the dispatch exists to stop).

**Where it can be MET.** Nine vehicles in the whole campaign, measured over the
61 shipped POGs: **six TANKs on OASIS (mission 8)**, **two CARRYs on SNAKE
(18)**, **one AMLAUNCH on BAY (16)**. AM_TANK is only on the `GEN*` templates,
and BOAT, AIRSHIP1 and PP1 are on no map at all. So the first tank a player
meets is on OASIS and there is nothing before it.

**They DRIVE, as of the same day** — and the honest note is that the drive's
shape is the manual's rather than the exe's. What was searched and not found:
every call from the pig's region into the vehicle class, every non-pig caller
of it, every read and write of `[veh+0xC0]`, `[+0xEC]` and `[+0xF0]`, and the
whole riding arm of the pig's state machine (0x46E112, which turns out to be
the door glide and the animation player and nothing else). **Where the input
sets the motion bits is not in any of those**, and 0x49ED70 — which displaces
the hull `arg * 2` along its heading — has no caller either. `lib/game/drive.ts`
carries the whole negative so nobody repeats it.

So **the SPEED is invented**: `DRIVE_SCALE = 1.5` of a pig's walk and
`DRIVE_TURN_SCALE = 0.6` of its turn. `[CHECK — remake]`, and the first thing
to judge in play.

The RAM is not invented: **twenty points and a shove of 120 at 45°**, straight
out of 0x4780BB, and only from a hull that actually MOVED that frame — the
exe's own `[veh+0xC0]` test. A carrier instead picks up, and only its own side
(0x4781F9 compares `[pig+0x194]`), which is the manual's "one of your
team-mates" against the tank's "friend or foe".

**And a ram is an ATTACK.** Play: "если наехать на когото — будет урон и конец
хода — считается атакой." It spends the turn's one blow and ends the turn, the
way firing does — which had to be stated explicitly, because nothing about a
ram goes through `attack.ts`: no skill in hand, no `used` answer, and the fire
ladder never runs. `ram.ts`'s `ramWasAttack` is the rule and `battle.ts` reads
it. **Picking a chum up is NOT a blow**, on the manual's own word: "picking up
a group of your chums and driving them all across the map in one go" — a group,
in one go, so the first pickup cannot end the turn.

**What is still NOT built:**

- **EJECT, skill 62.** The manual's way of getting a passenger back out of a
  carrier. It has no fire-table entry at all, so it lives in the
  inventory-SELECT table at 0x4935EC and is a different mechanism from every
  weapon. Until it exists a passenger a carrier picked up can only get out by
  the ordinary door, on its own turn — the two carriers still offer an EMPTY
  menu.
- **The hull is a POINT against the collision world.** `driveStep` asks
  `stopper` at the hull's centre, so a tank can push its nose into a wall
  before it stops. The exe has two bodies and a contact solver.
- **A vehicle refuses to drive off a drop** rather than falling, because a
  tumbling hull is a physics problem this engine has no answer for.
- **Nothing tilts.** The exe's own per-frame (0x49E610) differences four corner
  heights into a pitch and a roll clamped to ±120. Read, not built.
- **Breaking one.** 150 points in the table, read and not applied, exactly as a
  building's is. The manual: "it's best to abandon a vehicle before it is
  destroyed. Its death throes can cause you a large amount of damage."
- **Amphibious.** "Don't drive vehicles on water unless they are amphibious."
  Which kinds those are is only the NAMES saying it — no flag column was found,
  and the stat table's three columns are health, capacity and a constant 30.

**What reads as a bug and is not:**

- **A tank cannot shoot downhill.** The turret's minimum is a hard zero.
- **Being run over hurts as much as being shot** — twenty points — and throws
  harder than anything but a blade or a blast.
- **A parked tank is harmless.** Standing in front of a stationary hull does
  nothing at all; it has to be moving.
- **The turret follows the PIG.** In the exe a tank's gun points where the
  TURRET points (`[[pig+0x170]+0xA0]`), where a pillbox's points where the pig
  does — and the remake uses the pig for both. `[CHECK — remake]`.
- **49 TANK MORTAR is the weakest lob in the game**, fifteen points, and 48 is
  the carried BAZOOKA with a softer shove. Only 47 is worth the turret.
- Nothing on screen turns, and the pig is not drawn — the same B27 hole.
