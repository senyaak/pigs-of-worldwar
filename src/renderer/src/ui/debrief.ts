// THE DEBRIEF — what a finished mission asks: take the result, or take the
// field again.
//
// The original's end-of-mission screen walks the five fielded slots and draws
// who is getting up (0x4848A2); its layout has never been read, so this is a
// stand-in on the bar machine (`[CHECK — remake]` for the look). The WORDS are
// the game's own, out of `gtext`: the title is 163 MISSION ACCOMPLISHED! or
// 164 MISSION FAILED! — the same pair the end-of-game card draws (0x45BC66) —
// and the rows are 181 CONTINUE and 193 RETRY.
//
// What the fork means is the campaign's business (`campaign.ts`): after a WIN,
// CONTINUE accepts the result and RETRY throws it away; after a LOSS there is
// no result to take — the manual's "you have to do the level all over again" —
// so CONTINUE just walks back to the squad.

import { byId } from './dom'
import { initBarScreen } from './barScreen'
import type { BarScreen } from './barScreen'

const ACCOMPLISHED_TEXT = 163
const FAILED_TEXT = 164
const CONTINUE_TEXT = 181
const RETRY_TEXT = 193

export type DebriefScreen = BarScreen & {
  /** Which way the mission went. Called before the screen is entered. */
  show(won: boolean): void
}

export function initDebrief(handlers: {
  onContinue: () => void
  onRetry: () => void
}): DebriefScreen {
  let strings: string[] = []
  let won = false

  const gameText = (index: number): string => strings[index] ?? ''

  const screen = initBarScreen({
    canvas: byId<HTMLCanvasElement>('debrief-screen'),
    title: () => gameText(won ? ACCOMPLISHED_TEXT : FAILED_TEXT),
    // No back key: the mission is over and the question will not be dodged.
    bars: [
      { label: () => gameText(CONTINUE_TEXT), enabled: () => true, choose: handlers.onContinue },
      { label: () => gameText(RETRY_TEXT), enabled: () => true, choose: handlers.onRetry }
    ]
  })

  return {
    ...screen,
    async load() {
      // The bar machine's own art and fonts, plus the BATTLE's strings — the
      // debrief titles itself with gtext, which no other frontend screen reads.
      const [text] = await Promise.all([window.api.loadGameText('gtext'), screen.load()])
      if (text.ok) strings = text.strings
      else console.warn(`debrief: gtext would not load (${text.error})`)
    },
    show(outcome) {
      won = outcome
    }
  }
}
