# E. BIGGER THINGS NOT BUILT

- **The rest of the battle screen** in the order play asks for it.
- **The two unbuilt menu screens** — MULTI-PLAYER leads somewhere, OPTIONS does
  not.

- **Fall damage** (`P_LAND1` is the impact that hurts, and nothing plays it).
- **The melee's own battle cry** — the same `0x43af70` call, not yet wired to a
  swing.
- **The puff a hoof throws.** The footstep handler loads three registers per
  surface and only the first is the sound (lib/game/footsteps.ts, done): the
  other two — 0x0B..0x0D and 0x27..0x2D — go to a 0xE4-byte object built at
  0x475421 and a virtual call at 0x47549d, which is the dust, the splash and
  the snow spray. Nothing draws them.
- **A gun's DAMAGE for the weapons with no row**, and where a no-gauge weapon's
  charge becomes 0xFFF.
