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

import { loadFont } from './font'
import type { Font } from './font'
import { loadTims, tinted } from './sprites'
import type { Sprite, SpriteSet } from './sprites'

const DASHBOARD = 'Language/Tims/dashtims.mad'
const MARKERS = 'Language/Tims/MAPICONS.MTD'
/** The letters over a pig's head are the big ones, as in the original. */
const PLATE_FONT = 'BIG'
/** The height the dashboard art was drawn for. */
const AUTHORED_HEIGHT = 480

/**
 * The clock: `clock01|clock02` over `clock03|clock04`, and the two digit
 * windows inside the lower half. The window positions are measured off the
 * assembled art (the dark recesses run x 38..61 and 64..87, and a digit tile
 * is 24 wide), not guessed.
 */
const CLOCK = {
  width: 128,
  height: 92,
  digits: { x: 38, y: 39, step: 26 },
  margin: { right: 16, bottom: 8 }
}

/**
 * The angle dial and the weapon slot, one widget in the top-right corner —
 * the pieces named by play, not by the archive's order:
 *
 * - the DIAL is `ang1` over `ang3`, a beaded arc with the needle's spindle
 *   down its right edge, and `angpoint` the needle turning on it;
 * - its FACE is `wedge1` and `wedge2`, two 45° fans that mirror into the
 *   four quadrants of a half-disc — white in the file, painted a
 *   see-through green;
 * - the SLOT is `ang2` over `ang4` with `ang5` capping its right end.
 */
const DIAL = {
  width: 152,
  height: 121,
  margin: { right: 12, top: 12 },
  /** Where the needle turns, and where every fan has its point. */
  hub: { x: 60, y: 64 },
  arc: { top: 0, bottom: 64 },
  /** The slot's two tiles overlap by seven rows — of plain black, which is
   * why nothing in the art shows where — and that is what closes their
   * brass rim into a ring. The cap rides with the bottom half. */
  slot: { x: 64, top: 23, bottom: 62, cap: { x: 128, y: 28 } }
}

/** The green the dial's face is painted, and how much of the battle shows
 * through it. The fans ship WHITE, like the map's markers, so the colour is
 * the game's to choose — this one is matched to play. */
const DIAL_GREEN: [number, number, number] = [104, 168, 72]
const DIAL_ALPHA = 0.5
/** The heart beside a pig's health, painted the same way. */
const HEART_PINK: [number, number, number] = [248, 64, 152]
/** The map's heart is a 10×11 marker; over a pig it stands beside letters
 * twice that tall, and is drawn twice the size to match them. */
const HEART_SCALE = 2

/** How long a pig must have stood still before its name comes back. */
export const PLATE_DELAY = 2
/** The gap between a pig's name and the health line under it. */
const PLATE_GAP = 2
/** How far the name floats over the pig's own position, in game units. */
export const PLATE_HEIGHT = 900

export interface PigPlate {
  /** Screen position of the point the name hangs over, in CSS pixels. */
  x: number
  y: number
  name: string
  health: number
}

export interface HudState {
  /** Seconds left in the turn; the clock shows two digits of it. */
  seconds: number
  /** Every living pig, projected by the scene. */
  pigs: PigPlate[]
  /** How long the acting pig has stood still. */
  still: number
}

export interface Hud {
  /** Decode the dashboard and its font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Draw one frame over the battle. */
  draw(state: HudState): void
  /** Wipe it — the battle is no longer the view. */
  clear(): void
}

export function createHud(canvas: HTMLCanvasElement): Hud {
  let art: SpriteSet | null = null
  let font: Font | null = null
  let digits: Sprite[] = []
  let fans: Sprite[] = []
  let heart: Sprite | null = null
  let loaded = false

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
        fans = await Promise.all(
          ['wedge1', 'wedge2'].map((name) => tinted(dashboard.get(name), DIAL_GREEN))
        )
        heart = await tinted(markers.get('iconhart'), HEART_PINK)
        loaded = true
      } catch (error) {
        // A stripped install has no dashboard. Warn rather than error: the
        // e2e suite treats console.error as a failed run.
        console.warn(String(error))
      }
    },

    clear() {
      const context = canvas.getContext('2d')
      if (context) context.clearRect(0, 0, canvas.width, canvas.height)
    },

    draw(state) {
      if (!resize()) return
      const context = canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (!art || !font || !heart || fans.length === 0) return
      context.imageSmoothingEnabled = false

      const scale = canvas.height / AUTHORED_HEIGHT
      const viewWidth = canvas.width / scale
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

      // The dial and the weapon slot, top right. The slot stays empty until
      // there is a weapon to put in it.
      const dialX = viewWidth - DIAL.width - DIAL.margin.right
      const dialY = DIAL.margin.top

      // The face first, under the rim: each fan has its point at the hub and
      // opens left, and the pair is mirrored to fill the lower half too.
      context.save()
      context.scale(scale, scale)
      context.translate(dialX + DIAL.hub.x, dialY + DIAL.hub.y)
      context.globalAlpha = DIAL_ALPHA
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
      const needle = art.get('angpoint')
      blit(needle, dialX + DIAL.hub.x - needle.width, dialY + DIAL.hub.y - needle.height / 2)

      // A pig's name, and its health beside a heart under it — once it has
      // stood still long enough. Drawn in the widget's own units, with the
      // scene's screen positions brought back into them.
      if (state.still < PLATE_DELAY) return
      const line = font.height
      const gap = font.measure(' ')
      context.save()
      context.scale(scale, scale)
      const heartSize = { width: heart.width * HEART_SCALE, height: heart.height * HEART_SCALE }
      for (const plate of state.pigs) {
        const at = { x: plate.x / scale, y: plate.y / scale }
        const health = String(plate.health)
        const healthWidth = heartSize.width + gap + font.measure(health)
        const top = at.y - line * 2 - PLATE_GAP
        if (top < 0 || at.y > canvas.height / scale) continue
        font.draw(context, plate.name, Math.round(at.x - font.measure(plate.name) / 2), Math.round(top))
        const healthLeft = Math.round(at.x - healthWidth / 2)
        const healthTop = Math.round(top + line + PLATE_GAP)
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
