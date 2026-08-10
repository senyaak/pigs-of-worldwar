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

/**
 * Whether USING this skill spends the turn. Empty hands spend nothing.
 *
 * The four-second wait TNT and FIRECRACKER carry is not modelled: neither is a
 * weapon in this engine yet — there is no row for either in `grenade.ts` or
 * `projectile.ts` — and a timer nothing can start would be a guess with no way
 * to be wrong. The number is in `turns/notes.md` for when one of them lands.
 */
export const endsTurn = (skill: number | null): boolean =>
  skill !== null && !KEEPS_TURN.has(skill)
