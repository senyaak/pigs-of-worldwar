// LOAD GAME — record 10, the screen ONE PLAYER's second bar opens.
//
// **The machine is a stand-in.** The original's screen is kinds 8/9 — "their
// items are SAVE SLOTS named at runtime", which is why the fetext cursor
// strides by two through them — and its draw arm (0x41DF4A) has never been
// read, so nothing is known of its layout. Until it is, the list rides the
// same bar machine as every other menu (`[CHECK — remake]` for the look, not
// the list). What IS the original's: the slots are `savearmy0..7`, eight of
// them (0x42C3E7), and the load menu refuses a nation above six — ours
// refuses anything `parse` refuses, which covers that and the rest.
//
// The eight bars are built once and READ live: a bar names itself off
// whatever `enter()` last listed, so the screen never rebuilds — empty slots
// are simply dark.

import { byId } from './dom'
import { feText, initBarScreen } from './barScreen'
import type { BarScreen } from './barScreen'
import { SLOTS, listCampaigns } from '../campaign'
import type { SaveGame } from '../../../lib/game/save'
import { CAMPAIGN_LENGTH } from '../../../lib/game/missions'

/** ONE PLAYER's own word for the screen — record 10's title is not read, and
 * the bar that leads here already wears it. */
const TITLE_TEXT = 56

export type LoadScreen = BarScreen & {
  /** Re-read the slots from disk; `enter()` does it on the way in. */
  refresh(): Promise<void>
}

export function initLoadScreen(handlers: {
  /** A slot was chosen — the caller adopts it as the campaign. */
  onLoaded: (entry: { slot: string; save: SaveGame }) => void
  onBack: () => void
}): LoadScreen {
  let entries: ({ slot: string; save: SaveGame } | null)[] = SLOTS.map(() => null)

  const refresh = async (): Promise<void> => {
    const listed = await listCampaigns()
    entries = SLOTS.map((slot) => listed.find((entry) => entry.slot === slot) ?? null)
  }

  const screen = initBarScreen({
    canvas: byId<HTMLCanvasElement>('load-screen'),
    title: () => feText(TITLE_TEXT),
    onBack: handlers.onBack,
    bars: SLOTS.map((_, i) => ({
      label: () => entries[i]?.save.name ?? '',
      /** The right-hand side carries the campaign's progress, the way a
       * settings bar carries its setting. */
      value: () => {
        const entry = entries[i]
        return entry ? `${entry.save.position}/${CAMPAIGN_LENGTH}` : null
      },
      enabled: () => entries[i] !== null,
      choose: () => {
        const entry = entries[i]
        if (entry) handlers.onLoaded(entry)
      }
    }))
  })

  return {
    ...screen,
    refresh,
    enter() {
      void refresh().then(() => screen.enter())
    }
  }
}
