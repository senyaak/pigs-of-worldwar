# Effects

- **An explosion is 140 sprites and 14 puffs, not six.** Row 0 — which both id 0x54
  and id 0x3e resolve to, so a blast and a crate coming apart are the same picture
  — has five live stages. The two big ones go through `0x48bff0`, which is not a
  particle spawner at all: it hangs its own array of 20-byte records off
  `[child+0x70]`, stepped by `0x48a7e0` and drawn one sprite each by `0x489fa0`.
- **A planted charge's fuse is a small standing flame.** `[exe]` Effect 0x1D:
  ten of the cloud's records, orange (red 15, green 0..14 rolled once each, blue
  nothing), one a frame taken back to the top of the charge and thrown up the
  44° cone at a quarter of the speed, falling by 2 a frame, at a shared age pinned
  at 90 so it never times out; gone two frames after the charge is
  (`effects/fuse.md`, 0x48B85C, 0x4892C8). Not the dark smoke of 0x48AD9D, which
  is effect 0x22's. `[play]` "в оригинале там не дым а искры когда он горит": it
  is lit, adding to what is behind it, which the exe's additive draw agrees with;
  and "искры идут из фитиля а не из самого динамита": it stands on the model's
  fuse tip rather than at the exe's 0x3C up (`lib/game/fuse.ts`, `three/fuse.ts`).
  `[exe]` Each record is a flat quad with no map (`effects/cloud.md`, 0x489FED),
  5500/480 world units wide, about 11: the library divides the size by the
  depth and nothing else, while a position also goes through the focal length, 480
  in the battle's 640x480 (`library/notes.md`, § The SIZE unit, `_d3d.dll`
  0x1000F1B4). So they are specks, and what reads as a flame is ten of them. The
  flame's size and flight are drawn in world units with no `MODEL_SCALE` and no
  `fromExeY`: the exe's pig is this one, five box units at half size
  ([space-and-scale.md](space-and-scale.md), `PIG_HEIGHT`), and `fromExeY` keeps a
  number meaning the same against the terrain, while this flame is measured against
  the pig, so a rise of 64 is a fifth of a pig in both worlds and through `fromExeY`
  it would be a tenth.
- **A cloud's sprite has an exe size the fireball does not use yet.** `cloudWidth`
  (`lib/game/cloud.ts`) is the reading above; the fireball keeps its own
  `BLOB_UNIT` until [b0-black-smoke.md](../todo/b0-black-smoke.md).
- **Every stage goes off on the tick the effect's counter reads `when + 1`.**
  `[exe]` All twelve take one off the counter before comparing, and the counter,
  0 at birth, has already ticked by then: a `when` byte of 0 is the effect's first
  frame, and a later one waits its `when` frames more (`effects/stages.md`,
  0x48BC81..0x48BEE3; `effects/fuse.md`, 0x48A5D6). A stage's `at` in
  `lib/game/effects.ts` is that figure for every stage taken from a row
  (`effects/rows.md`, `effects/melee-and-breaking.md`), and `unit/effects.spec.ts`
  holds the rows to it.
- **An effect's collider is a sphere of radius 35** (0x4a8f42, via
  `jmp [eax*4+0x4a90CC]` at 0x4a8ece where `eax = type - 0x1357`, built by
  `0x407AF0` at 0x4a9044). It does not need to grow — that idea was invented to
  prop up a misread range and is gone.
