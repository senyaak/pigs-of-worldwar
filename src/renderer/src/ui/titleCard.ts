// The card the level opens with: the mission's name across the middle of the
// screen while the squad is still coming down.
//
// The exe builds it at 0x45BB11 — one player and level index 0 takes
// `gtext 159` "TRAINING MISSION: >S", anything else `gtext 158`
// "MISSION >2N : >S", and `>S` is filled from the campaign name list, which
// starts at `gtext 11`. It is drawn centred on the screen's own centre at
// y = 160, in the same font the rest of the battle's text uses — NOT through
// the briefing bar's queue, which is a different thing entirely
// (`../../../../pigs-disasm/tutorial/notes.md`).

import { isTrainingGround } from '../../../lib/game/tutorial'
import type { Font } from './font'

/** Where the campaign's 25 mission names start in `gtext`. */
const MISSION_NAMES = 11
/** `gtext 159`, "TRAINING MISSION: >S". */
const TRAINING_TITLE = 159
/** The 11th campaign name, BOOT CAMP — the training ground's own. */
const BOOT_CAMP = MISSION_NAMES + 10

/** The card's baseline in the 640×480 units the screen is laid out in. */
export const CARD_Y = 160

/**
 * What the card says on `map`, or null for a map with nothing to say.
 *
 * Only the training ground is answered. Which display name goes with which
 * MAP FILE is not stored anywhere in the game — the exe pairs them through a
 * level index nothing here has (`../../../../pigs-disasm/text/notes.md`) — so
 * every other map gets no card rather than a guessed one.
 */
export function missionTitle(strings: string[], map: string): string | null {
  if (!isTrainingGround(map)) return null
  const format = strings[TRAINING_TITLE]
  const name = strings[BOOT_CAMP]
  if (!format || !name) return null
  return format.replace('>S', name)
}

/** Draw it centred across a view `viewWidth` units wide. */
export function drawTitleCard(
  context: CanvasRenderingContext2D,
  font: Font,
  text: string,
  viewWidth: number
): void {
  font.draw(context, text, Math.round((viewWidth - font.measure(text)) / 2), CARD_Y)
}
