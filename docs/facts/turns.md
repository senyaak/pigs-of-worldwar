# Turn order, and who takes the field

- **A side's FIRST turn falls on its SECOND pig.** The team is a linked list
  in POG-marker order and the turn is a round-robin over it, dead-skipped
  (`Team::NextPig`, 0x499370) — but `NextPig` with an EMPTY cursor takes the
  first living pig and returns the one AFTER it, and only the side that opens
  the game has its cursor seeded (`StartGame`, 0x496918). So the player goes
  slot 0, 1, 2… and every other side goes 1, 2, 3, …, 0. `lib/game/game.ts`,
  `NO_CURSOR`. `[exe]`

- `[gap]` **Two sides, though a map offers up to six.** The spawn markers name
  six (FINAL uses all of them, the arenas four); the battle fields the first
  two it finds, because there is no AI for the rest. There is no filling in
  either way: CAMP fields ONE side of ONE pig, because that is what the
  training ground carries, and a map with no markers refuses to open.

- `[play]` **EVERYONE drops in together.** The POG's parachute bit picks out
  one side of a campaign map — the player's, with the enemy standing on the
  ground, which is what the exe builds — and play rules otherwise: "все
  свины падают на парашютах". One flagged marker among the fielded sides
  puts the whole battle under canopies (`mapSquads`, lib/game/muster.ts); a
  map that flags nobody still stands everyone, and the bit itself stays read
  as the exe reads it (`e2e/002/parachute.spec.ts` pins the data).
