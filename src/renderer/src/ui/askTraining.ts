// PLAY TRAINING MISSION? — record 39, and it is the REAL kind-12 confirm box
// now, every number and every sound the exe's own (`frontend/notes.md`, the
// 2026-08-17 behaviour pass).
//
// The box slides in from the UPPER RIGHT on two springs of its own — the
// horizontal from 1224, the vertical from −150 — while the family's usual
// entrance is slaved to zero and never used. As it arrives the `yesno` box
// TURNS ITSELF OVER, frame 0 to 6 one a tick, and lands on the `yes` picture
// with `Indu008`; the `name` band walks its short plate out, 3 → 0; the
// `info` panel stays SHUT at `info1`, which is the one thing kind 12 does
// differently from its family. Only once the box has landed is the cursor
// drawn at all, and only then do the WORDS appear — the fade `[0x512EA0]` is
// a hide flag counted down 10 a tick, and letters exist below 60.
//
// The dial is a six-tick SLIDE whose middle frames are 16 px narrower, so the
// window stands still and the motion lives inside the art: frame 0 is YES,
// frame 6 is NO, and the only sound a move makes is the dial's own arrival
// click. The box always opens on YES. It leaves the way it came — words
// hidden first, the band back to its short plate, the dial parked in the
// middle, the box turning back over — and the pieces launch out up and to
// the right.
//
// **The FORK is the exe's too** (0x42C37E): NO moves the campaign to
// position 1 and launches, the same as YES launches position 0 — it does not
// go back. Only ESC returns to the squad, which is `onBack`. Two deliberate
// divergences, each small: ours lands on the squad after the skip rather
// than straight in the mission (and autosaves — the original has no
// autosave), and up/down toggle the answer the way left/right do, where the
// exe's up/down arms are empty — every menu here answers the keyboard.

import { loadFrontend, SCREEN, feText } from './barScreen'
import { byId } from './dom'
import type { Font } from './font'
import { spring, launch, still } from './springs'
import type { Motion } from './springs'
import { widget } from './frames'
import type { Widget } from './frames'
import { controller } from '../input/controller'
import { trackRows } from './mouseRows'
import { MENU_BINDINGS } from '../input/actions'
import { loadSprites } from './sprites'
import type { SpriteSet } from './sprites'
import { SILENT } from '../audio/bank'
import type { Bank } from '../audio/bank'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'

/** fetext: the question and its two answers, record 39's own block. */
const QUESTION_TEXT = 141
const YES_TEXT = 142
const NO_TEXT = 143

/** The `yesno` box's frames: six of the turn-over, then the settled `yes`. */
const BOX_FRAMES = ['yesno01', 'yesno02', 'yesno03', 'yesno04', 'yesno05', 'yesno06', 'yes']
const BOX_LANDED = 6
/** The dial's seven, YES at 0 and NO at 6 (0x41C935). */
const DIAL_FRAMES = [1, 2, 3, 4, 5, 6, 7].map((i) => `yesdial${i}`)
/** The band's plates, `(frame + 60) % 6` picking out of `name0..5`. */
const BAND_FRAMES = ['name0', 'name1', 'name2', 'name3', 'name4', 'name5']
/** The band enters ON the short plate and walks to the long one (0x41B9D9). */
const BAND_SHORT = 3

const ART = [
  'pigbkpc1',
  'namarm1', 'namarm2',
  ...BAND_FRAMES,
  'info1',
  'mainbar0', 'mainbar1',
  ...BOX_FRAMES,
  ...DIAL_FRAMES
]

/** The box lands with `Indu008` at 50 (0x41F55F); the dial arrives with
 * `click1` at 60 (0x41F515). Nothing else on the screen makes a sound. */
const BOX_LANDS = { name: 'INDU008', gain: 0.5 }
const DIAL_LANDS = { name: 'CLICK1', gain: 0.6 }

/**
 * THE MOTION — the enter arm's seeds and the update's two springs
 * (0x41B75B/0x41B7C1, 0x4247C6/0x42477E), the leave arm's two launchers
 * (0x425B2C). The horizontal is in the frontend's 1024-wide units and folds
 * through `scaleX`; the vertical through `2·scaleY`.
 */
const START = { x: 1224, y: -150 }
const X_SPRING = { gain: 10, damping: 40, cap: 20 }
const Y_SPRING = { gain: 3, damping: 30, cap: 6 }
const X_LEAVE = { accel: 15, cap: 60 }
const Y_LEAVE = { accel: 2, cap: 40 }

/** The WORDS' hide flag: 100 hidden, counted down 10 a tick once the box has
 * landed, letters drawn below 60 (0x42473E, 0x4318AB); the leave arm winds it
 * back up 30 a tick before anything else may move (0x425A50). */
const FADE_HIDDEN = 100
const FADE_SHOWS = 60
const FADE_IN = 10
const FADE_OUT = 30

/** The exe's scalers: x through 640/1024, y through 480/820 and doubled. */
const scaleX = (v: number): number => Math.trunc((v * 640) / 1024)
const scaleY = (v: number): number => Math.trunc((v * 480) / 820)

/**
 * Where each piece lands, folded at rest — every number the arm's own
 * (0x41C492 with its +7, the three-piece stretches at their seams). `bar1`'s
 * SEAM alone is `[CHECK — remake]`: the notes give "a 2-px band repeated 37
 * down" and not which rows, so the middle is guessed.
 */
const LAYOUT = {
  /** `namarm1`/`namarm2`, riding the VERTICAL spring. */
  arm: { left: 55, right: 460, y: 0 },
  /** The band the title sits on: cap, a 2-px column ×25, tail — and the short
   * `name3` plate drops 16 (0x41C512). */
  band: { x: 98, seam: 200, repeat: 298, tail: 348, y: 16, shortDrop: 16 },
  /** `info1`, held shut, the same stretch at its own seam. */
  info: { x: 325, seam: 170, repeat: 495, tail: 545, y: 98 },
  /** The box: 256-wide frames at `x`, the 208-wide `yes` at `landed`. */
  box: { x: 237, landed: 269, y: 345 },
  /** The dial: 64-wide ends at `x`, everything past frame 1 at `slid`. */
  dial: { x: 349, slid: 365, y: 393 },
  /** `mainbar0` three times and `mainbar1` with its repeated band. */
  bars: { x: 269, second: 316, y: 130, lower: 290, right: 615, rightY: 72, seam: 48 },
  /** The words, in kind 12's own boxes. */
  text: {
    title: { x: 161, y: 45, width: 300 },
    items: { x: [350, 418], y: 385, width: 56 }
  }
}

const TICK_MS = EXE_FRAME_SECONDS * 1000
const MOST_TICKS = 4

export type AskTrainingLayout = typeof LAYOUT

const cloneLayout = (): AskTrainingLayout => ({
  arm: { ...LAYOUT.arm },
  band: { ...LAYOUT.band },
  info: { ...LAYOUT.info },
  box: { ...LAYOUT.box },
  dial: { ...LAYOUT.dial },
  bars: { ...LAYOUT.bars },
  text: {
    title: { ...LAYOUT.text.title },
    items: { ...LAYOUT.text.items, x: [...LAYOUT.text.items.x] }
  }
})

export interface AskTrainingScreen {
  load(): Promise<void>
  leave(): void
  enter(): void
  selected(): number
  labels(): string[]
  values(): (string | null)[]
  flipping(): boolean
  layout: AskTrainingLayout
}

export function initAskTraining(handlers: {
  /** Play the training ground. */
  onYes: () => void
  /** Skip it — the campaign steps past position 0 unrewarded (0x42C37E). */
  onNo: () => void
  /** ESC — the one way back to the squad. */
  onBack: () => void
}): AskTrainingScreen {
  const canvas = byId<HTMLCanvasElement>('ask-screen')
  const layout = cloneLayout()
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let bank: Bank = SILENT
  let art: SpriteSet | null = null
  let lit: Font | null = null
  let plain: Font | null = null
  let loaded = false
  let visible = false

  const x: Motion = still(START.x)
  const y: Motion = still(START.y)
  let fade = FADE_HIDDEN
  /** 0 YES, 1 NO — and it always opens on YES (0x42DD97). */
  let selection = 0
  let phase: 'arriving' | 'here' | 'leaving' = 'arriving'
  let leavingTo: (() => void) | null = null

  const box: Widget = widget(0)
  const dial: Widget = widget(0)
  const band: Widget = widget(BAND_SHORT)

  const toggle = (): void => {
    if (phase === 'leaving') return
    selection = selection === 0 ? 1 : 0
    // The move itself is silent — the click is the dial ARRIVING.
    dial.goTo(selection * BOX_LANDED)
  }

  const choose = (): void => {
    if (phase !== 'here' || box.frame() !== BOX_LANDED) return
    leavingTo = selection === 0 ? handlers.onYes : handlers.onNo
    phase = 'leaving'
  }

  const goBack = (): void => {
    if (phase === 'leaving') return
    leavingTo = handlers.onBack
    phase = 'leaving'
  }

  controller.onAction((action) => {
    if (!visible) return
    if (action === 'menuUp' || action === 'menuDown') toggle()
    else if (action === 'menuLeft' || action === 'menuRight') toggle()
    else if (action === 'menuSelect') choose()
    else if (action === 'menuBack') goBack()
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)
  // The mouse works the box too (play's rule — ui/mouseRows.ts): hovering
  // an answer walks the dial onto it, one tick at a time like the keys do,
  // and a click on the lit one chooses. The boxes exist only once the box
  // has landed and the words are up, and they ride the entrance's own xOff.
  const mouse = trackRows(
    canvas,
    () =>
      visible && phase === 'here' && fade < FADE_SHOWS
        ? layout.text.items.x.map((left) => ({
            x: left + scaleX(x.value),
            y: layout.text.items.y - 4,
            width: layout.text.items.width,
            height: 24
          }))
        : [],
    (row) => {
      if (row < 0 || phase !== 'here') return
      if (row === selection) choose()
      else toggle()
    }
  )

  /** One frontend tick — springs, walks, the fade, and the leave's gates. */
  const advance = (): void => {
    if (phase === 'leaving') {
      // The words hide FIRST and nothing else moves until they have
      // (0x425A50); then the furniture parks — the band on its short plate,
      // the dial in the middle, the box turned back over — and the pieces
      // launch out the way they came in.
      if (fade < FADE_HIDDEN) {
        fade = Math.min(FADE_HIDDEN, fade + FADE_OUT)
        return
      }
      band.goTo(BAND_SHORT)
      dial.goTo(3)
      box.goTo(0)
      band.tick()
      dial.tick()
      box.tick()
      const xDone = launch(x, START.x, X_LEAVE)
      launch(y, START.y, Y_LEAVE)
      if (xDone && leavingTo) {
        const go = leavingTo
        leavingTo = null
        queueMicrotask(go)
      }
      return
    }

    const xHome = spring(x, 0, X_SPRING)
    const yHome = spring(y, 0, Y_SPRING)

    // The update arm asks every tick and the walk refuses while busy — which
    // is exactly `goTo` on an already-walking widget being re-aimed at the
    // same place (0x42469D, 0x4246E0).
    if (!box.walking() && box.frame() !== BOX_LANDED) box.goTo(BOX_LANDED)
    if (!band.walking() && band.frame() !== 0) band.goTo(0)
    if (box.tick() && box.frame() === BOX_LANDED) bank.play(BOX_LANDS.name, { gain: BOX_LANDS.gain })
    if (dial.tick() && !dial.walking()) bank.play(DIAL_LANDS.name, { gain: DIAL_LANDS.gain })
    band.tick()

    // The words: pinned hidden while anything is still moving, then counted
    // down; `phase` follows the box, which is the screen's own gate.
    if (phase === 'arriving' && box.frame() === BOX_LANDED && xHome && yHome) {
      phase = 'here'
      fade = Math.max(0, fade - FADE_IN)
    } else {
      fade = FADE_HIDDEN
    }
    // The pointer's half of the dial: walk the selection toward the hovered
    // answer, one toggle a tick, exactly as the keys move it.
    if (phase === 'here') {
      const over = mouse.hovered()
      if (over >= 0 && over !== selection) toggle()
      else if (over === selection) mouse.clear()
    }
  }

  /** A three-piece stretch: a cap, a 2-px column ×25, and the tail — the
   * frontend's own +50 widening. */
  const stretch = (
    context: CanvasRenderingContext2D,
    sprite: { image: CanvasImageSource; width: number; height: number },
    at: { x: number; seam: number; repeat: number; tail: number },
    xOff: number,
    yTop: number
  ): void => {
    const image = sprite.image
    const h = sprite.height
    context.drawImage(image, 0, 0, at.seam, h, at.x + xOff, yTop, at.seam, h)
    for (let i = 0; i < 25; i++) {
      context.drawImage(image, at.seam, 0, 2, h, at.repeat + xOff + i * 2, yTop, 2, h)
    }
    const rest = sprite.width - at.seam
    context.drawImage(image, at.seam, 0, rest, h, at.tail + xOff, yTop, rest, h)
  }

  const centred = (font: Font, text: string, left: number, width: number): number =>
    Math.round(left + (width - font.measure(text)) / 2)

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context || !art || !lit || !plain) return
    const sprites = art
    const xOff = scaleX(x.value)
    const yOff = 2 * scaleY(y.value)
    context.drawImage(sprites.get('pigbkpc1').image, 0, 0)

    // The exe's own order: arms, band, info, dial, box, bars (0x41C492).
    context.drawImage(sprites.get('namarm1').image, layout.arm.left, layout.arm.y + yOff)
    context.drawImage(sprites.get('namarm2').image, layout.arm.right, layout.arm.y + yOff)

    const bandFrame = ((band.frame() % 6) + 6) % 6
    const bandY = layout.band.y + (bandFrame === BAND_SHORT ? layout.band.shortDrop : 0) + yOff
    stretch(context, sprites.get(BAND_FRAMES[bandFrame]), layout.band, 0, bandY)

    stretch(context, sprites.get('info1'), layout.info, xOff, layout.info.y)

    // The dial exists only once the box has landed (0x41c942); its window
    // stands still — the 48-wide middle frames carry their own +16.
    if (box.frame() === BOX_LANDED) {
      const dialAt = dial.frame() > 1 ? layout.dial.slid : layout.dial.x
      context.drawImage(
        sprites.get(DIAL_FRAMES[dial.frame()]).image,
        dialAt + xOff,
        layout.dial.y
      )
    }

    const boxX = box.frame() === BOX_LANDED ? layout.box.landed : layout.box.x
    context.drawImage(sprites.get(BOX_FRAMES[box.frame()]).image, boxX + xOff, layout.box.y)

    const bar0 = sprites.get('mainbar0')
    context.drawImage(bar0.image, layout.bars.x + xOff, layout.bars.y)
    context.drawImage(bar0.image, layout.bars.second + xOff, layout.bars.y)
    context.drawImage(bar0.image, layout.bars.x + xOff, layout.bars.lower)
    const bar1 = sprites.get('mainbar1')
    const seam = layout.bars.seam
    context.drawImage(bar1.image, 0, 0, bar1.width, seam, layout.bars.right + xOff, layout.bars.rightY, bar1.width, seam)
    for (let i = 0; i < 37; i++) {
      context.drawImage(
        bar1.image, 0, seam, bar1.width, 2,
        layout.bars.right + xOff, layout.bars.rightY + seam + i * 2, bar1.width, 2
      )
    }
    context.drawImage(
      bar1.image, 0, seam, bar1.width, bar1.height - seam,
      layout.bars.right + xOff, layout.bars.rightY + seam + 74, bar1.width, bar1.height - seam
    )

    // The WORDS, gated by the fade — a hide flag, not an alpha (0x4318AB).
    if (fade < FADE_SHOWS) {
      const title = feText(QUESTION_TEXT)
      lit.draw(
        context,
        title,
        centred(lit, title, layout.text.title.x + xOff, layout.text.title.width),
        layout.text.title.y
      )
      const answers = [feText(YES_TEXT), feText(NO_TEXT)]
      answers.forEach((answer, i) => {
        const font = selection === i ? lit : plain
        if (!font) return
        font.draw(
          context,
          answer,
          centred(font, answer, layout.text.items.x[i] + xOff, layout.text.items.width),
          layout.text.items.y
        )
      })
    }
  }

  let frame = 0
  let ticked = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    let due = Math.floor((now - ticked) / TICK_MS)
    if (due <= 0) return
    ticked += due * TICK_MS
    if (due > MOST_TICKS) due = MOST_TICKS
    for (let i = 0; i < due; i++) advance()
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
        const [shared, sprites] = await Promise.all([loadFrontend(), loadSprites(ART)])
        bank = shared.bank
        lit = shared.lit
        plain = shared.plain
        art = sprites
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
      x.value = START.x
      x.velocity = 0
      y.value = START.y
      y.velocity = 0
      fade = FADE_HIDDEN
      selection = 0
      phase = 'arriving'
      leavingTo = null
      box.set(0)
      dial.set(0)
      band.set(BAND_SHORT)
      draw()
      run(true)
    },
    selected: () => selection,
    labels: () => [feText(YES_TEXT), feText(NO_TEXT)],
    values: () => [null, null],
    flipping: () => phase !== 'here',
    layout
  }
}
