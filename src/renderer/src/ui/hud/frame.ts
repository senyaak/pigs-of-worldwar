// What every part of the dashboard is drawn with: the dashboard's own pieces
// (`HudCore`), and one frame's context, scale and narrowed art (`DashFrame`).

import type { BattleMap } from '../battleMap'
import type { BriefingBar } from '../briefingBar'
import type { Font } from '../font'
import type { HudState } from '../hud'
import type { PauseMenu } from '../pauseMenu'
import type { SkillMenu } from '../skillMenu'
import type { Sprite, SpriteSet } from '../sprites'
import type { DashState } from './dash'

export interface HudCore {
  canvas: HTMLCanvasElement
  bar: BriefingBar
  battleMap: BattleMap
  skills: SkillMenu
  pauseMenu: PauseMenu
  teamFonts: Map<string, Font>
  teamLoads: Set<string>
  wasHealth: Map<string, number>
  dash: DashState
}

/** One frame: drawn once the dashboard's art has loaded, so none of it is null. */
export interface DashFrame {
  context: CanvasRenderingContext2D
  /** Screen pixels per authored unit (`AUTHORED_HEIGHT`). */
  scale: number
  /** The view's width in authored units. */
  viewWidth: number
  /** Seconds since the last frame, zero under a pause. */
  delta: number
  state: HudState
  art: SpriteSet
  font: Font
  heart: Sprite
  /** A sprite at an authored position, scaled to the screen. */
  blit: (sprite: Sprite, x: number, y: number) => void
}
