// PLAY TRAINING MISSION? — the original's record 39, the confirm the campaign
// asks before its first map.
//
// The words are the exe's own: fetext 141, and YES/NO right behind it at 142
// and 143 — one of the four confirm boxes (records 0, 24, 39, 43). **The fork
// is the exe's too** (0x42C37E, read 2026-08-17): NO moves the campaign to
// position 1 and LAUNCHES the mission there, the same way YES launches the
// training ground — it does not go back; only ESC returns to the squad, which
// is what `onBack` is. One `[deliberate]` divergence: ours lands on the squad
// after the skip rather than straight in the mission, and autosaves the step.
//
// The BOX itself — kind 12, sliding in from the upper right, turning itself
// over onto the `yes` picture, the `yesdial` cursor a six-tick slide — is now
// decoded to the last sound (`frontend/notes.md`), and building that widget is
// its own piece of work; until then the question rides the bar machine
// (`[CHECK — remake]` for the look alone).

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
