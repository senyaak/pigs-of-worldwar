# The campaign map

- `[exe]` **A territory is a GREY MASK ADDED to the map, not a patch of paint
  laid over it.** The 25 site patches, the region `flag` and the four marker
  parts `ar1..ar4` are greyscale silhouettes; the nation colour is a DIFFUSE
  at 255-neutral (`D3DTSS_COLOROP` is never set, so the stage stays at
  MODULATE), and the world composer blends with SRCBLEND = DESTBLEND = ONE.
  So `screen = bigmap + mask × colour/255`, `ui/pigMap.ts` draws the patches
  with `globalCompositeOperation = 'lighter'`, and the blink is a WHITE FLASH
  rather than a hole. `fpole` and the six region pages are real colour art and
  take no tint. **EVERY stand of a region flies a flag, from the campaign's
  first day** — the region loop (0x483566) carries no comparison at all and
  never reads the campaign position, so there is no "only where we have been"
  and no such thing as a bare pole; what a flag says is who HOLDS that
  mission. The whole model is in `pigmap/notes.md`.
