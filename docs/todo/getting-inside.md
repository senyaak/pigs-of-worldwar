# C. THE REST OF GETTING INSIDE

The SHELTER is done end to end. What is left round it:

- ~~**The PILLBOX** wants its own two weapons~~ — **built 2026-09-03.** 45 HEAVY
  M-GUN and 46 FLAME THROWER are in `buildingSkills`, they fire, and their arms
  are read (`weapons/emplaced.md`). What is left of this line is the **art**:
  the GUN_BARRELS group (BIGBAR, BUNKGUN, PILLBAR, AMPHGUN, B_GUN, TANBAR) and
  how a barrel model is attached to its building, which is not read at all.
  **So the gun works and nothing shows it** — a pig inside a building is not
  drawn (that is the exe's own rule), the barrel is not a model here yet, and
  the round simply appears at the wall and flies. See B27.
- **The camera has no BARREL CAM.** The exe gives skills 45/46 mode **0x11**
  where a gun takes 0x0E (`three/chase.ts` already carries the note). Down the
  sights in a pillbox the remake uses the gun's, which is the wrong shoulder to
  look over when the pig is not drawn.
- ~~**A VEHICLE is the other half**~~ — **the parked half is built,
  2026-09-03** (B28): `vehicles.ts`, `mounts.ts`, and `indoors.ts` holding both
  classes. What is left is DRIVING, the ram, and skill 62 EJECT.
- **Some pigs START inside**: `0x47d4e0` runs once from the map loader, walks the
  object list for every pig whose `[+0x3c0]` is 1, and boards the nearest thing
  within **4096** units. Which marker bit fills `[+0x3c0]` is not decoded (the
  loader takes it from a stack table at `[esp + (flags & 0x40) + 0xc8]`, 0x4a6768).
- Two more for the day a pillbox is worth entering: the exe refuses a building the
  OTHER SIDE is holding (`0x43f910` against `[+0x194]`), and its own reach test
  differences a pair of words out of `0x44e850` that have not been transcribed.
