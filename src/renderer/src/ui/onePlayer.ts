// ONE PLAYER — NEW GAME over LOAD GAME, the screen the main menu's first bar
// opens.
//
// **It is the same machine, and that is the exe's own answer, not a
// shortcut**: `frontend/menus.js` prints screen 14 as `kind 1`, the layout the
// main menu and OPTIONS wear, with the title at `fetext` 54 and two items at
// 55 and 56 — NEW GAME to screen 3 SELECT TEAM, LOAD GAME to screen 10 LOAD.
// So there is nothing here but the list; the furniture is `barScreen.ts`.
//
// **No entrance.** The per-screen table at 0x4C0A18 gives screen 14 a y of
// +100 against the main menu's -650, but the arm that serves this family
// (0x421BC3, kinds 1 and 7) does not replay the entrance when moving from one
// of its screens to another — so the machine stays where it is and only the
// plates turn over. `frontend/notes.md`.

import { byId } from './dom'
import { feText, initBarScreen } from './barScreen'
import type { BarScreen } from './barScreen'

/** fetext indices: the title, then the two bars under it — screen 14's own
 * consecutive block, which is the ordinary case the string chain gets right. */
const TITLE_TEXT = 54
const NEW_GAME_TEXT = 55
const LOAD_GAME_TEXT = 56

export type OnePlayerScreen = BarScreen

export function initOnePlayer(handlers: {
  /** NEW GAME. The original goes to SELECT TEAM; until that screen is built
   * this is what the main menu's own bar used to do. */
  onNewGame: () => void
  /** Back to the main menu. */
  onBack: () => void
}): OnePlayerScreen {
  return initBarScreen({
    canvas: byId<HTMLCanvasElement>('op-screen'),
    title: () => feText(TITLE_TEXT),
    onBack: handlers.onBack,
    bars: [
      {
        label: () => feText(NEW_GAME_TEXT),
        enabled: () => true,
        choose: handlers.onNewGame
      },
      {
        // Dark until there is a LOAD screen to open. The save itself exists
        // (lib/game/save.ts) and the slot list is `src/main/saves.ts` away;
        // what is missing is screen 10's layout, which is kind 8 and has not
        // been read at all.
        label: () => feText(LOAD_GAME_TEXT),
        enabled: () => false
      }
    ]
  })
}
