# B00. A COLLECTED CRATE TAKES NOTHING — fixed 2026-08-12, NOT PINNED

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play: "если сломать не дверь динамитом — туториал багуется — я сломал стену,
взял аптечку, и там пропал динамит и не появилась базука."

Read off CAMP's own records: the DOOR (45, `STW04_D2`) is the only piece of the
house with a health of its own — **50, exactly TNT's core damage**, where the
walls beside it take the table's 60 — and the only one carrying a command
(opcode 22, waits on 89, signals **7**), which the bazooka crate (18) and the
health crate inside the house (55) wait on. So breaking a wall places nothing,
correctly. What dead-ended it was ours: every crate cleared the inventory on
COLLECTION, which is play's own earlier rule on top of the exe (whose
`ClearInventory` fires from the PLACEMENT arm alone, 0x4aa6cb, unconditional).
Every skill on the training ground is UNLIMITED, so the TNT should have survived
a wasted charge — and there is no second TNT crate, record 52 being the only one.

**The whole rule is gone now, weapon crates included** — "ящик с оружием при
подборе всё ещё забирает то, что несёшь — а вот это давай сразу почистим" — and
nothing is lost with it: "one weapon at a time" rides the PLACEMENTS, which is
where the exe puts it (0x4aa6cb, the pickup branch only). **And that can only
ever fire on CAMP**, measured over all 61 shipped POGs: it is the only map whose
crates WAIT to be placed (eight of them). Eight other maps run script steps —
BHILL, BRIDGE, GENMUD, MASHED, OASIS, SNAKE, SNIPER, TRENCH — but what they hold
back is scenery, never a pickup.

**PINNED — `e2e/002/crate.spec.ts`**, which play sized itself: "спавни ящик
прям перед свином — путь пройдёт… потом используй, и если бесконечное не
пропало, если конечное пропало — норм?" Two tests, both on shipped maps and no
new debug write:

- CAMP — a grenade in the pockets first (`pow.give`), then the bayonet crate
  WALKED into from a stride away, which is `reached` doing its own job. The
  grenade survives the collection (the pin this section exists for), the bayonet
  arrives UNLIMITED, and it is still there and still unlimited after a swing.
- GUNS — its TNT crate, the one charge, on a map that is not the training
  ground so a slot carries the record's own count. Planted once, and the slot is
  GONE (`spend` drops it at zero) — TNT being the weapon that does not hand the
  turn over, so one press settles it.

One thing the writing of it turned up, and it is in the spec at `useUntil`: a
FIRE press on the frame the skill menu is still up is read by a control set that
does not carry the fire key, and the latch goes with it. One frame either way,
so a spec that presses once passes and fails on alternate runs. It presses until
the blow starts instead; four runs, four passes.
