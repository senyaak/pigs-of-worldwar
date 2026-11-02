# What a map places — the POG

- **A map does not place the same things in every game.** The low byte of a
  record's flags is which player count it exists in, and the loader drops it
  otherwise (0x4a58cb). **The count to ask with is the number of PLAYERS, and
  the campaign is ONE** — not the number of sides fielded, which is two.
  Confusing them cost ROAD its whole squad: its five scripted markers carry
  low byte 0x71, the first player bit only, so at two players the player's
  side vanished and the enemy's four-player pair was promoted to ours.
  `PLAYERS` in `lib/game/muster.ts`, pinned in `e2e/002/spawns.spec.ts`. `[exe]`

- **The POG stores true world coordinates**, paired to geometry in the map's own
  `.MAD` by NAME, with y an ELEVATION of the model's CENTRE — so props hover
  their own half-height by design. The turn is `phi = yaw − π/2`, pinned to the
  QUARTER (not the sign) by CAMP's iron gate. Every name that fails to resolve
  ends in `_ME`: those are the pig spawn markers, class in `type`.
  `objects/notes.md`. `[exe]`

- **A map's spawn side bit is a SLOT, not a nation.** DEVI carries slots 2 and
  4 and OASIS 1 and 5, with no slot 0 on either, and both are campaign maps.
  Which side is the PLAYER'S is record `+0x58` bit 0, which `Map::Load` tests
  before it looks at the side bits (0x4A5D2A); exactly one side per shipped map
  carries it. `lib/game/spawns.ts`. `[exe]` for the branch, `[measured]` for the
  survey.

- `[CHECK — remake]` **One line about solidity is still the remake's own.** The
  record says most of it — field 11 picks the collision shape and only kind 0
  is a box, so every bridge and step piece is bodiless in the original too, and
  a crate is a pickup exactly when it carries something. What the data does NOT
  say is whether grass belongs in the collision world at all — and the sweep
  (0x406bb0, read 2026-09-15, `movement/sweep.md`) does not say either: every
  kind-0 record gets its box and the sweep walks every box, so in the exe a
  one-unit grass box IS a body, and `lib/game/obstacles.ts` still draws its own
  line at a box two units across — which drops grass, flowers and the swimming
  fish, each of which carries a box exactly one unit wide. Still the remake's
  call; now a divergence from a known original rather than from an unread one.
