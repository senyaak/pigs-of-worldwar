# THE AIRSHIP OVER THE MAP — play remembers it, the remake has none

`[play]`, 2026-11-02: in the original an airship flies over the maps and can be
shot down. The remake has nothing in the sky. Play raised it once before
(2026-08-21, "дережабли летают на картах — их кстати щас нет вроде"), and it
was filed as a sound with nothing to play on.

## What is already known

- **The sound** is `EN_BIP`, placed by ear and wired to nothing
  (`audio/battle.ts`, [sound-bank-unwired.md](sound-bank-unwired.md)).
- **The vehicle** is AIRSHIP1, vehicle kind 5, object 450, spawned by
  `0x470430(kind, cargo)`. The flight controller (0x49CBE0), the hover, the
  leaving and the cargo arms are read: `objects/airship.md`.
- **The wreck drops a crate** of 57, 58 or 59 when it is shot down, but only
  outside the training ground and only while fewer than five pickups are live
  (`[0x51ED94] < 5`, 0x49AD4A). A supply airship that pays for being shot fits
  play's memory better than a bomber does.
- **A counter** `[0x537F78]` is bumped for every kind-5 vehicle built
  (0x4998F6, `objects/vehicles.md`).
- **The notes say AIRSHIP1 is on no map** and list only the three skills as its
  senders (57, 58, 59). Under the repo's own rule that is a search not yet
  made, not a fact: something else may build one at runtime.
- **BIGLOONY** is a separate prop, six records on LUNAR1 only
  ([low.md](low.md)). It is breakable by name (`lib/game/breakable.ts`) and is
  not this.

## The next move

**The direct callers are already counted**: `python tools/xdis.py callers
470430` in the disasm repo finds exactly three E8/E9 calls (0x469B58,
0x47CD33, 0x47CD5F), the three skills. So the ambient airship does not come
through a direct call to the spawner. Look for it through a reference to
0x470430 as data, through the vehicle constructor 0x499870 called some other
way, or through a map record, and read what cargo it carries.
Then read whether the ambient flight differs from the airstrike's flight. Write
the result into `objects/airship.md` before anything is built.
