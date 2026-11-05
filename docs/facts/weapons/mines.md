# What a projectile does to a mine in the ground

- `[exe]` **ANY PROJECTILE THAT MEETS THE GROUND ON A MINE TILE SETS IT OFF.**
  A bullet, a dart, a rocket and a grenade alike: each landscape contact runs
  one handler, `Projectile::OnHitLandscape` (`weapons/mines.md`, 0x4377d0), and
  its mine arm (0x437a50) asks nothing of the kind. What goes off is what a foot
  sets off: the click, the blast at the tile's centre, the bit cleared for good.
  `lib/game/bullets.ts` and `lib/game/lobs.ts` both call `mines.tread`, on
  contact and not at rest, so a grenade that bounces once on the tile has done it.
- `[exe]` **A ROUND PASSING OVER THE TILE DOES NOTHING.** The trigger is the
  contact, and the air above a tile is not a contact (0x4a8b41).
- `[exe]` **A WET MINE TILE GOES OFF TOO.** The mine arm comes before the water
  arms (0x437bfb), so the grenade that then sinks or skips has already set it
  off (`weapons/fire/water-one-handler-no-depth.md`). `[measured]` 197 of the
  6073 mine tiles on the 61 shipped maps carry the water bit as well, on BAY,
  BRIDGE, ISLAND, LAKE and RIDGE, by a throwaway count over the PMGs.
- `[exe]` **ROW +0x26 HAS NOTHING TO DO WITH IT.** It was read for a while as the
  gate that let bullets trip a mine and stopped grenades. Its one reader
  (0x436201) only turns the body along its flight, which is why it is 1 on what
  flies nose first and 0 on what tumbles (`weapons/mines.md`). The remake carries
  no such field: nothing in the engine would read it.
