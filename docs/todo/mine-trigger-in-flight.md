# 0. THE ONE THING READ AND NOT BUILT — a grenade sets off a mine here and cannot in the exe

An INVERSION rather than a gap, found while reading the plant pass. `lobs.ts`
calls `mines.tread` where a lob lands, so a grenade thrown onto a mine tile
sets it off; nothing in `bullets.ts` does, so a rifle round cannot. The exe is
the other way round: its in-flight trigger, 0x437a50, is a projectile's Move
override, and `Projectile::Update` calls that override only when
`[proj+0xc7]` is 1 — row field **+0x26**, which is **1 for bullets, darts and
rockets, 0 for every grenade (rows 24–33, 37) and every mine and charge
(38–41, 52–53)**. So the original lets you SHOOT a mine and not grenade one,
and the bazooka's rocket sets one off.

The build wants +0x26 carried on the projectile and lob rows and the trip put
behind it. Not done because it touches every row table and the session's mine
work was the plant pass.
