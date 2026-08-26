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
//  3. the REGION (0x4833B0) — the page close up, every one of its missions
//     revealing one by one as a flag in the colour of the nation HOLDING it
//     with its pole over the top, and the CURRENT one wearing the player's
//     own animated marker, bobbing on the wave table. 10 000 ms, or any key.
//
// Any key skips the phase it lands in — the exe's own (0x480870). BACK skips
// the WHOLE map instead, which is the remake's own shortcut (`[deliberate]`).
//
// The training ground never sees any of this: the exe gates the sequence on
// mapId ≠ 10, and `main.ts` does the same by position 0.

import { byId } from './dom'
import { SCREEN } from './barScreen'
import { controller } from '../input/controller'
import { trackRows } from './mouseRows'
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
  regionSpan,
  standsShown
} from '../../../lib/game/pigmap'

/** The exe's own clocks: the blink's tick, the zoom's step, the region's
 * hold and the flag reveal's cadence. The marker's bob step is
 * `[CHECK — remake]` — the wave table is read, its cadence is not. */
const WORLD_MS = 2000
const BLINK_TICK_MS = 64
const ZOOM_STEP_MS = 50
const REGION_MS = 10000
const BOB_MS = 100
/** The zoom's VEIL: alpha `easing·64` of 255, drawn over a rect of its own
 * whose travel caps at 0.75 — the second pass settled that the cap belongs
 * to the veil ALONE, the page flying the whole way (0x483010, twice-built
 * rect). Phase 3 draws no veil at all. */
const VEIL = 64 / 255
const VEIL_TRAVEL = 0.75

/** The flag flies 40×32 and its pole 8×62, both hung (−8, −62) off the
 * stand's own point and drawn in that order — the pole goes OVER the flag's
 * own hoist edge (0x48356C then 0x4835F4, one x/y for the pair). */
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
  /** How many of the 25 territories were tinted and laid down last frame. */
  patches(): number
  /** How many flags flew in the last region frame. */
  flags(): number
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
  /** Territory patches drawn in the last world frame — the debug read. */
  let patches = 0
  /** Flags blitted in the last region frame, for the same reason: a page of
   * bare poles is a perfectly good-looking page, so a miss here is silent. */
  let flags = 0

  /**
   * WHOSE COLOUR a position flies — its patch on the world map, and its flag
   * on the region page, both off this one answer (0x483A4C fills the array
   * the two share).
   *
   * The exe keeps it as a 25-entry array of nations, rolled when the army is
   * born and RE-STAMPED at the debrief (0x484F2E) — so a mission that has
   * been won reads back as ours from then on. We do not re-stamp anything: a
   * save's `enemies` is the roll, and a position already behind the campaign
   * is ours by arithmetic. Same answer, one fewer thing to keep in step.
   *
   * That is the whole point of the screen, in play's words: "наш цвет
   * захватывает карту". Anything with no nation at all is index 7, the brown
   * "none".
   */
  const holder = (pos: number): number => (pos < position ? own : (enemies[pos] ?? 7))

  /**
   * A tint, cached — keyed by the name the TABLES use, so the writing side
   * and the reading side cannot drift apart on the archive's own spelling.
   * (`spriteSet.get` is case-insensitive; this key is not, so it makes its
   * own case.)
   */
  const tintOf = async (set: SpriteSet, name: string, nation: number): Promise<void> => {
    const key = `${name.toLowerCase()}:${nation}`
    if (tints.has(key)) return
    tints.set(key, await tinted(set.get(name), [...nationColour(nation)]))
  }

  /** The same key, for the drawing side. */
  const tintFor = (name: string, nation: number): Sprite | undefined =>
    tints.get(`${name.toLowerCase()}:${nation}`)

  const pageOf = (region: number): Sprite | null => pages.get(REGION_PAGES[region].art) ?? null

  /** The composed world scene (0x483980): BigMap, the tinted patches ADDED
   * over it, the banners. `flashCurrent` is phase 1's blink. */
  const worldScene = (context: CanvasRenderingContext2D, flashCurrent: boolean): void => {
    if (!world || !tims || !banners) return
    context.drawImage(world.get('bigmap').image, 0, 0)
    let laid = 0
    // THE PATCHES ARE ADDED, NOT LAID OVER. The composer draws them with the
    // library's flag 0x41, whose bit 0x40 sets SRCBLEND and DESTBLEND both to
    // ONE (`_d3d.dll` 0x1000ECC8) — so a territory's colour is ADDED to the
    // map under it and BigMap's own relief keeps showing through. The art is
    // a greyscale silhouette and the nation colour is the diffuse it is
    // modulated by, 0xFF neutral; drawn the ordinary way it is a flat slab of
    // paint over the map instead of a wash across it.
    context.globalCompositeOperation = 'lighter'
    SITES.forEach((site, i) => {
      // The BLINK does not hide the current territory: the exe redraws it
      // with the colour forced to white (0x482D99, `ebx = 0xFFFFFFFF`), which
      // over an additive blend is the mask at full brightness — a FLASH.
      const painted =
        flashCurrent && i === position - 1
          ? tims!.get(site.art)
          : tintFor(site.art, holder(i + 1))
      if (!painted) return
      context.drawImage(painted.image, site.x, site.y)
      laid++
    })
    context.globalCompositeOperation = 'source-over'
    // How many territories actually took a colour. A miss here is SILENT —
    // the bare BigMap underneath is a perfectly good-looking map — so a spec
    // counts them (`pow.pigMap.patches`).
    patches = laid
    for (const banner of BANNERS) {
      context.drawImage(banners.get(banner.art).image, banner.x, banner.y)
    }
  }

  const drawZoom = (context: CanvasRenderingContext2D, step: number): void => {
    const region = regionOf(position)
    const page = pageOf(region)
    const site = SITES[position - 1]
    const patch = tintFor(site.art, holder(position))
    if (!page || !patch) return
    const f = (ZOOM_EASING[Math.min(step, ZOOM_EASING.length - 1)] ?? 100) / 100
    const target = REGION_PAGES[region]
    const between = (from: number, to: number, by: number): number => from + (to - from) * by
    const x = between(site.x, target.x, f)
    const y = between(site.y, target.y, f)
    const width = between(patch.width, target.width, f)
    const height = between(patch.height, target.height, f)

    worldScene(context, false)
    // The veil rides its OWN rect, three quarters of the travel behind.
    const v = f * VEIL_TRAVEL
    context.fillStyle = `rgba(0, 0, 0, ${(VEIL * f).toFixed(3)})`
    context.fillRect(
      between(site.x, target.x, v),
      between(site.y, target.y, v),
      between(patch.width, target.width, v),
      between(patch.height, target.height, v)
    )
    context.globalAlpha = 1 - f
    context.drawImage(patch.image, x, y, width, height)
    context.globalAlpha = f
    context.drawImage(page.image, x, y, width, height)
    context.globalAlpha = 1
  }

  const drawRegion = (context: CanvasRenderingContext2D, elapsed: number): void => {
    flags = 0
    if (!tims) return
    const region = regionOf(position)
    const page = pageOf(region)
    const at = REGION_PAGES[region]
    if (!page) return
    // The snapshot the exe restores is the WORLD scene — phase 3 wears no
    // veil (0x4833B0; the second pass settled it).
    worldScene(context, false)
    context.drawImage(page.image, at.x, at.y, at.width, at.height)

    // EVERY stand of the region flies a flag, from the very first visit —
    // there is no "only where the campaign has been". The loop at
    // 0x483566..0x483631 carries no comparison at all: its one gate is the
    // timed cursor, and the flag and its pole are the same two blits every
    // time round. What a flag says is WHO HOLDS that mission, so a fresh
    // campaign opens on a page full of other nations' colours and takes them
    // over one by one.
    const [from, to] = regionSpan(region)
    const shown = standsShown(elapsed, to - from)
    const pole = tims.get('fpole')
    let flown = 0
    for (let i = 0; i < shown; i++) {
      const pos = from + i
      const stand = FLAG_STANDS[pos - 1]
      if (!stand) continue
      const x = at.x + stand[0] + FLAG.dx
      const y = at.y + stand[1] + FLAG.dy
      const flag = tintFor('flag', holder(pos))
      if (flag) {
        context.drawImage(flag.image, x, y, FLAG.width, FLAG.height)
        flown++
      }
      context.drawImage(pole.image, x, y, POLE.width, POLE.height)
    }
    flags = flown

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
      const art = tintFor(name, own)
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
  // A click skips the phase, the way any non-BACK key does (play's rule: the
  // mouse drives every screen — ui/mouseRows.ts). Walking out stays on the
  // keyboard's ESCAPE alone: there is nothing drawn to hang a "back" box on.
  trackRows(
    canvas,
    () =>
      visible && phase !== 'off'
        ? [{ x: 0, y: 0, width: SCREEN.width, height: SCREEN.height }]
        : [],
    (row) => {
      if (row === 0 && visible && phase !== 'off') advance(performance.now())
    }
  )

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
      SITES.forEach((site, i) => jobs.push(tintOf(tims!, site.art, holder(i + 1))))
      const [from, to] = regionSpan(regionOf(position))
      for (let pos_ = from; pos_ < to; pos_++) jobs.push(tintOf(tims, 'flag', holder(pos_)))
      for (const part of ['ar1', 'ar2', 'ar3', 'ar4']) {
        jobs.push(tintOf(tims, part, own))
      }
      await Promise.all(jobs)
      phase = 'world'
      phaseBegan = performance.now()
    },
    phase: () => phase,
    patches: () => patches,
    flags: () => flags,
    layout: {}
  }
}
