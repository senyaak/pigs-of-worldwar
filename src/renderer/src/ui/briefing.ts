// THE BRIEFING — the mission's page, and it IS the loading screen.
//
// The original never shows a briefing you can read at leisure and then a
// loader: `briefing\level<position>.bmp` goes up, the level loads UNDER it
// with a 17-step loadbar at (152, 451), and when the load is done gtext 257
// "PRESS ANY KEY" creeps up from the bar until a key starts the mission
// (0x45C3D0 / 0x45D2E0, `pigmap/notes.md` in the disasm repo). The mission
// text is BAKED into the localized BMP — nothing writes it at runtime.
//
// Position 0 is the training ground's own page, `level0.bmp`, with no map
// chain in front of it. Position 1 alone pastes the ENEMY's portrait —
// `level1n<nation>.bmp`, colour-keyed — into the page at (342, 190).
//
// Our level load has no 17 stages to report, so the bar walks on its own
// clock to the last step and holds there until the load resolves
// (`[CHECK — remake]` for the walking speed; the geometry is the exe's).

import { byId } from './dom'
import { SCREEN, loadFrontend } from './barScreen'
import type { Font } from './font'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadLanguageSprites } from './sprites'
import type { Sprite } from './sprites'
import { nationArt } from '../../../lib/game/pigmap'

/** The bar: at (152, 451), 330 wide and 15 tall, filled in 17 steps
 * (0x4BC8F0/8F8/900/910, authored 640×480). */
const BAR = { x: 152, y: 451, width: 330, height: 15, steps: 17 }
/** How long the bar takes to walk to its LAST step while the real load
 * runs underneath — `[CHECK — remake]`. */
const WALK_MS = 2500

/** gtext 257, creeping up 2 px a frame (0x45D2E0). */
const PRESS_TEXT = 257
const PRESS_STEP = 2
/**
 * WHERE THE LINE RESTS: **inside the bar's own rectangle**, and the bar is
 * gone by the time it is read. `[play]`, 2026-08-25 — "press any key выше
 * чем полоса загрузки, а должен быть внутри как бы + полоса загрузки
 * исчезает когда полностью загружено." So the two share one place on the
 * page: the bar fills it while the load runs, and the words take it over
 * when the load is in.
 *
 * Both numbers are the BAR's, not taste: the line comes up from under its
 * bottom edge and stops centred on it — CHARS2 is 16 tall against the bar's
 * 15, so the centre rounds one pixel high. Only the creep's start and its
 * step were ever read out of the exe (0x45D2E0); where it stops is play's.
 */
const PRESS_FROM = BAR.y + BAR.height
const PRESS_TOP = BAR.y + Math.round((BAR.height - 16) / 2)

/** The enemy portrait's paste point on the level-1 page (0x45C530). */
const PORTRAIT = { x: 342, y: 190 }

export interface Briefing {
  load(): Promise<void>
  enter(): void
  leave(): void
  /**
   * Show the page for `position` (0 = the training ground) and hold it while
   * `loading` runs. Once both the load and the bar are done, PRESS ANY KEY —
   * and a key already pressed counts, so a player who mashes is not asked
   * twice. `enemy` is the nation faced, pasted in on position 1 alone.
   */
  show(position: number, enemy: number | null, loading: Promise<boolean>): void
  /** The load is in and a key would start the mission — what a spec polls. */
  ready(): boolean
  layout: Record<string, never>
}

export function initBriefing(handlers: {
  /** A key on the loaded page: the mission starts. */
  onGo: () => void
  /** The load came back false — there is nothing to start. */
  onFailed: () => void
}): Briefing {
  const canvas = byId<HTMLCanvasElement>('briefing-screen')
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let font: Font | null = null
  let press = 'PRESS ANY KEY'
  let fontLoaded = false
  let visible = false

  let page: Sprite | null = null
  let bar: Sprite | null = null
  let began = 0
  let loadedOk: boolean | null = null
  let keyed = false
  let started = false
  let pressY = PRESS_FROM

  const ready = (): boolean => loadedOk === true

  const go = (): void => {
    if (started) return
    started = true
    handlers.onGo()
  }

  controller.onAction(() => {
    if (!visible) return
    // ANY key — the exe's 0x480870 — and one pressed EARLY is remembered.
    keyed = true
    if (ready()) go()
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  const draw = (now: number): void => {
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (page) context.drawImage(page.image, 0, 0, canvas.width, canvas.height)

    // The bar walks its 17 steps on the clock and holds one short until the
    // load really is in; the art is stretched over the exe's own rectangle.
    // It is GONE the moment the load is in — `[play]`: the bar says "wait",
    // and there is nothing left to wait for, so the rectangle it was filling
    // goes to the words instead (PRESS_TOP above).
    const walked = Math.min(BAR.steps - 1, Math.floor(((now - began) / WALK_MS) * BAR.steps))
    const steps = ready() ? 0 : walked
    if (bar && steps > 0) {
      const fraction = steps / BAR.steps
      context.drawImage(
        bar.image,
        0, 0, bar.width * fraction, bar.height,
        BAR.x, BAR.y, BAR.width * fraction, BAR.height
      )
    }

    if (ready() && font) {
      if (pressY > PRESS_TOP) pressY -= PRESS_STEP
      font.draw(
        context,
        press,
        Math.round((canvas.width - font.measure(press)) / 2),
        Math.round(pressY)
      )
    }
  }

  let frame = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    draw(now)
  }
  const run = (on: boolean): void => {
    if (on && frame === 0) frame = requestAnimationFrame(paint)
    if (!on && frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  return {
    async load() {
      if (fontLoaded) return
      try {
        const [shared, strings] = await Promise.all([
          loadFrontend(),
          window.api.loadGameText('gtext')
        ])
        font = shared.lit
        if (strings.ok) press = strings.strings[PRESS_TEXT] || press
      } catch (error) {
        console.warn(String(error))
        return
      }
      fontLoaded = true
    },
    enter() {
      visible = true
      run(true)
    },
    leave() {
      visible = false
      run(false)
    },
    show(position, enemy, loading) {
      page = null
      bar = null
      began = performance.now()
      loadedOk = null
      keyed = false
      started = false
      pressY = PRESS_FROM
      void this.load()
      const pageName = `level${position}`
      const names = [pageName, 'loadbar']
      const overlay = position === 1 && enemy !== null ? `level1n${nationArt(enemy)}` : null
      if (overlay) names.push(overlay)
      void loadLanguageSprites('Briefing', names, overlay ? [overlay] : [])
        .then((art) => {
          bar = art.get('loadbar')
          const sheet = art.get(pageName)
          if (!overlay) {
            page = sheet
            return
          }
          // Position 1 pastes the enemy's portrait into the page — the exe's
          // colour-keyed blit at (342, 190).
          const composed = new OffscreenCanvas(sheet.width, sheet.height)
          const context = composed.getContext('2d')
          if (!context) {
            page = sheet
            return
          }
          context.drawImage(sheet.image, 0, 0)
          context.drawImage(art.get(overlay).image, PORTRAIT.x, PORTRAIT.y)
          void createImageBitmap(composed).then((image) => {
            page = { ...sheet, image }
          })
        })
        .catch((error) => console.warn(String(error)))
      void loading.then((ok) => {
        loadedOk = ok
        if (!ok) {
          started = true
          handlers.onFailed()
          return
        }
        if (keyed) go()
      })
    },
    ready,
    layout: {}
  }
}
