# P2b. THE GAS FAMILY — 26 POISON built 2026-08-27, and what is still open

The canister streams, the cloud touches for fifteen flat and leaves the bit,
the bit costs ten at every one of the pig's own turns until any heal, the AI
prices the throw (`weapons/gas.md` in the disasm repo is the read;
`docs/history/weapons.md` the write-up; lib/game/gas.ts and poison.ts the
build). Still open, smallest first:

- **The AFFLICTED STANCE.** The exe's animator plays clip 11 Scramble as the
  idle of any pig whose status word is non-zero (0x467f2a). Here a poisoned
  pig stands about like anyone; the sneeze and the per-turn number are the
  only tells. One line in the idle picks the day it is wanted.
- **The GREEN FACE, if there is one** — the FACES.MTD picker past the load at
  0x486030 is unread; play's memory says a poisoned pig looks sick. `P_COUGH1`
  and `P_SICK` sit in the banks unwired beside it.
- **23 CONFUSION, 24 FREEZE, 25 MADNESS** — rows corrected, statuses not
  built: all three burst as plain stand-ins. The PC exe makes CONFUSION
  LITERALLY the same weapon as POISON (one projectile id, 416) — whether
  that is the game or a port accident wants play's ruling (and maybe the
  PSX's) before the confusion gas is built as a green poisoner.
- **The SWAMP poisons in the original** — tile type 11 in the water tick sets
  the same bit (0x4700de). Not built; the bogs on the shipped maps currently
  only drown.
- **Skill 41 GAS SHELL** (`artgas`) streams the same clouds off the same
  numbers — lands with the artillery, whenever that is.
- **The AI does not know a PLUME lingers**: it prices the throw and the
  poison's instalments (`POISON_WORTH`, evaluate.ts) but never avoids walking
  through a standing cloud, and never walks a poisoned friend toward a heal.
