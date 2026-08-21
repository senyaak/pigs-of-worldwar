// The battle's dashboard, in the game's own brass.
//
// What the original keeps on screen, from play:
//
// - the CLOCK, bottom right;
// - the ANGLE DIAL and the WEAPON SLOT as one widget, top right, always
//   there — the slot empty until a weapon is chosen;
// - the MAP, bottom left — the level from above with a blip on everything
//   worth one, turning under the camera (ui/battleMap.ts);
// - over each pig, its NAME and its health beside a heart, which hide while
//   the player is moving and come back after a couple of seconds' rest;
// - the power gauge, only when the weapon in hand asks for one.
//
// The pieces come out of `Language/Tims/dashtims.mad` — the clock in four
// tiles with ten digit faces, the dial in `ang1..5` with `angpoint` for the
// needle and the white `wedge` fans for its face — and the heart out of
// `MAPICONS.MTD`, which ships its markers white for the game to paint.
//
// It is all authored for a 640×480 screen, drawn at native resolution and
// scaled by the window's height against that 480, so the brass keeps its
// proportions and its size relative to the view whatever the window is.
// Anything anchored right or bottom is placed against the view's own edge,
// since a wide window is wider than 640 of these units.

import { MODEL_SCALE } from '../../../lib/game/scale'
import { aimRadians } from '../../../lib/game/aim'
import { loadFont } from './font'
import type { Font } from './font'
import { loadTims, tinted } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { drawTitleCard } from './titleCard'
import { createBriefingBar } from './briefingBar'
import { createBattleMap } from './battleMap'
import type { Blip, Eye } from '../../../lib/game/scanner'
import type { MapRaster } from '../../../lib/game/mapRaster'
import { createPauseMenu } from './pauseMenu'
import { createSkillMenu } from './skillMenu'
import type { FloatingNumber, PigPlate } from '../contracts/overlay'
import type { PauseState } from '../../../lib/game/pauseMenu'
import type { SkillMenu } from './skillMenu'

const DASHBOARD = 'Language/Tims/dashtims.mad'
const MARKERS = 'Language/Tims/MAPICONS.MTD'
/** The battle's own big letters — the title card and the floating numbers. */
const TEXT_FONT = 'BIG'
/**
 * The letters over a pig's head: the battle's BIG, drawn SMALLER than its own
 * size (`LAYOUT.plate.scale`), team-coloured per pig.
 *
 * Play ruled BIG's 32 too big and the plate was moved to SMALL doubled, which
 * is 24 tall. Play then saw that in the game and ruled the LETTERS wrong —
 * "не тот шрифт! верни тот что был — но просто сделай меньше его" — so it is
 * BIG's shapes at a plate height that is still about 24: BIG's 32 at 0.75.
 * The same 24 either way, the glyphs BIG's. Which font the exe's own plate
 * drawer uses is still not read (`0x459B20`, scanner/notes.md), so play's
 * word is the ruling.
 */
const PLATE_FONT = 'BIG'
/** The height the dashboard art was drawn for. */
const AUTHORED_HEIGHT = 480

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
 *   lines in the pig's TEAM colour (contracts/overlay.ts). The heart is a
 *   10×11 map marker standing next to letters 24 tall (BIG at 0.75 — see
 *   PLATE_FONT), so it is drawn at twice its size, on a scale of its OWN
 *   that no longer follows the letters'; it and the fans ship WHITE for the
 *   game to paint, and the heart's pink and the fans' green are matched to
 *   play rather than measured.
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
     * on the original: "задержка есть — но не 2 секунды а меньше". */
    delay: 1,
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
    /** BIG's glyphs shrunk — 32 at 0.75 is the 24-tall plate play measured
     * off the original's screenshot (see PLATE_FONT). A fraction softens a
     * bitmap glyph, and the console's own knob is here if play wants the
     * clean half instead. */
    scale: 0.75,
    /**
     * How far the BLACK OUTLINE stands off the letters, in screen pixels.
     *
     * `[play]`: "отсутствует чёрная обводка текста для имён и хп". A plate is
     * read against grass, snow, mud and a pig's own colours, and a team colour
     * on its own disappears into half of them — the original outlines it. Zero
     * turns it off.
     *
     * It is in SCREEN pixels rather than the plate's own units on purpose: an
     * outline is a constant hairline whatever `scale` is doing to the glyphs,
     * and at a fractional scale an offset multiplied by it would land between
     * two device pixels and fade.
     */
    outline: 2,
    heart: { colour: [248, 64, 152] as [number, number, number], scale: 2 }
  }
  // THE MAP has no entry here on purpose: nothing about its placement or its
  // size is free. Where it sits, how big it is, how far it tilts and how it
  // turns are all read out of the library, and they live with the reading in
  // `lib/game/scanner.ts`.
}

/**
 * Every whole offset within `radius` screen pixels of a glyph, the centre left
 * out — the outline's own stamp (`LAYOUT.plate.outline`). Built once per radius
 * and kept, because the plate is drawn for every pig on the screen and the set
 * is twenty-four wide at a radius of two.
 */
const rings = new Map<number, readonly (readonly [number, number])[]>()
const aroundBy = (radius: number): readonly (readonly [number, number])[] => {
  const had = rings.get(radius)
  if (had) return had
  const out: [number, number][] = []
  const r = Math.max(1, Math.round(radius))
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx !== 0 || dy !== 0) out.push([dx, dy])
    }
  }
  rings.set(radius, out)
  return out
}

/** What the specs wait for; the console tweaks `LAYOUT.plate.delay`. */
export const PLATE_DELAY = LAYOUT.plate.delay

export interface HudState {
  /** Seconds since the last frame — the briefing bar's slide and scroll run
   * on it; nothing else on the dashboard moves by itself. */
  delta: number
  /**
   * The PAUSE MENU's state while it is up, or null (lib/game/pauseMenu.ts).
   * It is drawn last of everything, because it is the one thing on the
   * dashboard that is modal.
   */
  pause: PauseState | null
  /**
   * Whether the game is PAUSED. The dashboard keeps drawing — the frozen
   * world behind it is the point — but everything on it that moves by itself
   * stops, because a briefing bar scrolling over a still battle reads as the
   * game still running.
   */
  paused: boolean
  /** Seconds left in the turn; the clock shows two digits of it. */
  seconds: number
  /** Every living pig, projected by the scene. */
  pigs: PigPlate[]
  /** The damage floating off whatever was just hit, projected by the scene
   * (contracts/overlay.ts). */
  numbers: FloatingNumber[]
  /** How long the acting pig has stood still. */
  still: number
  /** Whether the aim view is up: the scope's ring, its black surround and
   * its mark go over the whole screen while it is (three/chase.ts). */
  scope: boolean
  /** `gtext`, for naming the skill under the menu's cursor. */
  strings: string[]
  /** Where the weapon in hand points, in the game's own angle units, or null
   * when nothing that aims is out — the needle rests level then
   * (lib/game/aim.ts). */
  aim: number | null
  /** The skill the acting pig has in hand, whose icon fills the slot beside
   * the dial. Null leaves the slot empty. */
  holding: number | null
  /**
   * How full the port's red LENS is, 0..1 — or null for an empty port.
   *
   * Not the charge: it is what the weapon DOES. Half for an ordinary one and
   * whole for one that goes off on contact, which is what play describes of the
   * bazooka's (`DIAL.slot.lens`, and lib/game/grenade.ts for the class).
   */
  lens: number | null
  /** How full the power gauge is, 0..1, or null when nothing is charging —
   * which is when the gauge is not drawn at all (lib/game/gauge.ts). */
  charge: number | null
  /** The level's opening card — "TRAINING MISSION: BOOT CAMP" — while the
   * squad is still in the air, and null once it is down (ui/titleCard.ts). */
  title: string | null
  /** Where the camera stands and which way it looks: the map is centred on
   * it and turns with it. Null before there is a scene to ask. */
  eye: Eye | null
  /** Everything the map shows a marker for, already filtered by whose turn
   * it is — an enemy scout is not on this list (lib/game/scanner.ts). */
  blips: readonly Blip[]
}

export interface Hud {
  /** Decode the dashboard and its font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Draw one frame over the battle. */
  draw(state: HudState): void
  /** Send a line through the briefing bar (ui/briefingBar.ts). */
  say(text: string): void
  /** Hand the map the level's picture, built once when the battle opens
   * (lib/game/mapRaster.ts). Null blanks it. */
  ground(raster: MapRaster | null): Promise<void>
  /** The skill menu, which the battle opens and drives (ui/skillMenu.ts). */
  readonly skills: SkillMenu
  /** Whether the bar still has anything to say. */
  speaking(): boolean
  /** Wipe it — the battle is no longer the view. */
  clear(): void
}

/**
 * The console IS the layout editor — there is no UI for it, the same way
 * `pow.swapMap` is how a map is changed:
 *
 *     pow.hud.layout.dial.slot.bottom -= 1   // nudge, watch, repeat
 *     pow.hud.layout.dial.green = [90, 150, 60]
 *     pow.hud.print()                        // paste that back into hud.ts
 *
 * Every number is in the 640×480 units the art was drawn in, so what is
 * printed is what the source says, whatever the window size.
 */
function offerLayout(): void {
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

export function createHud(canvas: HTMLCanvasElement): Hud {
  offerLayout()
  // The bar is its own piece with its own art and its own clock; the
  // dashboard only owns the canvas they share.
  const bar = createBriefingBar()
  // The map keeps its own art, its own entrance and its own easing scale,
  // the same way the bar keeps its clock — the dashboard only owns the
  // canvas they share (ui/battleMap.ts).
  const battleMap = createBattleMap()
  // What the pig is carrying, in the game's own frame. Its art is loaded
  // beside the dashboard's and it draws over everything else.
  const skills = createSkillMenu()
  const pauseMenu = createPauseMenu()
  let art: SpriteSet | null = null
  let font: Font | null = null
  /** The same letters painted the heal's own colour — the pink a heal's number
   * comes up in (lib/game/damage.ts). */
  let healFont: Font | null = null
  /** The plate's own letters (PLATE_FONT), unpainted — the fallback while a
   * team's painted copy is still decoding. */
  let plateFont: Font | null = null
  /** …and the same letters painted BLACK, which is what the outline is drawn
   * with (`LAYOUT.plate.outline`). */
  let plateOutline: Font | null = null
  /** …and one painted copy per TEAM colour seen, made the frame a plate first
   * arrives in that colour (contracts/overlay.ts). */
  const teamFonts = new Map<string, Font>()
  const teamLoads = new Set<string>()
  const teamFontFor = (colour: readonly [number, number, number]): Font | null => {
    const key = colour.join(',')
    const had = teamFonts.get(key)
    if (had) return had
    if (!teamLoads.has(key)) {
      teamLoads.add(key)
      void loadFont(PLATE_FONT, { colour: [colour[0], colour[1], colour[2]] }).then((painted) => {
        teamFonts.set(key, painted)
      })
    }
    return plateFont
  }
  let digits: Sprite[] = []
  let fans: Sprite[] = []
  let heart: Sprite | null = null
  let loaded = false
  /** Seconds of plate still owed to a pig that has just been hurt, and what
   * every pig's number was last frame — the only way to see it fall. */
  let hurtFor = 0
  const wasHealth = new Map<string, number>()
  /** Which colours the tints were baked with, so a console change to them
   * repaints instead of being quietly ignored. */
  let painted = ''
  let white: { fans: Sprite[]; heart: Sprite } | null = null

  const repaint = async (): Promise<void> => {
    if (!white) return
    const wanted = JSON.stringify([LAYOUT.dial.green, LAYOUT.plate.heart.colour])
    if (wanted === painted) return
    painted = wanted
    fans = await Promise.all(white.fans.map((wedge) => tinted(wedge, LAYOUT.dial.green)))
    heart = await tinted(white.heart, LAYOUT.plate.heart.colour)
    // The heal's letters take the same colour its heart does, so nudging one in
    // the console moves both.
    healFont = await loadFont(TEXT_FONT, { colour: LAYOUT.plate.heart.colour })
  }

  const resize = (): boolean => {
    const width = Math.round(canvas.clientWidth)
    const height = Math.round(canvas.clientHeight)
    if (width === 0 || height === 0) return false
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    return true
  }

  return {
    async load() {
      if (loaded) return
      try {
        const [dashboard, markers, big, small, outline] = await Promise.all([
          loadTims(DASHBOARD),
          loadTims(MARKERS),
          loadFont(TEXT_FONT),
          loadFont(PLATE_FONT),
          loadFont(PLATE_FONT, { colour: [0, 0, 0] })
        ])
        art = dashboard
        font = big
        plateFont = small
        plateOutline = outline
        digits = art.frames('timer', 0, 9)
        white = {
          fans: [dashboard.get('wedge1'), dashboard.get('wedge2')],
          heart: markers.get('iconhart')
        }
        await repaint()
        await bar.load()
        await battleMap.load()
        await skills.load()
        await pauseMenu.load(dashboard)
        loaded = true
      } catch (error) {
        // A stripped install has no dashboard. Warn rather than error: the
        // e2e suite treats console.error as a failed run.
        console.warn(String(error))
      }
    },

    say: (text) => bar.say(text),
    ground: (raster) => battleMap.ground(raster),
    skills,
    speaking: () => bar.busy(),

    clear() {
      bar.clear()
      skills.close()
      // The next battle plays the entrance again, as the original does — the
      // slide belongs to the map going up, not to the app starting.
      battleMap.reset()
      const context = canvas.getContext('2d')
      if (context) context.clearRect(0, 0, canvas.width, canvas.height)
    },

    draw(state) {
      if (!resize()) return
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingEnabled = false

      const scale = canvas.height / AUTHORED_HEIGHT
      const viewWidth = canvas.width / scale
      // WHAT THE PAUSE STOPS, and what it does NOT. The dashboard is still
      // drawn — the point of a pause is to look at the battle — and everything
      // on it that moves because the WORLD moves is handed a delta of zero: the
      // bar stops scrolling, the plates stop fading.
      //
      // Nothing on the map needs the real one: its size never changes (play's
      // ruling, `lib/game/scanner.ts`) and its entrance is twenty frames long
      // and over before a pause can happen.
      const delta = state.paused ? 0 : state.delta

      // The bar runs on its own clock and its own art, so it neither waits
      // for the dashboard to decode nor stops when the dashboard is missing.
      bar.update(delta)
      context.save()
      context.scale(scale, scale)
      bar.draw(context, viewWidth)
      context.restore()

      if (!art || !font || !heart || fans.length === 0) return
      // A console change to either painted colour lands on the next frame.
      void repaint()

      const { clock: CLOCK, dial: DIAL, gauge: GAUGE, plate: PLATE, scope: SCOPE } = LAYOUT

      // THE SCOPE, under everything else on the dashboard — the clock and the
      // dial sit on top of it, as they do in the original.
      //
      // `sights` is ONE QUADRANT: 32x32, its outer corner solid rgb(8,8,8)
      // and its inside transparent (sampled out of the TIM itself), so four
      // mirrored copies cut a round hole and the rest of the screen is the
      // same near-black. `target` is the mark in the middle. Which piece is
      // which is PLAY's — the archive says nothing about it.
      if (state.scope) {
        const half = SCOPE.size / 2
        const over = SCOPE.overlap
        const cx = viewWidth / 2
        const cy = AUTHORED_HEIGHT / 2
        context.save()
        context.scale(scale, scale)
        const corner = art.get('sights')
        for (const [sx, sy] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1]
        ]) {
          context.save()
          context.translate(cx, cy)
          context.scale(sx, sy)
          // Each copy is drawn into its own quadrant with the art's outer
          // corner AT the outer corner, so the arc meets its neighbours — and
          // a pixel PAST the centre lines, so the meeting leaves no seam.
          context.drawImage(corner.image, -half, -half, half + over, half + over)
          context.restore()
        }
        // …and everything past the four of them is that same near-black,
        // started a pixel inside their outer edge for the same reason. The
        // pixel it covers is the art's own solid corner, so nothing is lost.
        context.fillStyle = SCOPE.surround
        context.fillRect(0, 0, viewWidth, cy - half + over)
        context.fillRect(0, cy + half - over, viewWidth, AUTHORED_HEIGHT - (cy + half - over))
        context.fillRect(0, cy - half, cx - half + over, SCOPE.size)
        context.fillRect(cx + half - over, cy - half, viewWidth - (cx + half - over), SCOPE.size)
        // The mark sits in the MIDDLE, because the camera looks along the aim and
        // the tremor is in the aim: the world moves under a still crosshair, which
        // is the only arrangement in which the crosshair tells the truth
        // (lib/game/wobble.ts).
        const mark = art.get('target')
        context.drawImage(mark.image, cx - mark.width / 2, cy - mark.height / 2)
        context.restore()
      }

      // The level's opening card, in the same units as everything else here.
      if (state.title) {
        context.save()
        context.scale(scale, scale)
        drawTitleCard(context, font, state.title, viewWidth)
        context.restore()
      }
      const blit = (sprite: Sprite, x: number, y: number): void => {
        context.drawImage(
          sprite.image,
          Math.round(x * scale),
          Math.round(y * scale),
          Math.round(sprite.width * scale),
          Math.round(sprite.height * scale)
        )
      }

      // The clock, bottom right, and the seconds in its two windows. Over 99
      // it pins at 99: the gauge has room for two digits and no more.
      const clockX = viewWidth - CLOCK.width - CLOCK.margin.right
      const clockY = AUTHORED_HEIGHT - CLOCK.height - CLOCK.margin.bottom
      blit(art.get('clock01'), clockX, clockY)
      blit(art.get('clock02'), clockX + 64, clockY)
      blit(art.get('clock03'), clockX, clockY + 28)
      blit(art.get('clock04'), clockX + 64, clockY + 28)
      const shown = Math.min(99, Math.max(0, Math.ceil(state.seconds)))
      blit(digits[Math.floor(shown / 10)], clockX + CLOCK.digits.x, clockY + CLOCK.digits.y)
      blit(digits[shown % 10], clockX + CLOCK.digits.x + CLOCK.digits.step, clockY + CLOCK.digits.y)

      // The POWER GAUGE, centred along the bottom, and up for as long as
      // something in hand has one. Five tiles WHOLE — index 0 is the TIM's
      // transparent colour, so their black is a hole — and then the SLIDER
      // running along them, which is what the gauge actually is: `powg1` moves,
      // nothing fills.
      if (state.charge !== null) {
        const gaugeX = Math.round((viewWidth - GAUGE.width) / 2)
        const gaugeY = AUTHORED_HEIGHT - GAUGE.height - GAUGE.margin.bottom
        for (let tile = 0; tile < 5; tile++) blit(art.get(`newpow${tile + 3}`), gaugeX + tile * 64, gaugeY)
        // …and the pair that sits above its left end.
        blit(art.get('newpow1'), gaugeX + GAUGE.cap.x, gaugeY + GAUGE.cap.y)
        blit(art.get('newpow2'), gaugeX + GAUGE.cap.x + 64, gaugeY + GAUGE.cap.y)
        const along = Math.min(1, Math.max(0, state.charge))
        const track = GAUGE.track
        const marker = GAUGE.slider.art
        const travel = track.to - track.from - marker.width + 1
        blit(
          art.get('powg1'),
          gaugeX + track.from - marker.x + travel * along,
          gaugeY + track.y
        )
        // …and the LENS at its left end, before the scale's own zero. Play
        // pointed at it twice: "надо внизу, левее нуля шкалы — там есть
        // полузалитый круг." How full it is is the weapon's CLASS and not its
        // charge (`GAUGE.lens`, and lib/game/grenade.ts for the class).
        if (state.lens !== null) {
          const lens = art.get('pcpie4')
          const box = GAUGE.lens
          const shows = Math.min(1, Math.max(0, state.lens * box.fill))
          // Against the DISC's own rows, not the tile's: the red runs 2..29 of
          // the 32 (measured off `pcpie4` itself), so a half taken over the tile
          // is not a half of the thing anybody is looking at.
          const disc = box.disc.bottom - box.disc.top + 1
          const rows = Math.max(0, Math.round(disc * shows))
          // …and the fill is measured up from the disc's own bottom edge.
          const from = box.disc.bottom + 1 - rows
          if (rows > 0) {
            context.drawImage(
              lens.image,
              0,
              from,
              lens.width,
              rows,
              Math.round((gaugeX + box.x) * scale),
              Math.round((gaugeY + box.y + from) * scale),
              Math.round(box.width * scale),
              Math.round(rows * scale)
            )
          }
        }
      }

      // The dial and the weapon slot, top right. The slot stays empty until
      // there is a weapon to put in it.
      const dialX = viewWidth - DIAL.width - DIAL.margin.right
      const dialY = DIAL.margin.top

      // The face first, under the rim: each fan has its point at the hub and
      // opens left, and the pair is mirrored to fill the lower half too.
      context.save()
      context.scale(scale, scale)
      context.translate(dialX + DIAL.hub.x, dialY + DIAL.hub.y)
      context.globalAlpha = DIAL.alpha
      for (const half of [1, -1]) {
        context.save()
        context.scale(1, half)
        for (const wedge of fans) context.drawImage(wedge.image, -wedge.width, -wedge.height)
        context.restore()
      }
      context.restore()

      blit(art.get('ang1'), dialX, dialY + DIAL.arc.top)
      blit(art.get('ang3'), dialX, dialY + DIAL.arc.bottom)
      blit(art.get('ang2'), dialX + DIAL.slot.x, dialY + DIAL.slot.top)
      blit(art.get('ang4'), dialX + DIAL.slot.x, dialY + DIAL.slot.bottom)
      blit(art.get('ang5'), dialX + DIAL.slot.cap.x, dialY + DIAL.slot.cap.y)

      // What is in hand, in the ring beside the needle — the same icon the
      // skill menu shows, out of the same archive (ui/skillMenu.ts).
      const carried = skills.icon(state.holding)
      if (carried) {
        const box = DIAL.slot.icon
        blit(
          carried,
          dialX + box.x + (box.width - carried.width) / 2,
          dialY + box.y + (box.height - carried.height) / 2
        )
      }
      // The needle turns on the hub, and it is the aim angle it shows: the
      // arc is a half-disc and the angle's own limit is ±1023 of 4096, which
      // is the same ±90° (lib/game/aim.ts).
      const needle = art.get('angpoint')
      context.save()
      context.scale(scale, scale)
      context.translate(dialX + DIAL.hub.x, dialY + DIAL.hub.y)
      context.rotate(aimRadians(state.aim ?? 0))
      context.drawImage(needle.image, -needle.width, -needle.height / 2)
      context.restore()

      // THE MAP, after the gauge and before anything modal — which is the
      // exe's own order round the HUD frame (0x4578D2 the gauge, 0x4578D9
      // the map). It shrinks while a shot is charging, and `charge` is
      // exactly the condition the original ties that to: the skill's record
      // says it has a gauge, and the same branch turns both on (0x493CBD).
      context.save()
      context.scale(scale, scale)
      battleMap.draw(context, viewWidth, AUTHORED_HEIGHT, {
        delta,
        eye: state.eye,
        blips: state.blips,
      })
      context.restore()

      // The skill menu goes over the brass, since it is a MODE rather than
      // another gauge: while it is up the pig cannot be driven.
      skills.update(delta)
      if (skills.open()) {
        context.save()
        context.scale(scale, scale)
        skills.draw(context, viewWidth, state.strings)
        context.restore()
      }

      // The damage floating off whatever was just hit, in the same letters
      // and the same widget units. It is the original's own effect (0x487b90)
      // and it shows POINTS; how it MOVES is the remake's own, so it rises
      // and thins out (three/damageNumbers.ts). Drawn before the plates and
      // outside their delay: a hit is exactly when a player is NOT standing
      // still, so waiting for the plates would hide every one of them.
      if (state.numbers.length > 0) {
        context.save()
        context.scale(scale, scale)
        const healHeart = {
          width: heart.width * PLATE.heart.scale,
          height: heart.height * PLATE.heart.scale
        }
        const space = font.measure(' ')
        for (const number of state.numbers) {
          // A HEAL comes up pink with a heart beside it, laid out the way the
          // plate's own health line is. Play: "сердечки рядом с цифрами, и
          // покрашено всё в розовый цвет" — and the exe carries exactly this
          // distinction, one argument of the number's own spawner
          // (lib/game/damage.ts).
          const healing = number.style === 'heal'
          const letters = healing ? (healFont ?? font) : font
          const text = String(number.value)
          const wide = letters.measure(text) + (healing ? healHeart.width + space : 0)
          const left = Math.round(number.x / scale - wide / 2)
          const top = Math.round(number.y / scale - letters.height)
          context.globalAlpha = Math.max(0, 1 - number.age)
          if (healing) {
            context.drawImage(
              heart.image,
              left,
              top + Math.round((letters.height - healHeart.height) / 2),
              healHeart.width,
              healHeart.height
            )
          }
          letters.draw(context, text, healing ? left + healHeart.width + space : left, top)
        }
        context.restore()
      }

      // THE PLATES ARE A FUNCTION because they can REFUSE to draw, and what
      // follows them must not be refused with them. This used to be a bare
      // `return` in the middle of `draw`, and the pause menu was added after
      // it: ESCAPE froze the game, the menu answered its keys and made its
      // noises, and nothing was ever painted, because a pig that had not been
      // standing still long enough took the whole rest of the frame with it.
      // Play saw exactly that.
      const drawPlates = (base: Font, heart: Sprite): void => {
        // A pig's name, and its health beside a heart under it — once it has
        // stood still long enough. Drawn in the widget's own units, with the
        // scene's screen positions brought back into them. The letters are
        // SMALL at PLATE.scale, painted the pig's TEAM colour; the heart keeps
        // its own pink (contracts/overlay.ts).
        //
        // …or the moment anybody's number goes DOWN, standing still or not: the
        // water hurts silently and invisibly, and without this nothing on screen
        // says so (`PLATE.hurt`).
        hurtFor = Math.max(0, hurtFor - delta)
        for (const plate of state.pigs) {
          const before = wasHealth.get(plate.name)
          if (before !== undefined && plate.health < before) hurtFor = PLATE.hurt
          wasHealth.set(plate.name, plate.health)
        }
        if (state.still < PLATE.delay && hurtFor <= 0) return
        const factor = PLATE.scale
        const line = base.height * factor
        const gap = base.measure(' ') * factor
        context.save()
        context.scale(scale, scale)
        const heartSize = {
          width: heart.width * PLATE.heart.scale,
          height: heart.height * PLATE.heart.scale
        }
        /** One run of glyphs at the plate's own factor, at a screen position —
         * the glyphs stay the atlas's pixels, only resized, which is what keeps
         * them the original's shapes rather than a resample. */
        const run = (font: Font, text: string, x: number, y: number): void => {
          context.save()
          context.translate(x, y)
          context.scale(factor, factor)
          font.draw(context, text, 0, 0)
          context.restore()
        }
        /**
         * …and a line of the plate: the BLACK OUTLINE first, then the letters
         * over it.
         *
         * **Every offset within the radius, not a ring of eight.** A ring alone
         * is right at one pixel and wrong at any more: the eight points become
         * eight spokes with the letter's own edge showing between them, and
         * play asked for a thicker outline rather than a spikier one
         * ("обводка имён слишком тонкая - надо больше"). At two that is
         * twenty-four passes a line, which is why it is built once and kept.
         *
         * The offsets are applied OUTSIDE the plate's own scale (see
         * `LAYOUT.plate.outline`), so the outline is the same weight in screen
         * pixels whatever `scale` is doing to the glyphs.
         */
        const letters = (font: Font, text: string, x: number, y: number): void => {
          const off = PLATE.outline
          if (off > 0 && plateOutline) {
            for (const [dx, dy] of aroundBy(off)) run(plateOutline, text, x + dx, y + dy)
          }
          run(font, text, x, y)
        }
        // Lay every block out FIRST, then unstack: two pigs shoulder to
        // shoulder put their plates on top of each other, and neither the exe
        // nor its notes say what the original does about it
        // (scanner/notes.md), so the remake's own answer is the plain one —
        // the later block climbs above the one it landed on.
        interface Block {
          x: number
          top: number
          left: number
          width: number
          height: number
          font: Font
          name: string
          nameWidth: number
          health: string
          healthWidth: number
        }
        const blocks: Block[] = []
        for (const plate of state.pigs) {
          const at = { x: plate.x / scale, y: plate.y / scale }
          if (at.y > canvas.height / scale) continue
          const health = String(plate.health)
          const nameWidth = base.measure(plate.name) * factor
          const healthWidth = heartSize.width + gap + base.measure(health) * factor
          const width = Math.max(nameWidth, healthWidth)
          const height = line * 2 + PLATE.gap
          blocks.push({
            x: at.x,
            // Two lines are drawn UPWARD from the anchor, so a pig near the top
            // of the view puts them off it. Slide the block down to the edge
            // rather than dropping it: a name that vanishes reads as a bug, and
            // did.
            top: Math.max(0, at.y - height),
            left: at.x - width / 2,
            width,
            height,
            font: teamFontFor(plate.colour) ?? base,
            name: plate.name,
            nameWidth,
            health,
            healthWidth
          })
        }
        blocks.sort((a, b) => a.top - b.top)
        const placed: Block[] = []
        for (const block of blocks) {
          let bumped = true
          while (bumped) {
            bumped = false
            for (const other of placed) {
              const apart =
                block.left >= other.left + other.width ||
                other.left >= block.left + block.width ||
                block.top >= other.top + other.height + PLATE.gap ||
                other.top >= block.top + block.height + PLATE.gap
              if (!apart) {
                block.top = other.top - block.height - PLATE.gap
                bumped = true
              }
            }
          }
          placed.push(block)
        }
        for (const block of placed) {
          letters(block.font, block.name, Math.round(block.x - block.nameWidth / 2), Math.round(block.top))
          const healthLeft = Math.round(block.x - block.healthWidth / 2)
          const healthTop = Math.round(block.top + line + PLATE.gap)
          context.drawImage(
            heart.image,
            healthLeft,
            healthTop + Math.round((line - heartSize.height) / 2),
            heartSize.width,
            heartSize.height
          )
          letters(block.font, block.health, healthLeft + heartSize.width + gap, healthTop)
        }
        context.restore()
      }
      if (plateFont) drawPlates(plateFont, heart)

      // …AND THE PAUSE OVER ALL OF IT. Last, because it is the only modal
      // thing the dashboard carries: the exe draws it over the live frame too
      // and the world behind it is simply not stepping (ui/pauseMenu.ts).
      if (state.pause) {
        context.save()
        context.scale(scale, scale)
        pauseMenu.draw(context, viewWidth, state.pause, state.strings)
        context.restore()
      }
    }
  }
}
