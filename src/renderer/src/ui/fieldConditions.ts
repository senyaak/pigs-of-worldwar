// The FIELD CONDITIONS screen — how a skirmish is set up before it starts.
//
// The original's own (fetext 66), and every word on it is the game's: the
// knobs are 276-283 and 297-301, and each one's values are the block that
// follows. It is the frontend's usual machine with SETTING bars, so left and
// right change a value, which is the original's own instruction (780).
//
// The rules it can actually impose live in `lib/game/conditions.ts`; this
// file is the screen and nothing else.
//
// WHICH knobs belong here is the strings' own grouping, not a pick. fetext
// holds two blocks and they are different kinds of thing:
//
// - 297-301 — PIGS, TURN TIME, DEATHMATCH LIMIT, HEALTH, SUDDEN DEATH — are
//   the rules of a MATCH, and they are this screen;
// - 276-283 — LANDMASS, THEME, MINES, HEIGHT, VEHICLES, MIRRORED, SKY,
//   PICK-UPS — shape a level that does not exist yet: they belong to LEVEL
//   SETUP / CUSTOM LEVEL OPTIONS (111, 153) over RANDOM GENERATED LEVEL
//   (112). The six GEN*.PMG files that ship carry no spawn markers at all —
//   measured — so there is nothing to generate into. Not this screen, and
//   they are named here only so the next reader does not go looking.
//
// Two of the five are dark, and each for its own reason rather than a general
// "not built": DEATHMATCH LIMIT and SUDDEN DEATH are win conditions, and the
// battle has none — `game.over` is "nobody is left standing" and that is all.
// Turning either live is adding the rule first and the bar second, the way
// TURN TIME, HEALTH and PIGS went in.

import { byId } from './dom'
import { feText, initBarScreen } from './barScreen'
import type { Bar, BarScreen } from './barScreen'
import {
  DEFAULT_CONDITIONS,
  HEALTH_ORDER,
  HEALTH_TEXT,
  PIG_COUNT_CHOICES,
  PIG_COUNT_TEXT,
  TURN_SECONDS_CHOICES,
  TURN_SECONDS_TEXT
} from '../../../lib/game/conditions'
import type { Conditions } from '../../../lib/game/conditions'

/** fetext indices for the screen and the knobs that are live. */
const TITLE_TEXT = 66
const PIGS_TEXT = 297
const TURN_TIME_TEXT = 298
const HEALTH_LABEL_TEXT = 300

/** The two match rules with nothing behind them yet — see the header. */
const DEATHMATCH_LIMIT_TEXT = 299
const SUDDEN_DEATH_TEXT = 301

/**
 * What TURN TIME says when nothing has been chosen: the LEVEL's own length.
 *
 * The original has no such value — its skirmish always names a number. This
 * is the remake's, and it exists because the screen can be left alone: a map
 * that knows its own clock should keep it rather than be overwritten by
 * whichever number happened to be first on the list. `NORMAL` (fetext 315) is
 * the game's own word for "unchanged" and is borrowed for it.
 */
const LEVELS_OWN_TEXT = 315

/** Step through a list of choices, wrapping — what left and right do. */
function stepped<T>(choices: readonly T[], current: T, by: number): T {
  const at = choices.indexOf(current)
  // Something not on the list steps to the start rather than off the end.
  if (at < 0) return choices[0]
  return choices[(at + by + choices.length) % choices.length]
}

export type FieldConditionsScreen = BarScreen & {
  /** What the screen currently says the battle should be set up with. */
  conditions(): Conditions
}

export function initFieldConditions(handlers: { onBack: () => void }): FieldConditionsScreen {
  const set: Conditions = { ...DEFAULT_CONDITIONS }

  const bars: Bar[] = [
    {
      label: () => feText(TURN_TIME_TEXT),
      value: () =>
        set.turnSeconds === null
          ? feText(LEVELS_OWN_TEXT)
          : feText(TURN_SECONDS_TEXT[TURN_SECONDS_CHOICES.indexOf(set.turnSeconds)]),
      enabled: () => true,
      cycle(by) {
        // null sits at the FRONT of the ring, so one press left off the
        // shortest turn hands the clock back to the level.
        const ring: (number | null)[] = [null, ...TURN_SECONDS_CHOICES]
        set.turnSeconds = stepped(ring, set.turnSeconds, by)
      }
    },
    {
      label: () => feText(HEALTH_LABEL_TEXT),
      value: () => feText(HEALTH_TEXT[set.health]),
      enabled: () => true,
      cycle(by) {
        set.health = stepped(HEALTH_ORDER, set.health, by)
      }
    },
    {
      label: () => feText(PIGS_TEXT),
      value: () => feText(PIG_COUNT_TEXT[PIG_COUNT_CHOICES.indexOf(set.pigs)]),
      enabled: () => true,
      cycle(by) {
        set.pigs = stepped(PIG_COUNT_CHOICES, set.pigs, by)
      }
    },
    { label: () => feText(DEATHMATCH_LIMIT_TEXT), enabled: () => false },
    { label: () => feText(SUDDEN_DEATH_TEXT), enabled: () => false }
  ]

  const screen = initBarScreen({
    canvas: byId<HTMLCanvasElement>('fc-screen'),
    title: () => feText(TITLE_TEXT),
    onBack: handlers.onBack,
    bars
  })

  return { ...screen, conditions: () => ({ ...set }) }
}
