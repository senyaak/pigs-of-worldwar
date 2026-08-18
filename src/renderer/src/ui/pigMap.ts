// THE PIG MAP — the world map, the zoom, and the region with its flags: what
// the original shows between the squad screen and a mission.
//
// It is not a frontend screen at all: the exe runs it in the mission host
// after the menu machine has torn down (0x482C30, `pigmap/notes.md` in the
// disasm repo), which is why it took a play memory to find. Three phases,
// every number the exe's:
//
//  1. the WORLD MAP (0x482CD0) — `BigMap.bmp` under 25 territory patches,
//     each tinted by the nation holding that mission, and six region name
//     banners; the CURRENT mission's patch blinks on `tick & 0x10` of a
//     64 ms tick, for 2000 ms;
//  2. the ZOOM (0x483010) — the current patch's rectangle flies to the
//     region page's over 32 steps of 50 ms on the easing table, the patch
//     fading out, the region page fading in, a black veil rising to 64/255;
//  3. the REGION (0x4833B0) — the page close up, a flag pole on every one of
//     its missions revealing one by one, the conquered ones flying the
//     nation's flag, and the CURRENT one wearing the player's own animated
//     marker, bobbing on the wave table. 10 000 ms, or any key.
//
// Any key skips the phase it lands in — the exe's own (0x480870). BACK skips
// the WHOLE map instead, which is the remake's own shortcut (`[deliberate]`).
//
// The training ground never sees any of this: the exe gates the sequence on
// mapId ≠ 10, and `main.ts` does the same by position 0.

import { byId } from './dom'
import { SCREEN } from './barScreen'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadLanguageSprites, loadTims, tinted } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import {
  BANNERS,
  FLAG_STANDS,
  MARKER_WAVE,
  REGION_PAGES,
  SITES,
  ZOOM_EASING,
  nationColour,
  regionOf,
  regionSpan
} from '../../../lib/game/pigmap'

/** The exe's own clocks: the blink's tick, the zoom's step, the region's
 * hold and the flag reveal's cadence. The marker's bob step is
 * `[CHECK — remake]` — the wave table is read, its cadence is not. */
const WORLD_MS = 2000
const BLINK_TICK_MS = 64
const ZOOM_STEP_MS = 50
const REGION_MS = 10000
const REVEAL_MS = 150
const BOB_MS = 100
/** The veil's ceiling — alpha `f·64` of 255 at full zoom. */
const VEIL = 64 / 255

/** The flag flies 40×32 and its pole 8×62, both hung (−8, −62) off the
 * stand's own point (0x4833B0). */
const FLAG = { width: 40, height: 32, dx: -8, dy: -62 }
const POLE = { width: 8, height: 62 }

type Phase = 'off' | 'world' | 'zoom' | 'region'

export interface PigMap {
  load(): Promise<void>
  enter(): void
  leave(): void
  /** What the map is about: the campaign position 1..25, the nation holding
   * each position (`save.enemies`), and the player's own. */
  show(position: number, enemies: number[], ownNation: number): Promise<void>
  phase(): Phase
  layout: Record<string, never>
}

export function initPigMap(handlers: { onDone: () => void }): PigMap {
  const canvas = byId<HTMLCanvasElement>('pigmap-screen')
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let world: SpriteSet | null = null
  let tims: SpriteSet | null = null
  let banners: SpriteSet | null = null
  /** The region pages, by archive stem, fetched the first time a region
   * comes up. */
  const pages = new Map<string, Sprite>()
  /** Tinted art, by `entry:nation`. */
  const tints = new Map<string, Sprite>()
  let loaded = false
  let visible = false

  let position = 1
  let enemies: number[] = []
  let own = 0
  let phase: Phase = 'off'
  let phaseBegan = 0
  let done = false

  const holder = (pos: number): number => enemies[pos] ?? 7

  const tintOf = async (sprite: Sprite, nation: number): Promise<Sprite> => {
    const key = `${sprite.name}:${nation}`
    const had = tints.get(key)
    if (had) return had
    const painted = await tinted(sprite, [...nationColour(nation)])
    tints.set(key, painted)
    return painted
  }

  const pageOf = (region: number): Sprite | null => pages.get(REGION_PAGES[region].art) ?? null

  /** The composed world scene (0x483980): BigMap, the tinted patches, the
   * banners. The current patch can be left out — the blink. */
  const worldScene = (context: CanvasRenderingContext2D, hideCurrent: boolean): void => {
    if (!world || !tims || !banners) return
    context.drawImage(world.get('bigmap').image, 0, 0)
    SITES.forEach((site, i) => {
      if (hideCurrent && i === position - 1) return
      const painted = tints.get(`${site.art}:${holder(i + 1)}`)
      if (painted) context.drawImage(painted.image, site.x, site.y)
    })
    for (const banner of BANNERS) {
      context.drawImage(banners.get(banner.art).image, banner.x, banner.y)
    }
  }

  const drawZoom = (context: CanvasRenderingContext2D, step: number): void => {
    const region = regionOf(position)
    const page = pageOf(region)
    const site = SITES[position - 1]
    const patch = tints.get(`${site.art}:${holder(position)}`)
    if (!page || !patch) return
    const f = (ZOOM_EASING[Math.min(step, ZOOM_EASING.length - 1)] ?? 100) / 100
    const target = REGION_PAGES[region]
    const x = site.x + (target.x - site.x) * f
    const y = site.y + (target.y - site.y) * f
    const width = patch.width + (target.width - patch.width) * f
    const height = patch.height + (target.height - patch.height) * f

    worldScene(context, false)
    context.fillStyle = `rgba(0, 0, 0, ${(VEIL * f).toFixed(3)})`
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.globalAlpha = 1 - f
    context.drawImage(patch.image, x, y, width, height)
    context.globalAlpha = f
    context.drawImage(page.image, x, y, width, height)
    context.globalAlpha = 1
  }

  const drawRegion = (context: CanvasRenderingContext2D, elapsed: number): void => {
    if (!tims) return
    const region = regionOf(position)
    const page = pageOf(region)
    const at = REGION_PAGES[region]
    if (!page) return
    worldScene(context, false)
    context.fillStyle = `rgba(0, 0, 0, ${VEIL.toFixed(3)})`
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(page.image, at.x, at.y, at.width, at.height)

    // The poles and flags come up one by one; the flag flies only where the
    // campaign has already been through.
    const [from, to] = regionSpan(region)
    const shown = Math.min(to - from, Math.floor(elapsed / REVEAL_MS) + 1)
    const pole = tims.get('fpole')
    for (let i = 0; i < shown; i++) {
      const pos = from + i
      const stand = FLAG_STANDS[pos - 1]
      if (!stand) continue
      const x = at.x + stand[0] + FLAG.dx
      const y = at.y + stand[1] + FLAG.dy
      context.drawImage(pole.image, x, y, POLE.width, POLE.height)
      if (pos < position) {
        const flag = tints.get(`flag:${holder(pos)}`)
        if (flag) context.drawImage(flag.image, x, y, FLAG.width, FLAG.height)
      }
    }

    // The player's own marker on the CURRENT mission, four parts bobbing on
    // the wave — the exe's own offsets (0x4833B0).
    const stand = FLAG_STANDS[position - 1]
    if (!stand) return
    const bx = at.x + stand[0]
    const by = at.y + stand[1]
    const beat = Math.floor(elapsed / BOB_MS) % (MARKER_WAVE.length * 2 - 2)
    const wave =
      MARKER_WAVE[beat < MARKER_WAVE.length ? beat : MARKER_WAVE.length * 2 - 2 - beat] ?? 0
    const part = (name: string, x: number, y: number): void => {
      const art = tints.get(`${name}:${own}`)
      if (art) context.drawImage(art.image, x, y)
    }
    part('ar2', bx + wave - 64, by - 45)
    part('ar3', bx - 18, by + wave - 91)
    part('ar1', bx - wave + 16, by - 45)
    part('ar4', bx - 18, by - wave - 11)
  }

  const draw = (now: number): void => {
    const context = canvas.getContext('2d')
    if (!context) return
    const elapsed = now - phaseBegan
    if (phase === 'world') {
      const blink = (Math.floor(elapsed / BLINK_TICK_MS) & 0x10) !== 0
      worldScene(context, blink)
    } else if (phase === 'zoom') {
      drawZoom(context, Math.floor(elapsed / ZOOM_STEP_MS))
    } else if (phase === 'region') {
      drawRegion(context, elapsed)
    }
  }

  const finish = (): void => {
    if (done) return
    done = true
    phase = 'off'
    handlers.onDone()
  }

  const advance = (now: number): void => {
    if (phase === 'world') {
      phase = 'zoom'
      phaseBegan = now
    } else if (phase === 'zoom') {
      phase = 'region'
      phaseBegan = now
    } else if (phase === 'region') finish()
  }

  controller.onAction((action) => {
    if (!visible || phase === 'off') return
    // BACK walks out of the whole map; anything else skips the phase, which
    // is the exe's own key.
    if (action === 'menuBack') finish()
    else advance(performance.now())
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  let frame = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    if (phase === 'off') return
    const elapsed = now - phaseBegan
    if (phase === 'world' && elapsed >= WORLD_MS) advance(now)
    else if (phase === 'zoom' && elapsed >= ZOOM_STEP_MS * ZOOM_EASING.length) advance(now)
    else if (phase === 'region' && elapsed >= REGION_MS) advance(now)
    // `advance` may have closed the map; `draw` paints nothing when it has.
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
      if (loaded) return
      try {
        const [bigmap, pmap, lang] = await Promise.all([
          loadLanguageSprites('PigMap', ['bigmap']),
          loadTims('Language/Tims/PigMap/PMAPTIMS.MAD'),
          loadTims('Language/Tims/PigMap/LANGTIMS.MAD')
        ])
        world = bigmap
        tims = pmap
        banners = lang
      } catch (error) {
        console.warn(String(error))
        return
      }
      loaded = true
    },
    enter() {
      visible = true
      run(true)
    },
    leave() {
      visible = false
      run(false)
    },
    async show(pos, held, nation) {
      position = Math.max(1, Math.min(SITES.length, pos))
      enemies = held
      own = nation
      done = false
      await this.load()
      if (!loaded || !tims) {
        // No art is no show: the chain carries on to the briefing rather
        // than standing on a black screen.
        finish()
        return
      }
      // The region page the zoom lands on, fetched once per region.
      const region = REGION_PAGES[regionOf(position)]
      if (!pages.has(region.art)) {
        try {
          const phy = await loadTims(`Language/Tims/PigMap/${region.art}.mad`)
          pages.set(region.art, phy.get(region.art))
        } catch (error) {
          console.warn(String(error))
        }
      }
      // Every tint the three phases will ask for, painted up front.
      const jobs: Promise<unknown>[] = []
      SITES.forEach((site, i) => jobs.push(tintOf(tims!.get(site.art), holder(i + 1))))
      const [from, to] = regionSpan(regionOf(position))
      for (let pos_ = from; pos_ < to; pos_++) {
        if (pos_ < position) jobs.push(tintOf(tims.get('flag'), holder(pos_)))
      }
      for (const part of ['ar1', 'ar2', 'ar3', 'ar4']) {
        jobs.push(tintOf(tims.get(part), own))
      }
      await Promise.all(jobs)
      phase = 'world'
      phaseBegan = performance.now()
    },
    phase: () => phase,
    layout: {}
  }
}
