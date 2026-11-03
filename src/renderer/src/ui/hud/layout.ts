// What the dashboard is drawn from and placed by: its archives and fonts, the
// height its art was authored at, and LAYOUT — the live table the console
// nudges.

export const DASHBOARD = 'Language/Tims/dashtims.mad'
export const MARKERS = 'Language/Tims/MAPICONS.MTD'
/** The battle's own big letters — the title card and the floating numbers. */
export const TEXT_FONT = 'BIG'
/**
 * The letters over a pig's head: the battle's SMALL, at its own size,
 * team-coloured per pig. `[exe]`, re-proven 2026-08-28 after two taste
 * detours (BIG, then CHARS2 — play: "не тот шрифт — иди ищи что в екзе").
 *
 * The REAL chain this time (the 2026-08-27 sweep had named two functions
 * that turned out to be a clip test and an overlap counter): the dispatcher
 * 0x459B20 collects and de-overlaps, then per record calls the drawer
 * 0x45A5C0, which touches `[0x51BA54]` eleven times and `[0x51BA58]` never.
 * And the slots are CONTEXT-SWITCHED, not fixed files: the frontend loads
 * CHARS2/CHARS3 into them, and entering a battle 0x480D10 rebuilds the pair
 * as `FETEXT\small` / `FETEXT\big` (0x47E187) — so in battle `[0x51BA54]`
 * IS SMALL. `scanner/notes.md` carries the corrected read.
 *
 * And the battle path draws every glyph STRETCHED ×2 vertically, width 1:1
 * (`BATTLE_STRETCH`, ui/font.ts): SMALL stands 24 tall on screen — the
 * narrow, tall letters play remembers. "SMALL doubled" had once been waved
 * off as a BIG-scale artefact; it was the library's own quad.
 */
export const PLATE_FONT = 'SMALL'
/** The height the dashboard art was drawn for. */
export const AUTHORED_HEIGHT = 480

/**
 * Every number the dashboard is placed by, in one object — and a LIVE one:
 * `pow.hud.layout` in the devtools console is this, so a piece can be nudged
 * a pixel at a time against the real screen instead of through a rebuild.
 * `pow.hud.print()` writes it back out to paste in here.
 *
 * All of it is in the 640×480 units the art was drawn in.
 *
 * - CLOCK: `clock01|clock02` over `clock03|clock04`, and the two digit
 *   windows inside the lower half — those positions are measured off the
 *   assembled art (the dark recesses run x 38..61 and 64..87, a digit tile
 *   being 24 wide), not guessed.
 * - DIAL: `ang1` over `ang3` is the beaded arc with the needle's spindle
 *   down its right edge and `angpoint` turning on it; the face is `wedge1`
 *   and `wedge2`, two 45° fans mirrored into a half-disc, white in the file
 *   and painted a see-through green; the slot is `ang2` over `ang4` — they
 *   OVERLAP by seven rows of plain black, which is what closes their rim
 *   into a ring — with `ang5` capping its right end.
 * - PLATE: the name over a pig, the health under it beside a heart, both
 *   lines in the pig's TEAM colour (contracts/overlay.ts). The letters are
 *   the exe's own SMALL at native size (see PLATE_FONT), and the heart — a
 *   10×11 map marker — stands beside them at ITS native size too, which is
 *   the original's own proportion; it and the fans ship WHITE for the game
 *   to paint, and the heart's pink and the fans' green are matched to play
 *   rather than measured. The heart PULSES — play remembers it beating —
 *   at the lit portrait's own read rate (PULSE_STEP below).
 */
export const LAYOUT = {
  clock: {
    width: 128,
    height: 92,
    digits: { x: 38, y: 39, step: 26 },
    margin: { right: 16, bottom: 8 }
  },
  dial: {
    width: 152,
    height: 121,
    margin: { right: 12, top: 12 },
    /** Where the needle turns, and where every fan has its point. */
    hub: { x: 60, y: 64 },
    arc: { top: 0, bottom: 64 },
    slot: {
      x: 64,
      top: 22,
      bottom: 64,
      cap: { x: 128, y: 31 },
      /** The ring's inside, where the chosen skill's icon goes. Measured off
       * the assembled art: `ang2` and `ang4` are 64 wide from x 64, `ang5`
       * caps the right at x 128 and is 24 more, and the pair runs y 22..100.
       * The icon is centred in it, and one of the menu's own 56×34 ones —
       * with the box pulled 7 left of the arithmetic, which is where it sits
       * against the art in play. */
      icon: { x: 57, y: 22, width: 88, height: 78 }
    },
    green: [104, 168, 72] as [number, number, number],
    /** How much of the battle shows through that green. */
    alpha: 0.5
  },
  /**
   * The POWER GAUGE. Shown whenever the weapon in hand HAS one, which is what
   * the original does with it — the record's own `+0x14` (lib/game/gauge.ts).
   *
   * The strip is `newpow3` through `newpow7`, five 64×64 tiles laid LEFT TO
   * RIGHT, and that order is MEASURED: mean RGB distance across each candidate
   * seam is 28 for 3|4, **2** for 4|5, **2** for 5|6 and 38 for 6|7, against
   * 107..181 for every wrong pairing. `newpow3` is blank down its left four
   * columns and `newpow7` down its right eleven, which is what makes them the
   * two ends. All five are drawn WHOLE: index 0 is the TIM's transparent
   * colour, so the black is a hole and not a slab — clipping them to their top
   * thirty rows cut the ends' own art in half.
   *
   * **`powg1` is the SLIDER**, not decoration: 24×36 with its content in cols
   * 8..15, rows 1..32 — a marker eight pixels wide and thirty-two tall. It
   * RUNS along the strip with the charge; the gauge is not a filling bar.
   *
   * And it runs along the BAR, not across the widget, which is MEASURED: per
   * assembled column the art's vertical extent is tall and irregular out to
   * x≈100 (up to row 63), then **dead constant at rows 1..37 from x 104 to
   * x 268**, then tall again. That flat middle is the trough; the two ends are
   * ornament. Play saw the difference — "набор силы идёт по шкале, а не через
   * весь виджет". The track is the trough's own span, 104..268, END TO END —
   * insetting it by half the slider's box was wrong twice over: it moved the
   * START, which was never the complaint, and the box is 24 wide while the art
   * inside it is only eight (cols 8..15), so the art sits within four pixels of
   * wherever the slider is put.
   *
   * `newpow1`/`newpow2` are the piece at the TOP LEFT: 64×20 each, and by
   * their own seam a 128-wide pair whose art sits at cols 45..89. Play named it
   * as missing; where exactly it sits is eyework like the rest of this object.
   */
  gauge: {
    width: 320,
    height: 64,
    margin: { bottom: 0 },
    /**
     * The trough's own span and row. `to` is **265**, and it was 268 — those
     * three pixels are what play kept seeing go over the edge.
     *
     * MEASURED off the ASSEMBLED strip with the right transparent colour, which
     * is the TIM's 0x0000 rather than palette index 0: per column the drawn
     * profile is dead constant at rows 0..39 from **x 92 to x 265**, with the
     * taller ornament either side. The old 104..268 came from treating a
     * different index as the hole. The START is deliberately left where play has
     * already accepted it — only the end moved.
     */
    track: { from: 104, to: 265, y: 1 },
    /**
     * The slider's box, and where its VISIBLE art sits inside it — MEASURED off
     * the shipped TIM rather than eyeballed, which is what it took to stop this
     * overhanging.
     *
     * `powg1` is 24×36 and its transparent colour is palette index **11**,
     * which is 0x0000 — not index 0, which is a real 0x0421. Per column the
     * count of drawn texels is
     * `0,0,0,0,0,0,0,13,17,19,33,34,34,33,19,17,13,0,0,0,0,0,0,0`: the marker is
     * **ten pixels wide starting at x = 7**. The note that had it at cols 8..15
     * was wrong by one on each side, and one pixel is exactly what play kept
     * seeing ("всё ещё чуть выходит за границу шкалы").
     *
     * The travel is the MARKER's: its left edge runs `from` to
     * `to - art.width + 1`, so its LAST pixel lands on the trough's last one
     * and never past it. The box is drawn `art.x` behind the marker.
     */
    slider: { width: 24, height: 36, art: { x: 7, width: 10 } },
    /**
     * **The LENS at the gauge's left end — `pcpie4`, and how full it is says
     * what the weapon DOES.**
     *
     * Play put it here in as many words: "надо в низу левее нуля шкалы — там
     * есть полузалитый круг", after a first pass hung it behind the weapon slot
     * on the dial. Zero is `track.from`, so this sits in the ornament before it.
     *
     * `pcpie4` is the only pie in the whole install — one 32×32 image, a red
     * disc in a brass ring — so the fraction cannot be frames. It is CLIPPED,
     * from the bottom. Nothing in the exe has been traced to the sprite at all,
     * so the direction, the amount and this position are eyework and live here
     * for the console.
     *
     * `disc` is MEASURED off the art rather than assumed: red-dominant texels
     * run from row **2 to row 29** of the 32, so a fill against the tile's own
     * height would leave two dead rows top and bottom. The fraction is taken
     * against the disc, which is what "half" is meant to be half of.
     *
     * Play: "красный индикатор гранаты заполнен на 3 четверти — должен быть на
     * половину." `fill` is the number to move for that, live:
     * `pow.hud.layout.gauge.lens.fill = 0.4`.
     */
    lens: { x: 50, y: 4, width: 32, height: 32, disc: { top: 2, bottom: 29 }, fill: 1 },
    /** The pair above the left end, `newpow1` then `newpow2`. */
    cap: { x: 0, y: -18 }
  },
  /**
   * The scope the aim view looks through. Both numbers are EYEWORK, like the
   * rest of this object — nudge them in the console against the real screen
   * and `pow.hud.print()` the result back out.
   *
   * `surround` is not eyework: rgb(8,8,8) is the colour of the `sights`
   * quadrant's own outer corner, read out of the TIM, so the fill beyond the
   * four pieces matches the art exactly rather than nearly.
   */
  scope: {
    /** How wide the hole is, of the authored 480-tall view. */
    size: 400,
    surround: 'rgb(8,8,8)',
    /**
     * How far each piece runs PAST its own edge, in authored pixels.
     *
     * The four quadrants and the surround around them are drawn through a
     * fractional `scale`, so an edge that ends exactly where its neighbour
     * begins lands between two device pixels and the join shows as a seam.
     * Everything at a join is the same solid rgb(8,8,8), so a pixel of
     * overlap costs nothing and closes all five of them.
     */
    overlap: 1
  },
  plate: {
    /** Seconds a pig must have stood still before its name comes back. Play
     * on the original: "задержка есть — но не 2 секунды а меньше" — and then
     * cut it again (2026-08-27, "надо уменьшить таймер непоказывания"):
     * 2 → 1 → half a second. Play's dial. */
    delay: 0.5,
    /**
     * …and seconds it is shown for after its number went DOWN, whatever it is
     * doing.
     *
     * Play: "хп должно показываться когда уменьшается — иначе не видно", and it
     * is the water that needs it: that damage spawns no number and plays no
     * sound at all (lib/game/drowning.ts), so the plate is the only report. The
     * exe agrees in its own terms — every `TakeDamage` raises the
     * dashboard-stale flag `[0x537FC0]` (0x467c10), the water's own bite
     * included (0x47000d).
     */
    hurt: 2,
    /** Between the name and the health line under it. */
    gap: 2,
    /** How far the name floats over the pig's CROWN, in GAME units — the
     * scene adds the pig's own height (three/pig.ts), so this is clearance
     * and nothing else. It used to be 900 measured from the soles, which
     * was two thirds of a pig's height of empty air and stopped meaning
     * anything when the model's scale moved. */
    lift: 120,
    /**
     * NATIVE — the exe prints the plate in SMALL at the glyphs' own 12 (see
     * PLATE_FONT: the read that ended the scale-hunting, twice). The 0.75s
     * and 0.525s this carried were all attempts to shrink BIG toward a size
     * that was really another font's — a bitmap font reads best unscaled.
     *
     * The outline below does NOT follow this and that is the point: it is a
     * constant weight in screen pixels whatever the glyphs do.
     */
    scale: 1,
    /**
     * How far the BLACK OUTLINE stands off the letters, in screen pixels.
     *
     * `[play]`: "отсутствует чёрная обводка текста для имён и хп". A plate is
     * read against grass, snow, mud and a pig's own colours, and a team colour
     * on its own disappears into half of them — the original outlines it. Zero
     * turns it off.
     *
     * It is in SCREEN pixels rather than the plate's own units on purpose: an
     * outline is a constant weight whatever `scale` is doing to the glyphs, and
     * at a fractional scale an offset multiplied by it would land between two
     * device pixels and fade.
     *
     * It is a RADIUS and the stamp is a filled disc, not a ring — see
     * `aroundBy`. Play moved it 1 → 2 → 3 around BIG's tall letters, back
     * to 1 when the plate went to SMALL — then OFF, because SMALL carries
     * its own dark edging INSIDE the art ("обводка должна быть внутри
     * букв"); ON at 1 for CHARS2's brief stay, whose inner edging did not
     * read at plate size ("давай снаружи"); and OFF again with SMALL's
     * return. The dial stays for a font that has no edge of its own.
     */
    outline: 0,
    /** The heart's ×2 is the exe's own proportion now: the original's heart
     * is a GLYPH of the plate font (SMALL's coloured palette indices, chars
     * 0x5E..0x61 blinking, text/notes.md) and rides the same ×2 vertical
     * stretch the letters do — so the 10×11 marker art stands doubled
     * beside 24-tall letters. The pink stays play's, and so does the GREEN
     * a poisoned pig's heart turns — which the exe agrees with in
     * mechanism: the heart glyph's colour comes off a per-STATUS table
     * (0x4CF2A0). The art is white and both are tints of it. */
    heart: {
      colour: [248, 64, 152] as [number, number, number],
      poisoned: [96, 200, 72] as [number, number, number],
      scale: 2
    },
    /**
     * Seconds a plate takes to FADE IN once its gate opens. Play, against the
     * original side by side: "имена вейдятся не просто показываются". The
     * original's own ramp is not read — this is play's dial, like the delay.
     */
    fade: 0.3
  }
  // THE MAP has no entry here on purpose: nothing about its placement or its
  // size is free. Where it sits, how big it is, how far it tilts and how it
  // turns are all read out of the library, and they live with the reading in
  // `lib/game/scanner.ts`.
}

/** What the specs wait for; the console tweaks `LAYOUT.plate.delay`. */
export const PLATE_DELAY = LAYOUT.plate.delay

/**
 * The console IS the layout editor — there is no UI for it, the same way
 * `pow.swapMap` is how a map is changed:
 *
 *     pow.hud.layout.dial.slot.bottom -= 1   // nudge, watch, repeat
 *     pow.hud.layout.dial.green = [90, 150, 60]
 *     pow.hud.print()                        // paste that back into hud/layout.ts
 *
 * Every number is in the 640×480 units the art was drawn in, so what is
 * printed is what the source says, whatever the window size.
 */
export function offerLayout(): void {
  // `window.pow` is the controller module's, made when it loads; this only
  // hangs the layout off it, so nothing here touches `window` until a HUD is
  // actually built (the pure specs import this file under node).
  if (!window.pow) return
  window.pow.hud = {
    layout: LAYOUT,
    print() {
      console.log(JSON.stringify(LAYOUT, null, 2))
      return LAYOUT
    }
  }
}
