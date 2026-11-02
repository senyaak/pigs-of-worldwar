# THE PROVING GROUND — one map to test every weapon and vehicle on

`[play]`, 2026-11-02. Play wants to test every weapon and machine in one place
before going back through the campaign. This is the remake's own map; the
original has no such thing, so its LAYOUT is ours. Everything that HAPPENS on
it is the original's, and nothing on it may bypass a rule the campaign uses.

## What play asked for

- **A straight, flat strip of ground.**
- **Training dummies that come back.** A destroyed dummy stands up again.
- **A row of crates in front of the pig.** Each crate hands over ONE round of
  one skill. A crate that was taken is back at the start of the next turn.
- **A signpost by each crate** showing the skill's icon.
- **Vehicles to get into**, drive and fire from.
- **No rank gate.** Play's word: in the original a pig may use any skill it
  holds, whatever its rank, so any pig can test anything here.

## What the build should add to that

- **The dummies should be real enemy pigs** that skip their turns and stand up
  at full health at the start of a turn. Then reactions, deaths, damage
  numbers and dropped crates get tested too.
- **The signpost icons are the original's**: `Language/Tims/MENUTIMS.MAD` holds
  one 56×34 icon per skill, in skill order (`skills/notes.md`).
- **The emplacements**: a PILLBOX and a BIG_GUN beside the vehicles. The
  artillery is a building's magazine (`weapons/artillery.md`), a separate code
  path from a vehicle's.
- **Room for the airship**: the air strikes and the airlift (57, 58, 59) fly in
  from 16384 units back, so the strip needs that much sky.
- **A little relief off to one side**: a water edge, a slope and a wall.
  Grenades bounce, mines roll and a pig walks out of water onto a bank, and a
  flat strip shows none of it.

## Why it matters beyond play

The same map is the bench for automated specs: an agent can fire each skill at
a dummy and compare damage, range and knock with the numbers read from the exe.
Then play only has to judge what a number cannot show.
