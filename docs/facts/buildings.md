# Buildings

- `[exe]` **TWO of the six buildings are HOSPITALS, and the tent a player
  meets first is not one of them.** A pig that spends its turn INSIDE one is
  paid at the top of its next: `M_TENT1` fifty points, `M_TENT2` the whole
  deficit, everything else nothing — `Pig::PerTurn` (0x4703A0) into 0x470340,
  which asks the building through 0x43F930, a six-way jump on kind − 1. The
  manual says the same in words. **`TENT_S` and `SHELTER` pay NOTHING**, which
  is why TRENCH's two tents look broken and are not: they take the shelter's
  arm. The heal comes BEFORE the poison's ten in that routine and the remake
  keeps that order. `lib/game/buildings.ts` (`buildingHeal`),
  `indoors.turnStarted`; the first reachable one in the campaign is a MASH tent
  on SNIPER, position 8.
