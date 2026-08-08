// FIELD CONDITIONS — the knobs a skirmish is set up with, as plain data.
//
// The original's own screen (fetext 66), and its options are its own strings:
// PIGS (297), TURN TIME (298), DEATHMATCH LIMIT (299), HEALTH (300), SUDDEN
// DEATH (301), over LANDMASS, THEME, MINES, HEIGHT, VEHICLES, MIRRORED, SKY
// and PICK-UPS (276-283). Which VALUES belong to which knob is read off the
// blocks that follow, and each is named where it is used below.
//
// Only three of them are here, and that is the point: a setting nothing can
// obey would be a knob wired to nothing. The rest live on the screen in the
// font's dark shade (ui/fieldConditions.ts), the way the original greys out
// what cannot be chosen, and each one comes here as its rule lands.
//
// Pure — no three, no Electron. `Game` and the battle read it; nothing else.

/** How much health every pig starts with, against its class's own figure. */
export type HealthScale = 'normal' | 'half' | 'double'

/** fetext 303/304/305 — NORMAL, HALF, DOUBLE, in the file's own order. */
export const HEALTH_TEXT: Record<HealthScale, number> = {
  normal: 303,
  half: 304,
  double: 305
}

export const HEALTH_ORDER: readonly HealthScale[] = ['normal', 'half', 'double']

/** What each choice multiplies `maxHealthFor` by. */
export const HEALTH_FACTOR: Record<HealthScale, number> = {
  normal: 1,
  half: 0.5,
  double: 2
}

/**
 * TURN TIME's own values, fetext 308-313 — 10, 20, 30, 45, 60, 99 seconds.
 *
 * The ceiling is 99 and not a round hundred for the same reason the campaign
 * table tops out there: the dashboard's clock has exactly two digit windows
 * (lib/game/turns.ts).
 */
export const TURN_SECONDS_CHOICES: readonly number[] = [10, 20, 30, 45, 60, 99]
export const TURN_SECONDS_TEXT = [308, 309, 310, 311, 312, 313]

/**
 * PIGS, fetext 321-329 — 3, 4, 5, 6, 7, 8, 9, 10, 20 to a side.
 *
 * A map hands out what its own markers carry, so this is a CAP and not a
 * quota: an arena's five stay five when twenty is asked for. There is no
 * filling in, the same rule the sides themselves follow.
 */
export const PIG_COUNT_CHOICES: readonly number[] = [3, 4, 5, 6, 7, 8, 9, 10, 20]
export const PIG_COUNT_TEXT = [321, 322, 323, 324, 325, 326, 327, 328, 329]

export interface Conditions {
  /**
   * Seconds on the turn clock, or null to let the LEVEL decide — which is
   * what the campaign does, and what the training ground needs
   * (`turnSecondsFor`). A skirmish that names a number overrides it.
   */
  turnSeconds: number | null
  health: HealthScale
  /** The cap on a squad, from `PIG_COUNT_CHOICES`. */
  pigs: number
}

/**
 * What a skirmish is set up with before anybody touches the screen.
 *
 * The turn clock is left to the level rather than defaulted to a number off
 * the list — a map that knows its own length should keep it, and only a
 * deliberate choice should take it away. Five pigs is what every shipped
 * arena carries, so it is the cap that changes nothing.
 */
export const DEFAULT_CONDITIONS: Conditions = {
  turnSeconds: null,
  health: 'normal',
  pigs: 5
}

/** What a class's health becomes under these conditions. Rounded, because
 * the engine counts whole points and HALF of an odd figure is not one. */
export const scaleHealth = (max: number, health: HealthScale): number =>
  Math.max(1, Math.round(max * HEALTH_FACTOR[health]))
