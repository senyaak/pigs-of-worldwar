// THE PAUSE MENU, drawn — over the live frame, not instead of it.
//
// The rules and every string id are `lib/game/pauseMenu.ts`; this is where it
// goes on the screen. It is the MISSION's own menu and not the frontend's:
// the menu machine is torn down when a mission loads, and this is printed
// with the battle's small letters straight over the 3D view (exe 0x45A9B0).
// So it belongs on the dashboard's canvas beside the skill menu, which is the
// same kind of thing — an in-battle mode with art of its own.
//
// Every number here is read. The panel is the screen's centre ±130 by ±150
// (0x454876), the rows are five offsets off the panel's top written out one
// after another at 0x45A9CF, and the bar sits 0x75 left of centre and 0x19
// below its own row.
//
// **The frame is a NINE-SLICE of eight 16×16 tiles** — `dashtims.mad` entries
// 28..35, `pause1..pause8`, drawn by 0x45B580 — and which tile is which corner
// was MEASURED rather than guessed: decoded, each corner tile is exactly the
// union of the two edge tiles that meet there, which puts them in the reading
// order `TL, T, TR, L, R, BL, B, BR`.

import {
  ARE_YOU_SURE,
  BAR_CELLS,
  CONFIRM_NO,
  CONFIRM_YES,
  PAUSE_ROWS,
  PAUSE_TITLE,
  SPEECH_OFF,
  SPEECH_ON,
  barCells
} from '../../../lib/game/pauseMenu'
import type { PauseState } from '../../../lib/game/pauseMenu'
import { loadFont } from './font'
import type { Font } from './font'
import type { SpriteSet } from './sprites'

/** The battle's small letters — the object the exe prints this menu with. */
const MENU_FONT = 'SMALL'
/** The frame's eight tiles, in the order the art itself puts them in. */
const FRAME = ['pause1', 'pause2', 'pause3', 'pause4', 'pause5', 'pause6', 'pause7', 'pause8']
const TILE = 16

/**
 * Every number in the 640×480 units the dashboard is laid out in — and every
 * one of them is measured off the SCREEN'S CENTRE, which is what the exe does
 * too (`[0x520668]+0x454` and `+0x458`). So the panel finds the middle of a
 * wide window rather than the middle of an authored 640, the same way the
 * dashboard's right-hand pieces find its edge.
 */
export const LAYOUT = {
  /** The middle, vertically — the authored 480's own, which the HUD scales by
   * exactly. Horizontally the middle is the view's, whatever it is. */
  centreY: 240,
  /** The menu's panel: centre ±130 by ±150 (0x454876). */
  panel: { halfWidth: 130, halfHeight: 150 },
  /**
   * The confirm's own: 240 wide about the centre, and 115 tall ENDING on it
   * (`cx − 0x78`, `cy − 0x73`, `0xF0 × 0x73` at 0x45AC5B) — it sits above the
   * middle rather than across it.
   */
  confirm: { halfWidth: 120, height: 115 },
  /** Off the panel's TOP: the title, then the five rows (0x45A9CF). */
  title: 0x1e,
  rows: [0x55, 0x73, 0xa5, 0xe1, 0x109],
  /** A volume bar, off the screen's centre and off its own row. */
  bar: { left: -0x75, below: 0x19 },
  /** The confirm's three lines, off the screen's centre (0x45AA5C). */
  sure: -0x5a,
  yes: { x: -0x1e, y: -0x32 },
  no: { x: 0x2a, y: -0x32 }
}

/**
 * The five colours the menu is printed in, and they are the exe's.
 *
 * The title is green, the lit row white and every other grey (0x45B0CB writes
 * 0x80 for the dim pass); a volume's fill is red, bright on the lit row and
 * dark on an unlit one, over a track in the row's own colour.
 */
const INK = {
  title: [0, 255, 0],
  lit: [255, 255, 255],
  dim: [128, 128, 128],
  fillLit: [255, 40, 40],
  fillDim: [128, 40, 40]
} as const

type Ink = keyof typeof INK

/**
 * How dark the panel's inside goes.
 *
 * The exe lays one quad through the library's blitter with no sprite on it —
 * colour 0xFFFFFFFF, mode 0x80000000 — and what that mode blends as was NOT
 * decoded, only that the 3D frame keeps being drawn behind it.
 * `[CHECK — remake]`: a half-strength darken is what reads as the original's
 * and it is a judgement, like the dial's green.
 */
const PANEL_SHADE = 'rgba(0, 0, 0, 0.5)'

/** The track a volume is drawn over — twenty cells, the exe's own string. */
const TRACK = 'I '.repeat(BAR_CELLS)

export interface PauseMenu {
  /** The frame's tiles come out of the dashboard's own archive, which the HUD
   * has already decoded — so it is handed in rather than read twice. */
  load(art: SpriteSet): Promise<void>
  draw(
    context: CanvasRenderingContext2D,
    viewWidth: number,
    state: PauseState,
    strings: string[]
  ): void
}

export function createPauseMenu(): PauseMenu {
  const fonts = new Map<Ink, Font>()
  let tiles: SpriteSet | null = null

  /** `gtext`, or nothing at all — a stripped install draws an empty row rather
   * than the id. */
  const say = (strings: string[], id: number): string => strings[id] ?? ''

  return {
    async load(art) {
      tiles = art
      if (fonts.size > 0) return
      // ITS OWN FAILURE IS ITS OWN. The dashboard loads this last, inside the
      // try that decides whether the dashboard loaded at all — so a missing
      // font here must not take the gauge, the clock and the map down with
      // it. `draw` checks and does nothing.
      try {
        const painted = await Promise.all(
          (Object.keys(INK) as Ink[]).map(async (ink) => [
            ink,
            await loadFont(MENU_FONT, { colour: [...INK[ink]] as [number, number, number] })
          ])
        )
        for (const [ink, font] of painted as [Ink, Font][]) fonts.set(ink, font)
      } catch (error) {
        console.warn(`no pause menu: ${String(error)}`)
      }
    },

    draw(context, viewWidth, state, strings) {
      if (!fonts.has('title') || !tiles) return
      const cx = viewWidth / 2
      const cy = LAYOUT.centreY
      const write = (ink: Ink, text: string, x: number, y: number): void => {
        fonts.get(ink)?.draw(context, text, Math.round(x), Math.round(y))
      }
      const centred = (ink: Ink, text: string, y: number): void => {
        const font = fonts.get(ink)
        if (!font) return
        write(ink, text, cx - font.measure(text) / 2, y)
      }

      /** The panel: one darkened quad, then the frame round it. */
      const panel = (box: { x: number; y: number; width: number; height: number }): void => {
        context.fillStyle = PANEL_SHADE
        context.fillRect(box.x, box.y, box.width, box.height)
        const [tl, top, tr, left, right, bl, bottom, br] = FRAME.map((name) => tiles!.get(name).image)
        const innerWidth = box.width - TILE * 2
        const innerHeight = box.height - TILE * 2
        const east = box.x + box.width - TILE
        const south = box.y + box.height - TILE
        // The edges STRETCH between the corners; the corners never do.
        if (innerWidth > 0) {
          context.drawImage(top, box.x + TILE, box.y, innerWidth, TILE)
          context.drawImage(bottom, box.x + TILE, south, innerWidth, TILE)
        }
        if (innerHeight > 0) {
          context.drawImage(left, box.x, box.y + TILE, TILE, innerHeight)
          context.drawImage(right, east, box.y + TILE, TILE, innerHeight)
        }
        context.drawImage(tl, box.x, box.y, TILE, TILE)
        context.drawImage(tr, east, box.y, TILE, TILE)
        context.drawImage(bl, box.x, south, TILE, TILE)
        context.drawImage(br, east, south, TILE, TILE)
      }

      // THE CONFIRM REPLACES THE MENU, it does not sit over it: the exe's draw
      // takes a branch of its own and returns without ever reaching the five
      // rows (0x45AA3C).
      if (state.confirming) {
        panel({
          x: cx - LAYOUT.confirm.halfWidth,
          y: cy - LAYOUT.confirm.height,
          width: LAYOUT.confirm.halfWidth * 2,
          height: LAYOUT.confirm.height
        })
        centred('title', say(strings, ARE_YOU_SURE), cy + LAYOUT.sure)
        write(state.yes ? 'lit' : 'dim', say(strings, CONFIRM_YES), cx + LAYOUT.yes.x, cy + LAYOUT.yes.y)
        write(state.yes ? 'dim' : 'lit', say(strings, CONFIRM_NO), cx + LAYOUT.no.x, cy + LAYOUT.no.y)
        return
      }

      const top = cy - LAYOUT.panel.halfHeight
      panel({
        x: cx - LAYOUT.panel.halfWidth,
        y: top,
        width: LAYOUT.panel.halfWidth * 2,
        height: LAYOUT.panel.halfHeight * 2
      })
      centred('title', say(strings, PAUSE_TITLE), top + LAYOUT.title)

      PAUSE_ROWS.forEach((row, index) => {
        const y = top + LAYOUT.rows[index]
        const ink: Ink = index === state.row ? 'lit' : 'dim'
        if (row.kind === 'speech') {
          // ONE line, not a label with a value beside it: the exe formats
          // "%u %u" out of SPEECH and ON/OFF and centres the pair (0x4CFA14).
          const on = state.speech ? SPEECH_ON : SPEECH_OFF
          centred(ink, `${say(strings, row.label)} ${say(strings, on)}`, y)
          return
        }
        // ABORT MISSION alone, or ABORT SKIRMISH with anybody else on the map
        // — the exe switches on the PLAYER COUNT (0x45B490), and the remake
        // has one player, so `ABORT_SKIRMISH` in lib/game/pauseMenu.ts is the
        // id waiting for the day it fields more.
        centred(ink, say(strings, row.label), y)
        if (row.kind !== 'master' && row.kind !== 'sfx') return
        // …and under a volume, its bar: the track in the row's own colour and
        // the fill over it, one cell per five.
        const level = row.kind === 'master' ? state.master : state.sfx
        const barX = cx + LAYOUT.bar.left
        const barY = y + LAYOUT.bar.below
        write(ink, TRACK, barX, barY)
        write(ink === 'lit' ? 'fillLit' : 'fillDim', 'I '.repeat(barCells(level)), barX, barY)
      })
    }
  }
}
