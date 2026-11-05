# What a blast does to a pig, and where the remake is short of it

`e2e/000/proving-bench-lobs.spec.ts` pins each of these as it stands today.

- `[exe]` **The damage falls off over the row's radius + 147 − 512.** A pig's term is
  85√3, its collider's bounding radius (`weapons/fire/blast-range-and-rim.md`, 0x48CC46,
  0x405710). The remake has 85 there (`blastReach`, `lib/game/grenade.ts`), so it falls
  off a little faster: open, TODO-ISSUE.
- `[exe]` **Blast points are cut to whole points, not rounded**
  (`weapons/fire/blast-range-and-rim.md`, 0x477C4A; the heal the same, 0x47790A). The
  remake rounds (`lib/game/blast.ts`): open, TODO-ISSUE.
- `[exe]` **A blast's throw has no core.** It falls off from the burst itself, as
  1 − 3d/4R over the row's radius (`weapons/fire/phantom-sweep.md`, 0x40A500). The remake
  gives the throw the damage's share, whole inside 512 units (`lib/game/blast.ts`): open,
  TODO-ISSUE.
- `[exe]` **A contact round goes off on a body it touches**, unless that body is a
  projectile or an effect (`weapons/cluster.md`, 0x438462). The remake's meets only the
  ground and the map's objects (`lib/game/lobs.ts`), so it goes through a pig: open,
  TODO-ISSUE.
