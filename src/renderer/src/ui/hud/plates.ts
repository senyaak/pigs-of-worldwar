// THE PLATES over the pigs: name and health beside a beating heart, in the
// team's colour, outlined, unstacked, and shown only when the pig stands still
// or somebody is hurt.

import { EXE_FRAME_SECONDS } from '../../../../lib/game/ballistics'
import { BATTLE_STRETCH, loadFont } from '../font'
import type { Font } from '../font'
import { stackPlates } from '../plateStack'
import type { Sprite } from '../sprites'
import type { DashFrame, HudCore } from './frame'
import { LAYOUT, PLATE_FONT } from './layout'

/**
 * Every whole offset within `radius` screen pixels of a glyph, the centre left
 * out — the outline's own stamp (`LAYOUT.plate.outline`). Built once per radius
 * and kept, because the plate is drawn for every pig on the screen and the set
 * is twenty-four wide at a radius of two.
 */
const rings = new Map<number, readonly (readonly [number, number])[]>()
const aroundBy = (radius: number): readonly (readonly [number, number])[] => {
  const had = rings.get(radius)
  if (had) return had
  const out: [number, number][] = []
  const r = Math.max(1, Math.round(radius))
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx !== 0 || dy !== 0) out.push([dx, dy])
    }
  }
  rings.set(radius, out)
  return out
}

/**
 * The heart's PULSE — play remembers it beating ("и сердечко пульсирует").
 *
 * The RATE is the exe's one read swell, borrowed whole: the lit portrait's
 * angle steps 100 of 4096 a frame (0x41D365, ui/playerScreen.ts uses the same
 * pair), so a beat is about a second and a half. The DEPTH is `[CHECK —
 * remake]` there and stays it here. The pulse is a scale about the heart's own
 * centre — the lines around it are laid out on the resting size, so nothing
 * else on the plate breathes with it.
 */
const PULSE_STEP = (100 / 4096) * Math.PI * 2
const PULSE_DEPTH = 0.12

export const teamFontFor = (
  core: HudCore,
  colour: readonly [number, number, number]
): Font | null => {
  const { teamFonts, teamLoads, dash } = core
  const key = colour.join(',')
  const had = teamFonts.get(key)
  if (had) return had
  if (!teamLoads.has(key)) {
    teamLoads.add(key)
    // No metrics: the battle's letters carry no tracking — the exe's
    // frontend flag is CLEAR in a mission (ui/font.ts, Metrics).
    void loadFont(PLATE_FONT, {
      colour: [colour[0], colour[1], colour[2]],
      stretch: BATTLE_STRETCH
    }).then((painted) => {
      teamFonts.set(key, painted)
    })
  }
  return dash.plateFont
}

// THE PLATES ARE A FUNCTION because they can REFUSE to draw, and what
// follows them must not be refused with them. This used to be a bare
// `return` in the middle of `draw`, and the pause menu was added after
// it: ESCAPE froze the game, the menu answered its keys and made its
// noises, and nothing was ever painted, because a pig that had not been
// standing still long enough took the whole rest of the frame with it.
// Play saw exactly that.
export const drawPlates = (core: HudCore, frame: DashFrame, base: Font, heart: Sprite): void => {
  const { canvas, wasHealth, dash } = core
  const { context, scale, delta, state } = frame
  const { plate: PLATE } = LAYOUT
  // A pig's name, and its health beside a heart under it — once it has
  // stood still long enough. Drawn in the widget's own units, with the
  // scene's screen positions brought back into them. The letters are
  // PLATE_FONT at PLATE.scale, painted the pig's TEAM colour; the heart
  // keeps its own pink — green while poisoned (contracts/overlay.ts).
  //
  // …or the moment anybody's number goes DOWN, standing still or not: the
  // water hurts silently and invisibly, and without this nothing on screen
  // says so (`PLATE.hurt`).
  dash.hurtFor = Math.max(0, dash.hurtFor - delta)
  for (const plate of state.pigs) {
    const before = wasHealth.get(plate.name)
    if (before !== undefined && plate.health < before) dash.hurtFor = PLATE.hurt
    wasHealth.set(plate.name, plate.health)
  }
  // The beat runs while the plates are hidden too — a heart that
  // restarts from zero every time the plate comes back would visibly
  // hiccup — and it counts the exe's frames the way the portrait's
  // swell does (25 a second, ui/playerScreen.ts).
  dash.heartBeat += (delta / EXE_FRAME_SECONDS) * PULSE_STEP
  if (state.still < PLATE.delay && dash.hurtFor <= 0) {
    dash.shownFor = 0
    return
  }
  dash.shownFor += delta
  const factor = PLATE.scale
  const line = base.height * factor
  const gap = base.measure(' ') * factor
  context.save()
  context.scale(scale, scale)
  // The FADE-IN: the whole plate rides one alpha from the moment the
  // gate opened. Play, with the original beside it: "имена вейдятся
  // не просто показываются".
  context.globalAlpha = PLATE.fade > 0 ? Math.min(1, dash.shownFor / PLATE.fade) : 1
  const heartSize = {
    width: heart.width * PLATE.heart.scale,
    height: heart.height * PLATE.heart.scale
  }
  /** One run of glyphs at the plate's own factor, at a screen position —
   * the glyphs stay the atlas's pixels, only resized, which is what keeps
   * them the original's shapes rather than a resample. */
  const run = (font: Font, text: string, x: number, y: number): void => {
    context.save()
    context.translate(x, y)
    context.scale(factor, factor)
    font.draw(context, text, 0, 0)
    context.restore()
  }
  /**
   * …and a line of the plate: the BLACK OUTLINE first, then the letters
   * over it.
   *
   * **Every offset within the radius, not a ring of eight.** A ring alone
   * is right at one pixel and wrong at any more: the eight points become
   * eight spokes with the letter's own edge showing between them, and
   * play asked for a thicker outline rather than a spikier one
   * ("обводка имён слишком тонкая - надо больше"). At two that is
   * twenty-four passes a line, which is why it is built once and kept.
   *
   * The offsets are applied OUTSIDE the plate's own scale (see
   * `LAYOUT.plate.outline`), so the outline is the same weight in screen
   * pixels whatever `scale` is doing to the glyphs.
   */
  const letters = (font: Font, text: string, x: number, y: number): void => {
    const off = PLATE.outline
    if (off > 0 && dash.plateOutline) {
      for (const [dx, dy] of aroundBy(off)) run(dash.plateOutline, text, x + dx, y + dy)
    }
    run(font, text, x, y)
  }
  // Lay every block out FIRST, then unstack: two pigs shoulder to
  // shoulder put their plates on top of each other, and neither the exe
  // nor its notes say what the original does about it
  // (scanner/notes.md), so the remake's own answer is the plain one —
  // the later block climbs above the one it landed on.
  interface Block {
    x: number
    top: number
    left: number
    width: number
    height: number
    font: Font
    name: string
    nameWidth: number
    health: string
    healthWidth: number
    poisoned: boolean
  }
  const blocks: Block[] = []
  for (const plate of state.pigs) {
    const at = { x: plate.x / scale, y: plate.y / scale }
    if (at.y > canvas.height / scale) continue
    const health = String(plate.health)
    const nameWidth = base.measure(plate.name) * factor
    const healthWidth = heartSize.width + gap + base.measure(health) * factor
    const width = Math.max(nameWidth, healthWidth)
    const height = line * 2 + PLATE.gap
    blocks.push({
      x: at.x,
      // Two lines are drawn UPWARD from the anchor, so a pig near the top
      // of the view puts them off it. Slide the block down to the edge
      // rather than dropping it: a name that vanishes reads as a bug, and
      // did.
      top: Math.max(0, at.y - height),
      left: at.x - width / 2,
      width,
      height,
      font: teamFontFor(core, plate.colour) ?? base,
      name: plate.name,
      nameWidth,
      health,
      healthWidth,
      poisoned: plate.poisoned
    })
  }
  // Stacked so none sits on another — a bounded pass of its own
  // (ui/plateStack.ts), because this is a loop on a draw path.
  const placed = stackPlates(blocks, PLATE.gap)
  for (const block of placed) {
    letters(block.font, block.name, Math.round(block.x - block.nameWidth / 2), Math.round(block.top))
    const healthLeft = Math.round(block.x - block.healthWidth / 2)
    const healthTop = Math.round(block.top + line + PLATE.gap)
    // The BEAT: a swell about the heart's own centre. The line is laid
    // out on the resting size, so the letters beside it hold still.
    const swell = 1 + PULSE_DEPTH * Math.sin(dash.heartBeat)
    const beatWidth = heartSize.width * swell
    const beatHeight = heartSize.height * swell
    context.drawImage(
      // The poisoned pig's heart is the GREEN bake — same art, same
      // beat, only the tint says the gas has it.
      (block.poisoned && dash.sickHeart ? dash.sickHeart : heart).image,
      healthLeft + (heartSize.width - beatWidth) / 2,
      healthTop + Math.round((line - heartSize.height) / 2) + (heartSize.height - beatHeight) / 2,
      beatWidth,
      beatHeight
    )
    letters(block.font, block.health, healthLeft + heartSize.width + gap, healthTop)
  }
  context.restore()
}
