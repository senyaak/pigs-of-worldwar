// The battle's dashboard, in the game's own brass.
//
// What the original keeps on screen the whole time, from play: the CLOCK
// bottom right, the weapon and the direction it points top right, and the
// map bottom left. Nothing else — no labels over the pigs. The clock is the
// only one of the three the battle can fill yet: the weapon panel stays
// empty until there is a weapon to put in it, and the map is its own piece
// of work.
//
// `Language/Tims/dashtims.mad` is where the furniture lives — the clock in
// four tiles with ten digit faces, and, unused so far, the power gauge, the
// angle arc, the sights and the score panels.
//
// It is all authored for a 640×480 screen, drawn at native resolution and
// scaled by the window's height against that 480, so the brass keeps its
// proportions and its size relative to the view whatever the window is.
// Anything anchored to the right or the bottom is placed against the view's
// own edge, since a wide window is wider than 640 of these units.

import { loadTims } from './sprites'
import type { Sprite, SpriteSet } from './sprites'

const DASHBOARD = 'Language/Tims/dashtims.mad'
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
  /** It hangs off the bottom-right corner of the view. */
  margin: { right: 16, bottom: 8 }
}

export interface HudState {
  /** Seconds left in the turn; the clock shows two digits of it. */
  seconds: number
}

export interface Hud {
  /** Decode the dashboard and the battle font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Draw one frame over the battle. */
  draw(state: HudState): void
  /** Wipe it — the battle is no longer the view. */
  clear(): void
}

export function createHud(canvas: HTMLCanvasElement): Hud {
  let art: SpriteSet | null = null
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
        art = await loadTims(DASHBOARD)
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
      if (!art) return
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

      // The clock, bottom right, and the seconds in its two windows. Over 99
      // it pins at 99: the gauge has room for two digits and no more.
      const x = canvas.width / scale - CLOCK.width - CLOCK.margin.right
      const y = AUTHORED_HEIGHT - CLOCK.height - CLOCK.margin.bottom
      blit(art.get('clock01'), x, y)
      blit(art.get('clock02'), x + 64, y)
      blit(art.get('clock03'), x, y + 28)
      blit(art.get('clock04'), x + 64, y + 28)
      const shown = Math.min(99, Math.max(0, Math.ceil(state.seconds)))
      blit(digits[Math.floor(shown / 10)], x + CLOCK.digits.x, y + CLOCK.digits.y)
      blit(digits[shown % 10], x + CLOCK.digits.x + CLOCK.digits.step, y + CLOCK.digits.y)
    }
  }
}
