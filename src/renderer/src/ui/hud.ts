// The battle's dashboard, in the game's own brass.
//
// What the original keeps on screen, from play:
//
// - the CLOCK, bottom right;
// - the ANGLE DIAL and the WEAPON SLOT as one widget, top right, always
//   there — the slot empty until a weapon is chosen;
// - the MAP, bottom left — the level from above with a blip on everything
//   worth one, turning under the camera (ui/battleMap.ts);
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
//
// Its parts live in `hud/`, sharing one core and one frame (`hud/frame.ts`).

import type { MapRaster } from '../../../lib/game/mapRaster'
import type { PauseState } from '../../../lib/game/pauseMenu'
import type { Blip, Eye } from '../../../lib/game/scanner'
import type { FloatingNumber, PigPlate } from '../contracts/overlay'
import { createBattleMap } from './battleMap'
import { createBriefingBar } from './briefingBar'
import { BATTLE_STRETCH, loadFont } from './font'
import type { Font } from './font'
import { createDashState } from './hud/dash'
import type { DashFrame, HudCore } from './hud/frame'
import { drawClock, drawDial, drawGauge } from './hud/instruments'
import {
  AUTHORED_HEIGHT,
  DASHBOARD,
  LAYOUT,
  MARKERS,
  PLATE_FONT,
  TEXT_FONT,
  offerLayout
} from './hud/layout'
import { drawNumbers } from './hud/numbers'
import { drawPlates } from './hud/plates'
import { drawScope } from './hud/scope'
import { createPauseMenu } from './pauseMenu'
import { createSkillMenu } from './skillMenu'
import type { SkillMenu } from './skillMenu'
import { loadTims, tinted } from './sprites'
import type { Sprite, SpriteSet } from './sprites'
import { drawTitleCard } from './titleCard'
import { reportFailure } from '../failures/report'

export interface HudState {
  /** Seconds since the last frame — the briefing bar's slide and scroll run
   * on it; nothing else on the dashboard moves by itself. */
  delta: number
  /**
   * The PAUSE MENU's state while it is up, or null (lib/game/pauseMenu.ts).
   * It is drawn last of everything, because it is the one thing on the
   * dashboard that is modal.
   */
  pause: PauseState | null
  /**
   * Whether the game is PAUSED. The dashboard keeps drawing — the frozen
   * world behind it is the point — but everything on it that moves by itself
   * stops, because a briefing bar scrolling over a still battle reads as the
   * game still running.
   */
  paused: boolean
  /** Seconds left in the turn; the clock shows two digits of it. */
  seconds: number
  /** Every living pig, projected by the scene. */
  pigs: PigPlate[]
  /** The damage floating off whatever was just hit, projected by the scene
   * (contracts/overlay.ts). */
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
  /**
   * How full the port's red LENS is, 0..1 — or null for an empty port.
   *
   * Not the charge: it is what the weapon DOES. Half for an ordinary one and
   * whole for one that goes off on contact, which is what play describes of the
   * bazooka's (`DIAL.slot.lens`, and lib/game/grenade.ts for the class).
   */
  lens: number | null
  /** How full the power gauge is, 0..1, or null when nothing is charging —
   * which is when the gauge is not drawn at all (lib/game/gauge.ts). */
  charge: number | null
  /** The level's opening card — "TRAINING MISSION: BOOT CAMP" — while the
   * squad is still in the air, and null once it is down (ui/titleCard.ts). */
  title: string | null
  /** Where the camera stands and which way it looks: the map is centred on
   * it and turns with it. Null before there is a scene to ask. */
  eye: Eye | null
  /** Everything the map shows a marker for, already filtered by whose turn
   * it is — an enemy scout is not on this list (lib/game/scanner.ts). */
  blips: readonly Blip[]
}

export interface Hud {
  /** Decode the dashboard and its font. Safe to call repeatedly. */
  load(): Promise<void>
  /** Draw one frame over the battle. */
  draw(state: HudState): void
  /** Send a line through the briefing bar (ui/briefingBar.ts). */
  say(text: string): void
  /** Hand the map the level's picture, built once when the battle opens
   * (lib/game/mapRaster.ts). Null blanks it. */
  ground(raster: MapRaster | null): Promise<void>
  /** The skill menu, which the battle opens and drives (ui/skillMenu.ts). */
  readonly skills: SkillMenu
  /** Whether the bar still has anything to say. */
  speaking(): boolean
  /** Wipe it — the battle is no longer the view. */
  clear(): void
  /** Whether the dashboard has finished arriving: the map's entrance is the
   * last of it to play out (ui/battleMap.ts). */
  arrived(): boolean
}

export function createHud(canvas: HTMLCanvasElement): Hud {
  offerLayout()
  // The bar is its own piece with its own art and its own clock; the
  // dashboard only owns the canvas they share.
  const bar = createBriefingBar()
  // The map keeps its own art, its own entrance and its own easing scale,
  // the same way the bar keeps its clock — the dashboard only owns the
  // canvas they share (ui/battleMap.ts).
  const battleMap = createBattleMap()
  // What the pig is carrying, in the game's own frame. Its art is loaded
  // beside the dashboard's and it draws over everything else.
  const skills = createSkillMenu()
  const pauseMenu = createPauseMenu()
  let art: SpriteSet | null = null
  let font: Font | null = null
  /** …and one painted copy per TEAM colour seen, made the frame a plate first
   * arrives in that colour (contracts/overlay.ts). */
  const teamFonts = new Map<string, Font>()
  const teamLoads = new Set<string>()
  let heart: Sprite | null = null
  /** What every pig's number was last frame — the only way to see it fall. */
  const wasHealth = new Map<string, number>()
  const dash = createDashState()
  const core: HudCore = {
    canvas,
    bar,
    battleMap,
    skills,
    pauseMenu,
    teamFonts,
    teamLoads,
    wasHealth,
    dash
  }

  const repaint = async (): Promise<void> => {
    if (!dash.white) return
    const wanted = JSON.stringify([
      LAYOUT.dial.green,
      LAYOUT.plate.heart.colour,
      LAYOUT.plate.heart.poisoned
    ])
    if (wanted === dash.painted) return
    dash.painted = wanted
    dash.fans = await Promise.all(dash.white.fans.map((wedge) => tinted(wedge, LAYOUT.dial.green)))
    heart = await tinted(dash.white.heart, LAYOUT.plate.heart.colour)
    dash.sickHeart = await tinted(dash.white.heart, LAYOUT.plate.heart.poisoned)
    // The heal's letters take the same colour its heart does, so nudging one in
    // the console moves both.
    dash.healFont = await loadFont(TEXT_FONT, { colour: LAYOUT.plate.heart.colour })
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
      if (dash.loaded) return
      try {
        const [dashboard, markers, big, small, outline] = await Promise.all([
          loadTims(DASHBOARD),
          loadTims(MARKERS),
          loadFont(TEXT_FONT),
          loadFont(PLATE_FONT, { stretch: BATTLE_STRETCH }),
          loadFont(PLATE_FONT, { colour: [0, 0, 0], stretch: BATTLE_STRETCH })
        ])
        art = dashboard
        font = big
        dash.plateFont = small
        dash.plateOutline = outline
        dash.digits = art.frames('timer', 0, 9)
        dash.white = {
          fans: [dashboard.get('wedge1'), dashboard.get('wedge2')],
          heart: markers.get('iconhart')
        }
        await repaint()
        await bar.load()
        await battleMap.load()
        await skills.load()
        await pauseMenu.load(dashboard)
        dash.loaded = true
      } catch (error) {
        // A stripped install has no dashboard.
        reportFailure('loading the dashboard', error)
      }
    },

    say: (text) => bar.say(text),
    ground: (raster) => battleMap.ground(raster),
    skills,
    speaking: () => bar.busy(),
    arrived: () => battleMap.arrived(),

    clear() {
      bar.clear()
      skills.close()
      // The next battle plays the entrance again, as the original does — the
      // slide belongs to the map going up, not to the app starting.
      battleMap.reset()
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
      // WHAT THE PAUSE STOPS, and what it does NOT. The dashboard is still
      // drawn — the point of a pause is to look at the battle — and everything
      // on it that moves because the WORLD moves is handed a delta of zero: the
      // bar stops scrolling, the plates stop fading.
      //
      // Nothing on the map needs the real one: its size never changes (play's
      // ruling, `lib/game/scanner.ts`) and its entrance is twenty frames long
      // and over before a pause can happen.
      const delta = state.paused ? 0 : state.delta

      // The bar runs on its own clock and its own art, so it neither waits
      // for the dashboard to decode nor stops when the dashboard is missing.
      bar.update(delta)
      context.save()
      context.scale(scale, scale)
      bar.draw(context, viewWidth)
      context.restore()

      if (!art || !font || !heart || dash.fans.length === 0) return
      // A console change to either painted colour lands on the next frame.
      void repaint()

      const blit = (sprite: Sprite, x: number, y: number): void => {
        context.drawImage(
          sprite.image,
          Math.round(x * scale),
          Math.round(y * scale),
          Math.round(sprite.width * scale),
          Math.round(sprite.height * scale)
        )
      }
      const frame: DashFrame = { context, scale, viewWidth, delta, state, art, font, heart, blit }

      drawScope(core, frame)
      // The level's opening card, in the same units as everything else here.
      if (state.title) {
        context.save()
        context.scale(scale, scale)
        drawTitleCard(context, font, state.title, viewWidth)
        context.restore()
      }
      drawClock(core, frame)
      drawGauge(core, frame)
      drawDial(core, frame)

      // THE MAP, after the gauge and before anything modal — which is the
      // exe's own order round the HUD frame (0x4578D2 the gauge, 0x4578D9
      // the map). It shrinks while a shot is charging, and `charge` is
      // exactly the condition the original ties that to: the skill's record
      // says it has a gauge, and the same branch turns both on (0x493CBD).
      context.save()
      context.scale(scale, scale)
      battleMap.draw(context, viewWidth, AUTHORED_HEIGHT, {
        delta,
        eye: state.eye,
        blips: state.blips,
      })
      context.restore()

      // The skill menu goes over the brass, since it is a MODE rather than
      // another gauge: while it is up the pig cannot be driven.
      skills.update(delta)
      if (skills.open()) {
        context.save()
        context.scale(scale, scale)
        skills.draw(context, viewWidth, state.strings)
        context.restore()
      }

      drawNumbers(core, frame)

      // THE PLATES ARE A FUNCTION because they can REFUSE to draw, and what
      // follows them must not be refused with them. This used to be a bare
      // `return` in the middle of `draw`, and the pause menu was added after
      // it: ESCAPE froze the game, the menu answered its keys and made its
      // noises, and nothing was ever painted, because a pig that had not been
      // standing still long enough took the whole rest of the frame with it.
      // Play saw exactly that.
      if (dash.plateFont) drawPlates(core, frame, dash.plateFont, heart)

      // …AND THE PAUSE OVER ALL OF IT. Last, because it is the only modal
      // thing the dashboard carries: the exe draws it over the live frame too
      // and the world behind it is simply not stepping (ui/pauseMenu.ts).
      if (state.pause) {
        context.save()
        context.scale(scale, scale)
        pauseMenu.draw(context, viewWidth, state.pause, state.strings)
        context.restore()
      }
    }
  }
}
