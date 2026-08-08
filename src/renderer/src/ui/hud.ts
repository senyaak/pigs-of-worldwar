// The battle's dashboard, in the game's own brass.
//
// What the original keeps on screen, from play:
//
// - the CLOCK, bottom right;
// - the ANGLE DIAL and the WEAPON SLOT as one widget, top right, always
//   there — the slot empty until a weapon is chosen;
// - the MAP, bottom left (not built yet);
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
import { createSkillMenu } from './skillMenu'
import type { FloatingNumber } from '../three/damageNumbers'
import type { SkillMenu } from './skillMenu'

const DASHBOARD = 'Language/Tims/dashtims.mad'
const MARKERS = 'Language/Tims/MAPICONS.MTD'
/** The letters over a pig's head are the big ones, as in the original. */
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
 * - PLATE: the name over a pig, the health under it beside a heart. The
 *   heart is a 10×11 map marker standing next to letters 32 tall, so it is
 *   drawn at twice its size; it and the fans ship WHITE for the game to
 *   paint, and both colours here are matched to play rather than measured.
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
    /** Where the slider's MIDDLE travels, and the line it rides — the trough's
     * own measured span and row. */
    track: { from: 104, to: 268, y: 1 },
    /** The slider's own art is 24 wide; this is what its middle is offset by. */
    slider: { width: 24, height: 36 },
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
    /** Seconds a pig must have stood still before its name comes back. */
    delay: 2,
    /** Between the name and the health line under it. */
    gap: 2,
    /** How far the name floats over the pig's CROWN, in GAME units — the
     * scene adds the pig's own height (three/pig.ts), so this is clearance
     * and nothing else. It used to be 900 measured from the soles, which
     * was two thirds of a pig's height of empty air and stopped meaning
     * anything when the model's scale moved. */
    lift: 120,
    heart: { colour: [248, 64, 152] as [number, number, number], scale: 2 }
  }
}

/** What the specs wait for; the console tweaks `LAYOUT.plate.delay`. */
export const PLATE_DELAY = LAYOUT.plate.delay

export interface PigPlate {
  /** Screen position of the point the name hangs over, in CSS pixels. */
  x: number
  y: number
  name: string
  health: number
}

export interface HudState {
  /** Seconds since the last frame — the briefing bar's slide and scroll run
   * on it; nothing else on the dashboard moves by itself. */
  delta: number
  /** Seconds left in the turn; the clock shows two digits of it. */
  seconds: number
  /** Every living pig, projected by the scene. */
  pigs: PigPlate[]
  /** The damage floating off whatever was just hit, projected by the scene
   * (three/damageNumbers.ts). */
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
  /** How full the power gauge is, 0..1, or null when nothing is charging —
   * which is when the gauge is not drawn at all (lib/game/gauge.ts). */
  charge: number | null
  /** The level's opening card — "TRAINING MISSION: BOOT CAMP" — while the
   * squad is still in the air, and null once it is down (ui/titleCard.ts). */
  title: string | null
}

export interface Hud {
  /** Decode the dashboard and its font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Draw one frame over the battle. */
  draw(state: HudState): void
  /** Send a line through the briefing bar (ui/briefingBar.ts). */
  say(text: string): void
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
  // What the pig is carrying, in the game's own frame. Its art is loaded
  // beside the dashboard's and it draws over everything else.
  const skills = createSkillMenu()
  let art: SpriteSet | null = null
  let font: Font | null = null
  let digits: Sprite[] = []
  let fans: Sprite[] = []
  let heart: Sprite | null = null
  let loaded = false
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
        const [dashboard, markers, big] = await Promise.all([
          loadTims(DASHBOARD),
          loadTims(MARKERS),
          loadFont(PLATE_FONT)
        ])
        art = dashboard
        font = big
        digits = art.frames('timer', 0, 9)
        white = {
          fans: [dashboard.get('wedge1'), dashboard.get('wedge2')],
          heart: markers.get('iconhart')
        }
        await repaint()
        await bar.load()
        await skills.load()
        loaded = true
      } catch (error) {
        // A stripped install has no dashboard. Warn rather than error: the
        // e2e suite treats console.error as a failed run.
        console.warn(String(error))
      }
    },

    say: (text) => bar.say(text),
    skills,
    speaking: () => bar.busy(),

    clear() {
      bar.clear()
      skills.close()
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

      // The bar runs on its own clock and its own art, so it neither waits
      // for the dashboard to decode nor stops when the dashboard is missing.
      bar.update(state.delta)
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
        blit(
          art.get('powg1'),
          gaugeX + track.from + (track.to - track.from) * along - GAUGE.slider.width / 2,
          gaugeY + track.y
        )
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

      // The skill menu goes over the brass, since it is a MODE rather than
      // another gauge: while it is up the pig cannot be driven.
      skills.update(state.delta)
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
        for (const number of state.numbers) {
          const text = String(number.value)
          context.globalAlpha = Math.max(0, 1 - number.age)
          font.draw(
            context,
            text,
            Math.round(number.x / scale - font.measure(text) / 2),
            Math.round(number.y / scale - font.height)
          )
        }
        context.restore()
      }

      // A pig's name, and its health beside a heart under it — once it has
      // stood still long enough. Drawn in the widget's own units, with the
      // scene's screen positions brought back into them.
      if (state.still < PLATE.delay) return
      const line = font.height
      const gap = font.measure(' ')
      context.save()
      context.scale(scale, scale)
      const heartSize = {
        width: heart.width * PLATE.heart.scale,
        height: heart.height * PLATE.heart.scale
      }
      for (const plate of state.pigs) {
        const at = { x: plate.x / scale, y: plate.y / scale }
        const health = String(plate.health)
        const healthWidth = heartSize.width + gap + font.measure(health)
        // Two lines are drawn UPWARD from the anchor, so a pig near the top
        // of the view puts them off it. Slide the block down to the edge
        // rather than dropping it: a name that vanishes reads as a bug, and
        // did.
        const top = Math.max(0, at.y - line * 2 - PLATE.gap)
        if (at.y > canvas.height / scale) continue
        font.draw(context, plate.name, Math.round(at.x - font.measure(plate.name) / 2), Math.round(top))
        const healthLeft = Math.round(at.x - healthWidth / 2)
        const healthTop = Math.round(top + line + PLATE.gap)
        context.drawImage(
          heart.image,
          healthLeft,
          healthTop + Math.round((line - heartSize.height) / 2),
          heartSize.width,
          heartSize.height
        )
        font.draw(context, health, healthLeft + heartSize.width + gap, healthTop)
      }
      context.restore()
    }
  }
}
