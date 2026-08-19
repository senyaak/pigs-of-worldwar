// The map on the dashboard — the SCANNER, drawn.
//
// What it is and where every number comes from is lib/game/scanner.ts; this
// puts it on the canvas. Three things to keep in mind about its LOOK, all
// read out of `_d3d.dll` rather than chosen here:
//
// - **it is not a view from straight above.** The board is a square of ground
//   seen through a camera tilted 28.125° down, with a real ±15% perspective
//   recession along the screen-vertical axis. On a 640×480 screen its near
//   edge is 167 pixels wide and its far edge 128.
// - **it does not follow the camera and it is not masked.** The whole level is
//   drawn, always centred on the widget, and only TURNED — so the square's
//   corners sweep round as the player turns and are meant to be seen doing it.
//   There is no clipping of any kind in the original.
// - **it sits in the bottom-left corner**, 110 in from the left and 75 up from
//   the bottom, and slides UP into that place over the battle's first twenty
//   frames.
//
// Canvas 2D can only do affine transforms, so the board is subdivided and each
// cell drawn affinely — which is what the library does too, for the same
// reason, only at 2×2 where this uses more. Laying one cell down, and keeping
// two neighbours from leaving a hairline between them, is `ui/affine.ts`.

import {
  BLIP_COLOURS,
  BLIP_OBJECTS,
  BLIP_WHITE,
  SCANNER_EASE_PER_SECOND,
  SCANNER_REACH,
  SCANNER_SCALE,
  SCANNER_SCALE_SMALL,
  SCANNER_SLIDE,
  SCANNER_SLIDE_FROM,
  projectScanner,
  scannerShrink
} from '../../../lib/game/scanner'
import type { Blip, BlipIcon, Eye } from '../../../lib/game/scanner'
import type { MapRaster } from '../../../lib/game/mapRaster'
import { grow, texturedTriangle } from './affine'
import { loadTims, tinted } from './sprites'
import type { Sprite } from './sprites'

const MARKERS = 'Language/Tims/MAPICONS.MTD'
/** The frames the entrance takes, which is the length of the exe's own table. */
const SLIDE_FRAMES = SCANNER_SLIDE.length
/** The clock those frames are counted on — the engine's fixed step. */
const FRAMES_PER_SECOND = 60
/**
 * How many cells the board is cut into, each way, before each is drawn with an
 * affine transform. The library uses 2 for the same reason; more is cheap here
 * and keeps the recession smooth across a quad this wide.
 */
const CELLS = 8
/** The markers are 10×11 and the library draws them at exactly that. */
const BLIP_WIDTH = 10
const BLIP_HEIGHT = 11

/** Where the camera is and which way it looks. */
export type { Eye }

export interface BattleMapState {
  /** Seconds since the last frame. */
  delta: number
  eye: Eye | null
  blips: readonly Blip[]
  /**
   * Whether the board is drawn SMALL.
   *
   * Two things ask for it and both are the library's own
   * `afSetScannerSizeSmall(1)`: a shot charging, and the MAP VIEW camera —
   * which the PAUSE enters (0x49FBF0 on the way in, 0x49F867 on the way out,
   * `lib/game/mapView.ts`). One size, two callers.
   */
  small: boolean
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
        // one the camera is on; a crate and a propoint take one colour each.
        // That is the whole set, so there is nothing to work out per frame.
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

      const wanted = state.small ? SCANNER_SCALE_SMALL : SCANNER_SCALE
      const step = SCANNER_EASE_PER_SECOND * state.delta
      scale = wanted > scale ? Math.min(wanted, scale + step) : Math.max(wanted, scale - step)

      // 110 in from the left and 75 up from the bottom, and the shrink pulls
      // it further left so the board's left edge stays put.
      const cx = 110 + scannerShrink(scale)
      const cy = viewHeight - 75 + slide
      const yaw = state.eye.heading

      if (ground) {
        // The board is the square ±scale, cut into cells and laid down two
        // triangles at a time. Its texture's COLUMN runs along world z and its
        // ROW along world x (lib/game/mapRaster.ts), and the library insets
        // the UVs to texel CENTRES — the quad's rim sits on texel 0.5 and 63.5
        // rather than on the texture's own edge.
        const texels = ground.width
        const inset = 0.5
        const usable = texels - 1
        const at = (i: number): number => (i / CELLS) * 2 - 1
        const uv = (t: number): number => inset + ((t + 1) / 2) * usable
        context.save()
        // A 64-pixel picture over 167 is a stretch either way; smoothed reads
        // as the filtered texture the original hands to Direct3D rather than
        // as chunky blocks. `[CHECK — remake]`: the library's filter state on
        // this draw was not read.
        context.imageSmoothingEnabled = true
        for (let row = 0; row < CELLS; row++) {
          for (let column = 0; column < CELLS; column++) {
            const px0 = at(row) * scale
            const px1 = at(row + 1) * scale
            const py0 = at(column) * scale
            const py1 = at(column + 1) * scale
            // px runs along world x, which is the texture's ROW; py along z,
            // which is its COLUMN.
            const corners: [number, number, number, number][] = [
              [px0, py0, uv(at(column)), uv(at(row))],
              [px0, py1, uv(at(column + 1)), uv(at(row))],
              [px1, py1, uv(at(column + 1)), uv(at(row + 1))],
              [px1, py0, uv(at(column)), uv(at(row + 1))]
            ]
            const screen = corners.map(([px, py]) => {
              const point = projectScanner(px, py, yaw)
              return [cx + point.x, cy + point.y] as [number, number]
            })
            const source = corners.map(([, , u, v]) => [u, v] as [number, number])
            for (const [i, j, k] of [
              [0, 1, 2],
              [0, 2, 3]
            ]) {
              texturedTriangle(
                context,
                ground,
                [source[i], source[j], source[k]],
                grow([screen[i], screen[j], screen[k]])
              )
            }
          }
        }
        context.restore()
      }

      // The blips go through the SAME projection and are drawn upright at
      // their own 10×11 — the library never scales them, never turns them with
      // the board and never clips them, so one outside the board is simply
      // drawn outside it.
      context.save()
      context.imageSmoothingEnabled = false
      for (const blip of state.blips) {
        const marker = painted.get(key(blip.icon, blip.colour))
        if (!marker) continue
        const point = projectScanner((blip.x * scale) / SCANNER_REACH, (blip.z * scale) / SCANNER_REACH, yaw)
        context.drawImage(
          marker.image,
          Math.round(cx + point.x - BLIP_WIDTH / 2),
          Math.round(cy + point.y - BLIP_HEIGHT / 2),
          BLIP_WIDTH,
          BLIP_HEIGHT
        )
      }
      context.restore()
    }
  }
}
