// The battle VIEW's core: the elements, the dashboard, the voice and the
// controls it was built with, and its state — handed whole to each part in
// this folder. `ui/battle.ts` builds it.

import type { Speech } from '../../audio/speech'
import type { BattleInput } from '../../input/battleInput'
import type { BattleExit } from '../battle'
import type { Hud } from '../hud'
import type { UiState } from './state'

export interface UiCore {
  canvasHost: HTMLDivElement
  hudCanvas: HTMLCanvasElement
  hud: Hud
  tileEl: HTMLSpanElement
  speech: Speech
  battleEl: HTMLDivElement
  input: BattleInput
  onLeave: (exit: BattleExit, fallen: number[], kills: number[], points: number[]) => void
  state: UiState
}
