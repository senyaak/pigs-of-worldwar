// THE NEWSPAPER — which page a campaign win prints.
//
// The exe's 0x45C700 (`pigmap/notes.md`, second pass): the paper shows only
// on a CAMPAIGN WIN, after the debrief and before the victory films — never
// for the training ground, a loss, an abort or a retry. Three bitmaps out
// of `Language/Tims/Papers/`: the OWN nation's full front page (everything
// baked in), a STORY block keyed in at (23, 144), and a PHOTO at (309, 111).
//
// Which story and photo is the jump table at 0x45CB68 on how many of the
// FIVE fielded came through — with the wipeout split on the points the win
// still scored — the story rotated by the NEW position, and six special
// pages for six particular maps when the win was not flawless.

import { FIELDED } from './roster'

/** The front pages, in the exe's ART order (0x4CFA78) — index with
 * `nationArt` (lib/game/pigmap.ts). */
export const FRONT_PAGES = [
  'british',
  'american',
  'french',
  'german',
  'russian',
  'japan',
  'teamlard'
] as const

/** The six SPECIAL story pages: completed map id → text page (0x45CB94).
 * They fire only when fewer than five came through. */
const SPECIAL: Record<number, number> = { 2: 21, 7: 22, 16: 23, 19: 24, 23: 25, 24: 26 }

export interface PaperPage {
  /** The photo, 1..5 — `picNN.bmp`. */
  photo: number
  /** The story, 1..26 — `text<N>.bmp`. */
  story: number
}

/**
 * The page a win prints. `survivors` is of the five fielded, `points` what
 * THIS mission just paid, `newPosition` the campaign position AFTER the
 * step (the exe reads it stepped), `completedMapId` the map id of the
 * mission just won.
 */
export function paperFor(
  survivors: number,
  points: number,
  newPosition: number,
  completedMapId: number
): PaperPage {
  const alive = Math.max(0, Math.min(FIELDED, survivors))
  const [photo, base] =
    alive === 0 ? (points >= 2 ? [1, 1] : [2, 5]) : alive <= 2 ? [3, 9] : alive === 3 ? [4, 13] : [5, 17]
  const special = alive < FIELDED ? SPECIAL[completedMapId] : undefined
  return { photo, story: special ?? base + (newPosition % 4) }
}

/** How long the page stands before it turns itself — 10 000 ms, or any
 * key (0x45CB0E). */
export const PAPER_MS = 10000
