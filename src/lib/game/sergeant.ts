// THE SERGEANT, and what he says at the end of a turn.
//
// The install ships `Speech/Sku1/Sarge/SGEN{CC}{VV}.wav` — 175 files, 21
// categories of eight short lines and a twenty-second of seven long ones — and
// nothing in the remake had ever opened the folder. Play named the moment
// first: "именно убить надо и тебя похвалят типо."
//
// The player's memory is right and the arm is decoded. `0x43B850` is
// `Sound::PlaySargeSpeech`, `__thiscall` with five stack arguments, and it
// builds its own path:
//
// ```
// 43b8cb  cmp ebx,0x16 ; jl        ; 22 SECTIONS, anything over is CLAMPED to 0
// 43b8d5  push 0x4c2b14            ; …with "eSpeechSection is wrong = %d"
// 43b8e9  cmp esi,-1 ; je          ; a range of -1 means the line is passed WHOLE
// 43b8ee  rand() % (hi - lo + 1) + lo
// 43b90d  cmp ebp,8 ; jle          ; a line past EIGHT spills into the next
// 43b912  inc ebx ; sub ebp,8      ;   category — which is how 13 and 14 are
// 43b920  inc ebx                  ;   one pool of sixteen
// 43ba22  "speech\sku1\sarge\SGEN%02d%02d.wav"
// ```
//
// **No language.** The pig voices carry one (`01EN0201.wav`) and the training
// instructor carries one (`tr1_en01.wav`); this builder never reads the language
// table at 0x4C2988, and the shipped names have no room for it. One set,
// English, for every nation.
//
// Pure: a turn's tally in, a line out.

/**
 * Which SECTION each moment passes — the argument, not the file number. The
 * file's category is `section + 1` (see `sargeFile`).
 *
 * Only the two this module decides are named. The other nineteen are decoded
 * and not built: 4..9 are the crates (by item type), 10 and 11 are one-shot
 * hints latched per battle, 12 is the "hurry up" pool of SIXTEEN that spans
 * files 13 and 14, 14..20 are the MULTIPLAYER pair chosen by the pig's own
 * nation, and 21 is the front end's. Every one of the 21 call sites is written
 * up in `docs/history/turns.md`.
 */
export const SARGE_LOST = 0
export const SARGE_WON = 2

/** How many lines a section holds, and where the spill goes (0x43b90d). */
export const SARGE_LINES = 8
/** 22 sections, and the exe complains and falls back to 0 past them. */
export const SARGE_SECTIONS = 22

/**
 * The floor under his beat, in seconds — the exe's own `[0x520878] −
 * [ctrl+0x4B8] <= 0x7D`, 125 milliseconds (0x490CBD).
 *
 * It is not a nicety: the beat is released by asking whether he is still
 * talking, and the answer travels from the sound domain through a poll a frame
 * or two behind (contracts/sound.ts). Without a floor the turn would hand over
 * before the first of those frames and the line would be cut by the handover
 * that follows it.
 */
export const SARGE_FLOOR = 0.125

/**
 * What a turn did, counted the way the exe counts it: six death sites all
 * increment the same globals, and every one of them is cleared at the START of
 * a turn (0x48FD92) as well as at level init.
 *
 * `kills` is `[0x537F14]`, deaths on any side but the acting one; `losses` is
 * `[0x537F18]`, deaths on the acting side — and a pig that kills its own
 * counts for BOTH, because the comparison is `[dead+0x194] == [acting+0x194]`
 * and the other tally is stepped unconditionally after it.
 */
export interface TurnTally {
  kills: number
  losses: number
}

export const noTally = (): TurnTally => ({ kills: 0, losses: 0 })

/**
 * The exe's WIN OR LOSE VALUE (0x498620), which gates both lines — and it is
 * not about the kill at all, it is about TOTAL TEAM HEALTH. Its own debug
 * strings say so: "Current player health = %d. Min, Max Other Players' health
 * = %d, %d" and "The current player has a win or lose value of %d".
 *
 * 1 when the acting side has strictly the most, −1 when it has strictly the
 * least, 2 when it is level with both ends, 0 in between.
 */
export function winOrLose(own: number, others: readonly number[]): number {
  if (others.length === 0) return 2
  const most = Math.max(...others)
  const least = Math.min(...others)
  if (own > most) return 1
  if (own < least) return -1
  return own === most && own === least ? 2 : 0
}

/** A section and the line inside it, 1-based — what `sargeFile` turns into a
 * name. */
export interface SargeLine {
  section: number
  line: number
}

/**
 * What the sergeant says as the turn ends, or null for a turn he sits out.
 *
 * **The praise is gated on the SCORE as well as on the kill** (0x4983CD): you
 * are told well done for killing only while your side leads on health, and
 * commiserated for losing one only while it trails. A kill from behind is met
 * with silence, and so is a loss from in front. That is the arm, transcribed,
 * and it is why the line feels like a remark on the battle rather than on the
 * shot.
 *
 * `counters` is the exe's own rotation — one byte a section, stepped after the
 * call and wrapped past eight (0x498402) — so the eight lines come round in
 * order rather than at random. It is READ AND WRITTEN here.
 */
export function sargeAfterTurn(
  tally: TurnTally,
  value: number,
  counters: Map<number, number>
): SargeLine | null {
  const section = value === 1 && tally.kills > 0 ? SARGE_WON
    : value === -1 && tally.losses > 0 ? SARGE_LOST
    : null
  if (section === null) return null
  const at = counters.get(section) ?? 1
  counters.set(section, at + 1 > SARGE_LINES ? 1 : at + 1)
  return { section, line: at }
}

/**
 * The file a section and a line come to — the builder's own arithmetic
 * (0x43b90d..0x43ba22), spill and 1-based category and all.
 */
export function sargeFile(section: number, line: number): string {
  let category = section >= SARGE_SECTIONS ? 0 : Math.max(0, Math.trunc(section))
  let at = Math.max(1, Math.trunc(line))
  if (at > SARGE_LINES) {
    category++
    at -= SARGE_LINES
  }
  category++
  const two = (n: number): string => String(n).padStart(2, '0')
  return `Speech/Sku1/Sarge/SGEN${two(category)}${two(at)}.wav`
}
