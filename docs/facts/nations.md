# Nations, skins and hats

- **A NATION and a SKIN are two different numbers, and the art goes by the
  skin.** SELECT TEAM writes a nation (0 British, 1 French, 2 American,
  3 Russian, 4 Japanese, 5 German, 6 Lard); every archive, hat, colour and
  paper is indexed by the skin (0 British, 1 American, 2 French, 3 German,
  4 Russian, 5 Japanese, 6 Lard). `Team::SkinOf` (0x4508E0) is the one
  converter, `{0,2,1,4,5,3,6}` with anything out of range clamped to Lard.
  `lib/game/nations.ts`. `[exe]`

- **The enemy's nation comes from the SAVE, not the map.** The whole campaign's
  opponents are rolled once when the army is born — five rounds of five,
  balanced, never the player's own, and position 25 forced to Lard — and the
  boot camp takes `(own + 1) % 6` instead (0x41A409). `lib/game/enemies.ts`,
  `army/skins.md`. `[exe]`
- **Only the heavy-gunner family wears a nation HAT.** `ClassToModel`
  (0x4C2E50) gives model type 2 to classes 1, 2 and 3 alone, and the exe hangs
  a hat off bone 2 when the type is 2 and zeroes the slot otherwise (0x440D71);
  every other class carries its headgear in its own mesh. The hat takes the
  same half turn every attachment gets at load, and `Chars/BRITHATS.MAD` is
  unused — its name is nowhere in the executable. `[exe]`
- **A nation is a REPAINT.** All seven `Chars/*.MTD` hold the same 120 entries
  under the same names at the same sizes, and 105 of the ~110 that differ from
  the British ones differ only in their palette. So one geometry load dresses
  any nation, and `loadModel` takes the archive as an argument. `[measured]`
