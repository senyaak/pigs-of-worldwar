// THE DEBRIEF — the end-of-mission page, and it is the ORIGINAL's now: not a
// frontend record but the battle's own 640×480 screen (0x4845E0), drawn from
// the loose BMPs in `Language/Tims/debrief/` with gtext's words
// (`debrief/notes.md` in the disasm repo, read 2026-08-17).
//
// The five fielded slots each carry a FACE — the pig's own of the nine, its
// WOUNDED twin if it went down but gets up, `r_i_p` if it is gone for good —
// with the team's uniform laid over the living, the name under, and the class
// badge(s) under that. The right column is MISSION RESULTS over the verdict:
// LEVEL COMPLETE with its token, SURVIVAL BONUS with a token or the word
// NONE, SPECIAL BONUS with the level's own tokens greyed where unearned — or,
// lost, the single line MISSION FAILED! over the `pigbkpc2` backdrop, which
// is the whole failure screen.
//
// What is OURS: the exe pays with SPACE and offers no menu — a loss simply
// sets the same level up again — while ours asks CONTINUE or RETRY in
// gtext's own words (181/193), because a player unhappy with a WIN may take
// the field again too (`[play]`, `campaign.ts` holds the un-written result).
// The spinning `propoint.mad` token is stood in by the frontend's `vp` coin
// until the model pipeline reaches this screen (`[CHECK — remake]`), and the
// two fonts are BIG and GameChars where the exe builds its own gtext pair
// (0x480D10, unread which files — `[CHECK — remake]`).

import { SCREEN } from './barScreen'
import { byId } from './dom'
import { loadFont } from './font'
import type { Font } from './font'
import { controller } from '../input/controller'
import { MENU_BINDINGS } from '../input/actions'
import { loadDebriefSprites, loadSprites } from './sprites'
import type { SpriteSet } from './sprites'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { RETURNING, SQUAD_SIZE, standingCount } from '../../../lib/game/roster'
import type { Pig } from '../../../lib/game/roster'
import type { SaveGame } from '../../../lib/game/save'
import { survivalBonus } from '../../../lib/game/save'
import { bonusPoints, fieldedAt } from '../../../lib/game/missions'
import { careerOf, stepOf } from '../../../lib/game/ranks'

/** gtext: the page's own words — the same ids the exe prints (0x484B90 on). */
const RESULTS_TEXT = 187
const FAILED_TEXT = 188
const COMPLETE_TEXT = 190
const SURVIVAL_TEXT = 191
const SPECIAL_TEXT = 192
const NONE_TEXT = 96
const CONTINUE_TEXT = 181
const RETRY_TEXT = 193

/** The faces: `Facepc1..9` by identity, `facepcw1..9` wounded, `r_i_p` gone. */
const FACES = Array.from({ length: 9 }, (_, i) => `Facepc${i + 1}`)
const WOUNDED = Array.from({ length: 9 }, (_, i) => `facepcw${i + 1}`)
const RIP = 'r_i_p'

/** The class badges, by career, and the two pips a step wears. */
const BADGE: Record<string, string> = {
  heavy: 'pcHeavy',
  espionage: 'pcSniper',
  engineer: 'pcEngine',
  medic: 'pcMedic',
  commando: 'pcCmmndo',
  hero: 'pcLegend'
}
const PIPS = ['pcPip1', 'pcPip2']

/** The uniforms in FILE order, and the exe's nation → file map (0x4508F6). */
const UNIFORMS = ['unifeng', 'unifusa', 'uniffren', 'unifgerm', 'unifruss', 'unifjap', 'uniflard']
const UNIFORM_OF = [0, 2, 1, 4, 5, 3, 6]

const DEBRIEF_ART = [
  'Pigbkpc1', 'Pigbkpc2',
  ...FACES, ...WOUNDED, RIP,
  ...Object.values(BADGE), ...PIPS,
  ...UNIFORMS
]

/** The token — `chars\propoint.mad` spinning in the exe, the `vp` coin here. */
const TOKEN = 'vp'

/**
 * Where everything lands — the exe's own numbers (0x4849A7..0x484D1A): five
 * rows with the portrait pitch 74 and the name pitch 73, which really do
 * differ by one; the right column centred on x 456. Only `token` and the two
 * ACTION rows are ours (`[CHECK — remake]`): the exe draws its tokens as a
 * 3D model in world coordinates and offers no actions at all.
 */
const LAYOUT = {
  team: { x: 320, y: 5 },
  rows: {
    face: { x: 82, top: 65, pitch: 74, lift: 12 },
    uniform: { x: 86, drop: 8 },
    rip: { x: 94, drop: 12 },
    name: { x: 215, top: 90, pitch: 73 },
    badge: { x: 215, drop: 24 }
  },
  column: {
    x: 456,
    results: 84,
    complete: 140,
    failed: 226,
    survival: 225,
    none: 260,
    special: 305,
    specialRow: { y: 330, step: 26 }
  },
  token: { beside: 60, lift: 2 },
  actions: { x: 456, continueY: 395, retryY: 430 }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type DebriefLayout = typeof LAYOUT

const cloneLayout = (): DebriefLayout => ({
  team: { ...LAYOUT.team },
  rows: {
    face: { ...LAYOUT.rows.face },
    uniform: { ...LAYOUT.rows.uniform },
    rip: { ...LAYOUT.rows.rip },
    name: { ...LAYOUT.rows.name },
    badge: { ...LAYOUT.rows.badge }
  },
  column: { ...LAYOUT.column, specialRow: { ...LAYOUT.column.specialRow } },
  token: { ...LAYOUT.token },
  actions: { ...LAYOUT.actions }
})

/** A fielded slot's fate — the exe's three states (0x48486F/0x4848CF). */
type Fate = 'stood' | 'returns' | 'gone'

/**
 * The five states, the exe's own arithmetic: on a WIN a downed pig gets up
 * unless more than RETURNING fell and it fell early (`fell < fallen − 2`, the
 * complement of 0x4509F1); on a LOSS every occupied slot is simply down.
 */
function fates(squad: Pig[], won: boolean): Fate[] {
  const fallen = SQUAD_SIZE - standingCount(squad)
  return squad.slice(0, 5).map((pig) => {
    if (!won) return 'returns'
    if (pig.fell < 0) return 'stood'
    if (fallen > RETURNING && pig.fell < fallen - RETURNING) return 'gone'
    return 'returns'
  })
}

export interface DebriefScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  /** The mission's outcome and the save AS THE MISSION FOUND IT — position
   * still on the played mission, the squad carrying its `fell` marks. */
  show(won: boolean, save: SaveGame): void
  layout: DebriefLayout
}

export function initDebrief(handlers: {
  onContinue: () => void
  onRetry: () => void
}): DebriefScreen {
  const canvas = byId<HTMLCanvasElement>('debrief-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let art: SpriteSet | null = null
  let coin: SpriteSet | null = null
  let big: Font | null = null
  let small: Font | null = null
  let strings: string[] = []
  let loaded = false
  let visible = false

  let won = false
  let save: SaveGame | null = null
  let selection = 0

  const gameText = (index: number): string => strings[index] ?? ''

  const toggle = (): void => {
    selection = selection === 0 ? 1 : 0
  }
  const choose = (): void => {
    if (selection === 0) handlers.onContinue()
    else handlers.onRetry()
  }

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp' || action === 'menuDown') toggle()
    else if (action === 'menuSelect') choose()
    // No back key: the mission is over and the question will not be dodged.
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)

  const centredAt = (font: Font, text: string, centre: number): number =>
    Math.round(centre - font.measure(text) / 2)

  const write = (
    context: CanvasRenderingContext2D,
    font: Font,
    text: string,
    centre: number,
    y: number
  ): void => font.draw(context, text, centredAt(font, text, centre), y)

  const token = (context: CanvasRenderingContext2D, x: number, y: number, greyed: boolean): void => {
    if (!coin) return
    const sprite = coin.get(TOKEN)
    if (greyed) context.globalAlpha = 0.35
    context.drawImage(sprite.image, x, y)
    context.globalAlpha = 1
  }

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !big || !small || !save) return
    const sprites = art
    const bigFont = big
    const smallFont = small

    // The backdrop says the verdict before a word does (0x484819).
    context.drawImage(sprites.get(won ? 'Pigbkpc1' : 'Pigbkpc2').image, 0, 0)
    write(context, big, save.name, layout.team.x, layout.team.y)

    // The five fielded slots. Slots past the position's own count wear the
    // plain portrait, the exe's own cap (0x4849C5).
    const fielded = fieldedAt(save.position)
    const states = fates(save.squad, won)
    const uniform = sprites.get(UNIFORMS[UNIFORM_OF[save.nation] ?? 0])
    save.squad.slice(0, 5).forEach((pig, i) => {
      const state = i < fielded ? states[i] : 'stood'
      const faceTop = layout.rows.face.top + layout.rows.face.pitch * i
      const nameTop = layout.rows.name.top + layout.rows.name.pitch * i
      const face = pig.identity % 9
      if (state === 'gone') {
        context.drawImage(
          sprites.get(RIP).image,
          layout.rows.rip.x,
          faceTop - layout.rows.face.lift + layout.rows.rip.drop
        )
      } else {
        const picture = state === 'stood' ? FACES[face] : WOUNDED[face]
        context.drawImage(
          sprites.get(picture).image,
          layout.rows.face.x,
          faceTop - layout.rows.face.lift
        )
        context.drawImage(
          uniform.image,
          layout.rows.uniform.x,
          faceTop - layout.rows.face.lift + layout.rows.uniform.drop
        )
      }
      write(context, smallFont, pig.name, layout.rows.name.x, nameTop)

      // The badge, or the badge-and-pip pair straddling the same centre
      // (0x484A81/0x484AF7). A GRUNT wears none.
      if (pig.rank !== 0) {
        const badge = sprites.get(BADGE[careerOf(pig.rank)] ?? 'pcHeavy')
        const badgeY = nameTop + layout.rows.badge.drop
        const step = stepOf(pig.rank)
        if (step > 0) {
          const pip = sprites.get(PIPS[step - 1] ?? PIPS[0])
          context.drawImage(
            badge.image,
            Math.round(layout.rows.badge.x - (3 * badge.width) / 4),
            badgeY
          )
          context.drawImage(pip.image, Math.round(layout.rows.badge.x - pip.width / 4), badgeY)
        } else {
          context.drawImage(badge.image, Math.round(layout.rows.badge.x - badge.width / 2), badgeY)
        }
      }
    })

    // The right column (0x484B90..0x484D1A).
    const centre = layout.column.x
    write(context, big, gameText(RESULTS_TEXT), centre, layout.column.results)
    if (!won) {
      // MISSION FAILED! — and that is the whole failure column.
      write(context, big, gameText(FAILED_TEXT), centre, layout.column.failed)
    } else {
      const losses = SQUAD_SIZE - standingCount(save.squad)
      write(context, small, gameText(COMPLETE_TEXT), centre, layout.column.complete)
      token(context, centre + layout.token.beside, layout.column.complete - layout.token.lift, false)
      write(context, small, gameText(SURVIVAL_TEXT), centre, layout.column.survival)
      if (survivalBonus(save.position, losses)) {
        token(context, centre + layout.token.beside, layout.column.survival - layout.token.lift, false)
      } else {
        write(context, small, gameText(NONE_TEXT), centre, layout.column.none)
      }
      // SPECIAL BONUS: the level's own tokens, the unearned greyed — and
      // nothing earns one yet, the PROPOINT pickup being a gap.
      const available = bonusPoints(save.position)
      if (available > 0) {
        write(context, small, gameText(SPECIAL_TEXT), centre, layout.column.special)
        const width = layout.column.specialRow.step * available
        for (let i = 0; i < available; i++) {
          token(
            context,
            Math.round(centre - width / 2 + layout.column.specialRow.step * i),
            layout.column.specialRow.y,
            true
          )
        }
      }
    }

    // OUR fork: CONTINUE over RETRY, the selected one in the big letters.
    const rows: [string, number][] = [
      [gameText(CONTINUE_TEXT), layout.actions.continueY],
      [gameText(RETRY_TEXT), layout.actions.retryY]
    ]
    rows.forEach(([label, rowY], i) => {
      write(context, selection === i ? bigFont : smallFont, label, layout.actions.x, rowY)
    })
  }

  let frame = 0
  let ticked = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    const due = Math.floor((now - ticked) / TICK_MS)
    if (due <= 0) return
    ticked += Math.min(due, MOST_TICKS) * TICK_MS
    draw()
  }
  const run = (on: boolean): void => {
    if (on && loaded && frame === 0) {
      ticked = performance.now()
      frame = requestAnimationFrame(paint)
    }
    if (!on && frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  return {
    async load() {
      if (loaded) return
      try {
        const [sprites, coinSet, bigFont, smallFont, text] = await Promise.all([
          loadDebriefSprites(DEBRIEF_ART),
          loadSprites([TOKEN]),
          loadFont('BIG'),
          loadFont('GameChars'),
          window.api.loadGameText('gtext')
        ])
        art = sprites
        coin = coinSet
        big = bigFont
        small = smallFont
        if (text.ok) strings = text.strings
        else console.warn(`debrief: gtext would not load (${text.error})`)
      } catch (error) {
        console.warn(String(error))
        return
      }
      loaded = true
      run(visible)
    },
    leave() {
      visible = false
      run(false)
    },
    enter() {
      visible = true
      selection = 0
      draw()
      run(true)
    },
    show(outcome, state) {
      won = outcome
      save = state
    },
    selected: () => selection,
    labels: () => [gameText(CONTINUE_TEXT), gameText(RETRY_TEXT)],
    values: () => [null, null],
    flipping: () => false,
    layout
  }
}
