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
  `[CHECK — remake]`: the sprite's unit and soft edge are the fireball's own
  (`three/effects.ts`, `BLOB_UNIT`), where the exe's cloud is flat and the unit is
  the library's.
- **An effect's collider is a sphere of radius 35** (0x4a8f42, via
  `jmp [eax*4+0x4a90CC]` at 0x4a8ece where `eax = type - 0x1357`, built by
  `0x407AF0` at 0x4a9044). It does not need to grow — that idea was invented to
  prop up a misread range and is gone.
