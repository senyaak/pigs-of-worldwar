// PLAY TRAINING MISSION? — the original's record 39, the confirm the campaign
// asks before its first map.
//
// The words are the exe's own: fetext 141, and YES/NO right behind it at 142
// and 143 — one of the four confirm boxes (records 0, 24, 39, 43). The BOX
// itself is kind 12 and is fully decoded (`frontend/notes.md`: `yesno01..06`
// with the `yesdial` cursor sliding between the answers), and building that
// widget is its own piece of work — until then the question rides the bar
// machine like every other stand-in screen (`[CHECK — remake]` for the look;
// the words and the fork are the original's).

import { byId } from './dom'
import { feText, initBarScreen } from './barScreen'
import type { BarScreen } from './barScreen'

const QUESTION_TEXT = 141
const YES_TEXT = 142
const NO_TEXT = 143

export type AskTrainingScreen = BarScreen

export function initAskTraining(handlers: {
  /** Play the training ground. */
  onYes: () => void
  /** Skip it — the campaign steps past position 0 unrewarded. */
  onNo: () => void
  /** No answer at all: back to the squad. */
  onBack: () => void
}): AskTrainingScreen {
  return initBarScreen({
    canvas: byId<HTMLCanvasElement>('ask-screen'),
    title: () => feText(QUESTION_TEXT),
    onBack: handlers.onBack,
    bars: [
      { label: () => feText(YES_TEXT), enabled: () => true, choose: handlers.onYes },
      { label: () => feText(NO_TEXT), enabled: () => true, choose: handlers.onNo }
    ]
  })
}
