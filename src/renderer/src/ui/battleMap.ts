// The map on the dashboard — the SCANNER, drawn.
//
// What it is and where every number comes from is lib/game/scanner.ts; this
// only puts it on the canvas. Three things move: the whole widget slides up
// into place over the battle's first twenty frames, the picture turns under
// the camera, and it shrinks while a shot is charging so the power gauge has
// room.
//
// The ground is a 64×64 image built once per battle (lib/game/mapRaster.ts)
// and drawn turned; the blips are `MAPICONS.MTD`'s markers, which ship white
// and are painted, so every colour they can take is tinted once at load.

import {
  BLIP_COLOURS,
  BLIP_OBJECTS,
  BLIP_WHITE,
  SCANNER_EASE_PER_SECOND,
  SCANNER_SCALE,
  SCANNER_SCALE_SMALL,
  SCANNER_SLIDE,
  SCANNER_SLIDE_FROM,
  scannerPixels
} from '../../../lib/game/scanner'
import type { Blip, BlipIcon, Eye } from '../../../lib/game/scanner'
import { RASTER_WORLD } from '../../../lib/game/mapRaster'
import type { MapRaster } from '../../../lib/game/mapRaster'
import { loadTims, tinted } from './sprites'
import type { Sprite } from './sprites'

const MARKERS = 'Language/Tims/MAPICONS.MTD'
/** The frames the entrance takes, which is the length of the exe's own table. */
const SLIDE_FRAMES = SCANNER_SLIDE.length
/** The clock those frames are counted on — the engine's fixed step. */
const FRAMES_PER_SECOND = 60

export interface BattleMapState {
  /** Seconds since the last frame. */
  delta: number
  eye: Eye | null
  blips: readonly Blip[]
  /** Whether a shot is charging, which is what shrinks the map. */
  charging: boolean
  /** Where its middle sits against the middle of the screen — the
   * dashboard's, so the console can nudge it (ui/hud.ts, `LAYOUT.map`). */
  centre: { x: number; y: number }
}

export interface BattleMap {
  /** Decode the markers and paint every colour they can take. */
  load(): Promise<void>
  /** Hand it the level's picture, or null to leave it blank. */
  ground(raster: MapRaster | null): Promise<void>
  /** Draw one frame, in the dashboard's own 640×480 units. */
  draw(context: CanvasRenderingContext2D, viewWidth: number, viewHeight: number, state: BattleMapState): void
  /** Back to the entrance — the next battle plays it again. */
  reset(): void
}

const key = (icon: BlipIcon, colour: readonly number[]): string => `${icon}|${colour.join(',')}`

export function createBattleMap(): BattleMap {
  /** Every marker in every colour it is ever drawn in, painted once. */
  const painted = new Map<string, Sprite>()
  let ground: ImageBitmap | null = null
  let loaded = false
  /** How far into the entrance, 0..SLIDE_FRAMES — the exe's own counter. */
  let entered = 0
  /** The live scale, easing toward the wanted one as the library's does. */
  let scale = SCANNER_SCALE

  return {
    async load() {
      if (loaded) return
      try {
        const markers = await loadTims(MARKERS)
        // A pig takes any of the eight team colours or white while it is the
        // one acting; a crate and a propoint take one colour each. That is
        // the whole set, so there is nothing to work out per frame.
        const wanted: [BlipIcon, [number, number, number]][] = [
          ...BLIP_COLOURS.map((colour) => ['iconpig', colour] as [BlipIcon, [number, number, number]]),
          ['iconpig', BLIP_WHITE],
          ...Object.values(BLIP_OBJECTS).map(
            (marker) => [marker.icon, marker.colour] as [BlipIcon, [number, number, number]]
          )
        ]
        for (const [icon, colour] of wanted) {
          const at = key(icon, colour)
          if (painted.has(at)) continue
          painted.set(at, await tinted(markers.get(icon), colour))
        }
        loaded = true
      } catch (error) {
        // A stripped install has no markers; the rest of the dashboard still
        // draws. `console.error` fails an e2e run, so warn.
        console.warn(String(error))
      }
    },

    async ground(raster) {
      if (!raster) {
        ground?.close()
        ground = null
        return
      }
      const pixels = new ImageData(new Uint8ClampedArray(raster.rgba), raster.size, raster.size)
      const next = await createImageBitmap(pixels)
      ground?.close()
      ground = next
    },

    reset() {
      entered = 0
      scale = SCANNER_SCALE
    },

    draw(context, viewWidth, viewHeight, state) {
      if (!state.eye) return
      // The entrance runs on frames because the table it reads is one entry
      // per frame; the delta only says how many have gone by.
      entered = Math.min(SLIDE_FRAMES, entered + state.delta * FRAMES_PER_SECOND)
      const progress = SCANNER_SLIDE[Math.min(SLIDE_FRAMES - 1, Math.floor(entered))] / 100
      const slide = SCANNER_SLIDE_FROM * (1 - progress)

      const wanted = state.charging ? SCANNER_SCALE_SMALL : SCANNER_SCALE
      const step = SCANNER_EASE_PER_SECOND * state.delta
      scale = wanted > scale ? Math.min(wanted, scale + step) : Math.max(wanted, scale - step)

      const pixels = scannerPixels(scale)
      const span = RASTER_WORLD * pixels
      // Anchored on the middle of the SCREEN, not of the authored 640 —
      // everything on this dashboard that is not centred is placed against
      // the view's own edges (ui/hud.ts).
      const cx = viewWidth / 2 + state.centre.x
      const cy = viewHeight / 2 + state.centre.y + slide
      const angle = state.eye.heading

      context.save()
      context.beginPath()
      context.rect(cx - span / 2, cy - span / 2, span, span)
      context.clip()

      if (ground) {
        context.save()
        context.translate(cx, cy)
        context.rotate(-angle)
        // The raster's first row is the world's most negative z and its first
        // column the most negative x, so flipping y here puts +z up the
        // screen and the image goes down in one piece.
        context.scale(1, -1)
        context.imageSmoothingEnabled = false
        context.drawImage(
          ground,
          (-RASTER_WORLD / 2 - state.eye.x) * pixels,
          (-RASTER_WORLD / 2 - state.eye.z) * pixels,
          span,
          span
        )
        context.restore()
      }

      // The blips are placed through the same turn and drawn UPRIGHT: a
      // marker is a marker whichever way the camera looks.
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)
      for (const blip of state.blips) {
        const marker = painted.get(key(blip.icon, blip.colour))
        if (!marker) continue
        const u = (blip.x - state.eye.x) * pixels
        const v = (blip.z - state.eye.z) * pixels
        const x = cx + u * cos - v * sin
        const y = cy - u * sin - v * cos
        context.drawImage(marker.image, Math.round(x - marker.width / 2), Math.round(y - marker.height / 2))
      }
      context.restore()
    }
  }
}
