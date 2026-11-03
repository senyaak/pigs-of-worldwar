// What the battle's screen SAYS: the gtext lines it picks by number, the
// literal strings the exe prints, the remake's own two, and the weapon port's
// lens.

import { lobOf } from '../../../../lib/game/grenade'

/** `gtext 227`, "USE SHIFT BUTTON TO JUMP THE GAP." — a real tutorial line,
 * and a long enough one to scroll, which is what `pow.say()` shows. */
export const SAMPLE_LINE = 227

/** What a collected crate puts through the briefing bar. `gtext 171` is the
 * refusal, 172 the health crate's line — the exe writes the skill ones with
 * its own "%u X%d" / "%u" (0x4CF9E8) out of the skill's name. */
export const TOO_MANY_TOYS = 171
export const FOUND_PROVISIONS = 172

/** The pickpocket's two refusals are NOT gtext — literal `.data` strings the
 * exe prints straight onto the bar (0x4D16D0 / 0x4D16F4, dwell 300 and 500;
 * `weapons/espionage.md`). A success prints the skill's own name with the
 * crate pickup's "%u X%d" formats. */
export const STEAL_NO_REACH = "Your arms don't reach that far..."
export const STEAL_NOTHING = 'This pig has nothing left to steal....poor little porker.'

/** …and the HEALING HANDS' two, which are the REMAKE'S OWN WORDS — the exe
 * prints nothing at all when a heal finds nobody (CLAUDE.md, `[deliberate]`;
 * lib/game/events.ts carries the read). Written in the pickpocket's voice
 * above, because that is the only refusal the game itself puts on this bar
 * and it is the register to match. Play asked for the first one: "если
 * полечить не получилось руками — то нет текста что нет цели". */
export const HEAL_NOBODY = 'Nobody there to lay a trotter on...'
export const HEAL_ALREADY_WELL = 'This pig is in the pink already....nothing to mend.'

/**
 * "GET READY >S..." — `gtext 168`, and it is the game's own answer to the beat at
 * the top of a turn.
 *
 * The beat has been in the domain since the turn clock landed (ten seconds, or any
 * key, `lib/game/game.ts`) and nothing ever SHOWED it, so a handover read as
 * instant: "когда кончается ход — следующий начинается мгновенно." A first pass
 * invented a line out of the exe's debug print; play sent a screenshot of the
 * shipped game instead — big green letters over the battle, "GET READY TOMMY'S
 * TROTTERS..." — so it is this string, with the SQUAD's name in it, drawn on the
 * same centred card the mission title uses.
 */
export const GET_READY = 168

/**
 * How full the weapon port's red lens is — null for an empty port.
 *
 * Play, of the bazooka's: "индикатор красный на панели силы полностью закрашен —
 * как оружие которое детонирует при контакте", and of the ordinary one "на
 * половину залитого круга". So it is the CLASS: whole for anything that goes off
 * on touch (`Lob.contact`, read off the projectile's state machine in
 * lib/game/grenade.ts) and half for everything else.
 *
 * The half is play's word rather than a reading, like the position it is drawn
 * at — nothing in the exe has been traced to `pcpie4` at all.
 */
export const LENS_ORDINARY = 0.5
export const lensFor = (holding: number | null): number | null =>
  holding === null ? null : lobOf(holding)?.contact ? 1 : LENS_ORDINARY

/** ">S MISSES A TURN!" — `gtext 167`, what SKIP TURN says. Also the game's own,
 * and also a line an invented one stood in for. */
export const MISSES_TURN = 167

/**
 * **What a finished mission says, and it is the game's own card.** Play: "при
 * выигрыше не написано победа."
 *
 * The exe draws its centred cards out of ONE function switching on the game's
 * mode (0x45B94B → the table at 0x45BF78): mode 1 START OF GAME is the mission
 * title this file already draws, mode 4 START OF TURN is "GET READY >S...", and
 * **mode 2, END OF GAME, is this pair** (0x45BC66). One player takes `gtext` 163
 * when its side is still standing and 164 when it is not; a multiplayer game
 * takes 165, "VICTORY TO >S!!", with the winning team's name — which this does
 * not draw, because nothing here fields two human sides.
 */
export const MISSION_ACCOMPLISHED = 163
export const MISSION_FAILED = 164
