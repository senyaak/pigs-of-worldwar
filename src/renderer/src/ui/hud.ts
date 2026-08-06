// The battle's dashboard, in the game's own brass.
//
// `Language/Tims/dashtims.mad` is the original's in-game furniture: the turn
// clock (a brass gauge in four tiles with two digit windows, and ten digit
// faces `timer0..9`), the power gauge, the angle arc, the sights. Only what
// the battle HAS is drawn — the clock and the pigs' name plates. The power
// and angle pieces wait for a weapon to belong to; drawing them now would be
// furniture with nothing behind it.
//
// The dashboard is authored for a 640×480 screen. It is drawn at native
// resolution and scaled by the window's height against that 480, so the
// brass keeps its proportions and its size relative to the view whatever the
// window is.

import { loadFont } from './font'
import type { Font } from './font'
import { loadTims } from './sprites'
import type { Sprite, SpriteSet } from './sprites'

const DASHBOARD = 'Language/Tims/dashtims.mad'
/** The font the battle writes in — 12px, and the one font with no frontend
 * twin, so it is the in-game one by elimination. */
const GAME_FONT = 'GameChars'
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
  /** Where the pair of digits starts inside the assembly. */
  digits: { x: 38, y: 39, step: 26 },
  /** Where the whole thing sits, from the top-left of the view. */
  at: { x: 16, y: 12 }
}

/** How far above a pig's own position its name plate floats, in game units. */
const PLATE_LIFT = 900

export interface PigPlate {
  /** Screen position of the point the plate hangs over, in CSS pixels. */
  x: number
  y: number
  name: string
  health: number
  /** The pig whose turn it is wears the plate the camera is following. */
  acting: boolean
}

export interface HudState {
  /** Seconds left in the turn; the clock shows two digits of it. */
  seconds: number
  pigs: PigPlate[]
}

export interface Hud {
  /** Decode the dashboard and the battle font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Draw one frame over the battle. */
  draw(state: HudState): void
  /** Wipe it — the battle is no longer the view. */
  clear(): void
}

/** How high above a pig the plate is drawn — exported for the scene. */
export const PLATE_HEIGHT = PLATE_LIFT

export function createHud(canvas: HTMLCanvasElement): Hud {
  let art: SpriteSet | null = null
  let font: Font | null = null
  let digits: Sprite[] = []
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
        const [tims, gameFont] = await Promise.all([loadTims(DASHBOARD), loadFont(GAME_FONT)])
        art = tims
        font = gameFont
        digits = art.frames('timer', 0, 9)
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
      if (!art || !font) return
      context.imageSmoothingEnabled = false

      const scale = canvas.height / AUTHORED_HEIGHT
      const blit = (sprite: Sprite, x: number, y: number): void => {
        context.drawImage(
          sprite.image,
          Math.round(x * scale),
          Math.round(y * scale),
          Math.round(sprite.width * scale),
          Math.round(sprite.height * scale)
        )
      }

      // The clock, and the seconds in its two windows. Over 99 it pins at
      // 99: the original's gauge has room for two digits and no more.
      const { x, y } = CLOCK.at
      blit(art.get('clock01'), x, y)
      blit(art.get('clock02'), x + 64, y)
      blit(art.get('clock03'), x, y + 28)
      blit(art.get('clock04'), x + 64, y + 28)
      const shown = Math.min(99, Math.max(0, Math.ceil(state.seconds)))
      blit(digits[Math.floor(shown / 10)], x + CLOCK.digits.x, y + CLOCK.digits.y)
      blit(digits[shown % 10], x + CLOCK.digits.x + CLOCK.digits.step, y + CLOCK.digits.y)

      // A name plate over each pig, in the battle's own letters. Screen
      // positions come from the scene, which is what holds the camera.
      for (const plate of state.pigs) {
        const text = plate.acting ? `${plate.name} ${plate.health}` : plate.name
        const width = font.measure(text) * scale
        const left = Math.round(plate.x - width / 2)
        const top = Math.round(plate.y - font.height * scale)
        if (left + width < 0 || left > canvas.width || top < 0 || top > canvas.height) continue
        context.save()
        context.translate(left, top)
        context.scale(scale, scale)
        font.draw(context, text, 0, 0)
        context.restore()
      }
    }
  }
}
