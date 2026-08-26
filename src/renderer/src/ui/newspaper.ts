// THE NEWSPAPER — the page a campaign win prints, after the debrief.
//
// Three loose BMPs out of `Language/Tims/Papers/` (0x45C700,
// `pigmap/notes.md` second pass): the OWN nation's front page stretched to
// the screen — masthead, layout and headlines all baked into the localized
// art — the STORY block colour-keyed at (23, 144) and the PHOTO at
// (309, 111). Which story and photo is `lib/game/newspaper.ts`; the page
// leaves on any key or after ten seconds, the exe's own two exits.

import { byId } from './dom'
import { SCREEN } from './barScreen'
import { controller } from '../input/controller'
import { trackRows } from './mouseRows'
import { MENU_BINDINGS } from '../input/actions'
import { loadLanguageSprites } from './sprites'
import type { Sprite } from './sprites'
import { FRONT_PAGES, PAPER_MS, paperFor } from '../../../lib/game/newspaper'
import { nationArt } from '../../../lib/game/pigmap'

const STORY_AT = { x: 23, y: 144 }
const PHOTO_AT = { x: 309, y: 111 }

export interface Newspaper {
  enter(): void
  leave(): void
  /** The win's numbers: whose paper, how many of the five came through,
   * what the mission paid, the stepped position, the map just won. */
  show(
    nation: number,
    survivors: number,
    points: number,
    newPosition: number,
    completedMapId: number
  ): void
  layout: Record<string, never>
}

export function initNewspaper(handlers: { onDone: () => void }): Newspaper {
  const canvas = byId<HTMLCanvasElement>('paper-screen')
  canvas.width = SCREEN.width
  canvas.height = SCREEN.height

  let visible = false
  let front: Sprite | null = null
  let story: Sprite | null = null
  let photo: Sprite | null = null
  let shown = 0
  let done = false

  const finish = (): void => {
    if (done) return
    done = true
    handlers.onDone()
  }

  controller.onAction(() => {
    if (!visible || done) return
    finish()
  })
  controller.bindKeyboard(() => visible, MENU_BINDINGS)
  // The mouse turns the page too: a click anywhere is the any-key. Play's
  // rule — a screen the pointer cannot drive reads as broken (CLAUDE.md,
  // ui/mouseRows.ts).
  trackRows(
    canvas,
    () =>
      visible && !done ? [{ x: 0, y: 0, width: SCREEN.width, height: SCREEN.height }] : [],
    (row) => {
      if (row === 0 && visible && !done) finish()
    }
  )

  const draw = (): void => {
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    if (front) context.drawImage(front.image, 0, 0, canvas.width, canvas.height)
    if (story) context.drawImage(story.image, STORY_AT.x, STORY_AT.y)
    if (photo) context.drawImage(photo.image, PHOTO_AT.x, PHOTO_AT.y)
  }

  let frame = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    if (!done && now - shown >= PAPER_MS) {
      finish()
      return
    }
    draw()
  }
  const run = (on: boolean): void => {
    if (on && frame === 0) frame = requestAnimationFrame(paint)
    if (!on && frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  return {
    enter() {
      visible = true
      run(true)
    },
    leave() {
      visible = false
      run(false)
    },
    show(nation, survivors, points, newPosition, completedMapId) {
      front = null
      story = null
      photo = null
      done = false
      shown = performance.now()
      const page = paperFor(survivors, points, newPosition, completedMapId)
      const frontName = FRONT_PAGES[nationArt(nation)] ?? FRONT_PAGES[0]
      const storyName = `text${page.story}`
      const photoName = `pic${String(page.photo).padStart(2, '0')}`
      loadLanguageSprites('Papers', [frontName, storyName, photoName], [storyName, photoName])
        .then((art) => {
          front = art.get(frontName)
          story = art.get(storyName)
          photo = art.get(photoName)
        })
        .catch((error) => {
          // No art is no page — carry on to the squad rather than stand on
          // a black screen for ten seconds.
          console.warn(String(error))
          finish()
        })
    },
    layout: {}
  }
}
