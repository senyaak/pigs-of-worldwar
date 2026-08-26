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
 * **The MINES have their own arm and it is not this one** — and its NUMBERS
 * are play's, over the disassembly's. The exe was read (0x4942e6 with
 * `[game+0x534]`, a mines-laid-this-turn byte zeroed every handover) as "two
 * free, the third squeezes to four seconds"; play remembers the original
 * otherwise (2026-08-26): "вторая мина уже не бесплатна - а остаётся 5 секунд
 * и нельзя больше ничего использовать." So the FIRST lay is free, the SECOND
 * squeezes the clock to `MINE_HURRY_SECONDS` and closes the hand for the
 * turn. The battle implements it beside the `hurryFor` call
 * (lib/game/battle.ts, `minesLaid`). `[play]`.
 */
export const hurryFor = (skill: number | null): number =>
  skill === 37 || skill === 38 ? PLANTED_SECONDS : 0

/** `+0x18` = 400 hundredths — four seconds, on the two charges that carry one. */
export const PLANTED_SECONDS = 4

/** What the SECOND mine of a turn leaves on the clock — play's five, not the
 * exe reading's four (the note above). `[play]`. */
export const MINE_HURRY_SECONDS = 5
