// The main menu — MAIN MENU over ONE PLAYER, MULTI-PLAYER, OPTIONS and QUIT
// APPLICATION, which is the screen the original opens on.
//
// It is four bars on the frontend's machine and nothing else: the backdrop,
// the cogs, the entrance and the flip all live in `barScreen.ts`, because
// MULTI-PLAYER is the same furniture. What is left here is the list.
//
// OPTIONS is the one screen still not built, and it is drawn in the font's
// own dark variant, the way the original greys out what cannot be chosen.

import { byId } from './dom'
import { feText, initBarScreen } from './barScreen'
import type { BarScreen } from './barScreen'

export { SCREEN } from './barScreen'

/** fetext indices: the title, then the four bars under it. Note the game
 * carries the four labels TWICE — 9..12 for the pad's own screen and 13..16
 * for this one, whose fourth is QUIT APPLICATION rather than CONTROLS. */
const TITLE_TEXT = 8
const ITEM_TEXT = [13, 14, 15, 16]

export type Menu = BarScreen

export function initMenu(handlers: {
  onNewGame: () => void
  onMultiPlayer: () => void
  onAssets: () => void
}): Menu {
  return initBarScreen({
    canvas: byId<HTMLCanvasElement>('menu-screen'),
    title: () => feText(TITLE_TEXT),
    onAssets: handlers.onAssets,
    // This screen's rows are staggered, and only this one: the two numbers
    // are read off its own draw arm (exe 0x41bf6c) and no other arm has been.
    stagger: true,
    // Screen 1 comes DOWN, from 650 of the frontend's own units above its
    // resting place — the exe's per-screen table at 0x4C0A18 (`entrance.ts`).
    entersFrom: -650,
    bars: [
      {
        label: () => feText(ITEM_TEXT[0]),
        enabled: () => true,
        choose: handlers.onNewGame
      },
      {
        label: () => feText(ITEM_TEXT[1]),
        enabled: () => true,
        choose: handlers.onMultiPlayer
      },
      {
        label: () => feText(ITEM_TEXT[2]),
        enabled: () => false
      },
      {
        label: () => feText(ITEM_TEXT[3]),
        enabled: () => true,
        choose: () => void window.api.quit()
      }
    ]
  })
}
