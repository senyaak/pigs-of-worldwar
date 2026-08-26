// USING A WEAPON ENDS THE TURN.
//
// Play: "использование оружия заканчивает ход — у нас нет." The exe agrees, and
// it hangs the rule on the skill's own 80-byte record at 0x4d7300 rather than on
// anything a weapon does: `+0x1c` goes into `[game+0x517]`, and that flag is the
// mode machine's "go to WALK AWAY" — mode 13, the beat a turn ends through
// (`turns/notes.md`). One press, one blow, one turn.
//
// Which skills are the exception is MEASURED over the shipped exe, all 67
// records, and not read off a summary: `+0x1c` is 0 on thirteen of them and 1 on
// everything else, `+0x18` (the wait the exception plays on) is 0 everywhere but
// TNT and FIRECRACKER, where it is 400 hundredths — four seconds. Plant it and
// run.
//
// Pure, and a table: nothing here knows what a weapon does, only what using one
// costs.

/**
 * The skills that do NOT end the turn — every record whose `+0x1c` is zero:
 *
 * | skill | | skill | |
 * | ----- | - | ----- | - |
 * | 0 | NONE | 54 | PICKPOCKET |
 * | 35 | MINE | 60 | `in-out` |
 * | 36 | ANTI-P MINE | 61 | `pbox` |
 * | 37 | TNT | 62 | `getout` |
 * | 38 | FIRECRACKER | 63 | MAP VIEW |
 * | 52 | HEALING HANDS | 64 | BINOCULARS |
 * | | | 66 | SURRENDER |
 *
 * Two families and nothing else: the explosives a pig PLANTS and walks away
 * from, and the skills that are not blows at all — a heal, a pickpocketing, the
 * two views, getting in and out of a vehicle. **65 SKIP TURN is not among them**,
 * which is exactly right: it ends the turn, and that is all it does.
 *
 * So the rule is the general one, and the list is the hole in it — which is why
 * this is a set of exceptions rather than a table of weapons. A weapon the remake
 * has not modelled yet still answers correctly the day it lands.
 */
const KEEPS_TURN = new Set([0, 35, 36, 37, 38, 52, 54, 60, 61, 62, 63, 64, 66])

/** Whether USING this skill spends the turn. Empty hands spend nothing. */
export const endsTurn = (skill: number | null): boolean =>
  skill !== null && !KEEPS_TURN.has(skill)

/**
 * **PLANT IT AND RUN**: the seconds the clock is cut to instead of the turn
 * ending, `+0x18` of the record over a hundred.
 *
 * 400 hundredths on TNT and the firecracker and nil on everything else, and the
 * mode machine spends it the same way for both: a wait above zero raises
 * `[game+0x516]`, which is the arm at 0x4945a5 — back to NORMAL mode with the
 * turn's deadline re-stamped, so the pig keeps the controls and has four seconds
 * to be somewhere else. Zero here and the flags decide alone (`endsTurn`).
 *
 * It is a SET and not a bonus: the exe writes the deadline rather than adding to
 * it (0x4945d9), so a pig with ninety seconds left has four the moment the charge
 * goes down.
 *
 * **The MINES have their own arm and it is not this one.** 0x4942e6 tests for
 * skills 35 and 36 by number and gives them the same four seconds *only* when
 * `[game+0x534] >= 2` or the turn has less than four seconds left; otherwise
 * laying one costs nothing at all. `[game+0x534]` is READ now (2026-08-26, all
 * five sites): a saturating mines-laid-this-turn byte, zeroed every handover
 * (0x48f539), incremented only by the mine arm (0x493ed9) — so the first two
 * lays a turn are free and the third squeezes the clock. The battle implements
 * it beside the `hurryFor` call (lib/game/battle.ts, `minesLaid`).
 */
export const hurryFor = (skill: number | null): number =>
  skill === 37 || skill === 38 ? PLANTED_SECONDS : 0

/** `+0x18` = 400 hundredths — four seconds, on the two charges that carry one. */
export const PLANTED_SECONDS = 4
