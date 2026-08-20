// The card the level opens with: the mission's name across the middle of the
// screen while the squad is still coming down.
//
// The exe builds it at 0x45BB11 — one player and level index 0 takes
// `gtext 159` "TRAINING MISSION: >S", anything else `gtext 158`
// "MISSION >2N : >S", and `>S` is filled from the campaign name list, which
// starts at `gtext 11`. It is drawn centred on the screen's own centre at
// y = 160, in the same font the rest of the battle's text uses — NOT through
// the briefing bar's queue, which is a different thing entirely
// (`tutorial/notes.md`).

import { missionNameIndex } from '../../../lib/game/missions'
import { isTrainingGround } from '../../../lib/game/tutorial'
import type { Font } from './font'

/** `gtext 159`, "TRAINING MISSION: >S". */
const TRAINING_TITLE = 159
/** `gtext 158`, "MISSION >2N : >S" — everything that is not the training ground. */
const MISSION_TITLE = 158

/** The card's baseline in the 640×480 units the screen is laid out in. */
export const CARD_Y = 160

/**
 * What the card says on `map`, or null for a map with nothing to say.
 *
 * Which display name goes with which MAP FILE is `lib/game/missions.ts` —
 * `gtext 11 + mapId` over the campaign's own 26 maps, which is where the
 * training ground's own BOOT CAMP had already been hard-coded from. A
 * skirmish arena is not in the campaign and gets no card rather than a guessed
 * one.
 *
 * `>2N` is the mission NUMBER, two digits — the position in the campaign, and
 * the training ground is not one, which is the other half of why the exe has
 * two formats.
 */
export function missionTitle(strings: string[], map: string, position = 0): string | null {
  const at = missionNameIndex(map)
  if (at < 0) return null
  const name = strings[at]
  const format = strings[isTrainingGround(map) ? TRAINING_TITLE : MISSION_TITLE]
  if (!format || !name) return null
  return format.replace('>S', name).replace('>2N', String(position).padStart(2, '0'))
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
