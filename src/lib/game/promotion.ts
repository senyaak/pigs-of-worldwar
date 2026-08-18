// WHAT THE PIG MENU DOES TO A SAVE — promote, rename, swap.
//
// The original's pig menu (record 19: PROMOTE / SWAP POSITION / RENAME) works
// on the live team record; ours works on the SaveGame, pure and copying, and
// the campaign writes the result back (autosave — the original relies on SAVE
// TEAM, which the remake deliberately does not have).
//
// The promote rule is the exe's (`army/notes.md`): the cost comes off the pair
// table `lib/game/ranks.ts` carries, is tested against the team's points —
// `[team+0x50]`, ours `save.tokens` — refused when short (sound 21, the UI's
// business), and subtracted on the way through (0x42BD92). A GRUNT has four
// ways out, which is why choosing one is a screen (CAREER PATH, record 25).

import { costOf } from './ranks'
import type { SaveGame } from './save'

/** A pig's name is at most SEVEN characters — the name entry's own rule
 * (`lib/game/nameEntry.ts`), against the team's eleven. */
export const PIG_NAME_LENGTH = 7

const withSquad = (save: SaveGame, squad: SaveGame['squad']): SaveGame => ({
  ...save,
  squad
})

/**
 * Promote the pig in `slot` to class `to`, spending the tokens — or null when
 * the tree has no such step or the team cannot afford it. The caller picks
 * `to` off `promotionsFrom(pig.rank)`; for every class but the GRUNT there is
 * exactly one.
 */
export function promote(save: SaveGame, slot: number, to: number): SaveGame | null {
  const pig = save.squad[slot]
  if (!pig) return null
  const cost = costOf(pig.rank, to)
  if (cost === null || cost > save.tokens) return null
  const squad = save.squad.map((one, at) => (at === slot ? { ...one, rank: to } : one))
  return { ...withSquad(save, squad), tokens: save.tokens - cost }
}

/**
 * Rename the pig in `slot`. The name arrives the way the name entry hands one
 * over — judged and trimmed there (`lib/game/nameEntry.ts`) — so an empty or
 * missing one is refused rather than written.
 */
export function renamePig(save: SaveGame, slot: number, name: string): SaveGame | null {
  const trimmed = name.trim().slice(0, PIG_NAME_LENGTH)
  if (!save.squad[slot] || trimmed.length === 0) return null
  return withSquad(
    save,
    save.squad.map((one, at) => (at === slot ? { ...one, name: trimmed } : one))
  )
}

/**
 * Swap two slots whole — the original moves the entire 64-byte pig record,
 * so everything a pig is travels with it. Swapping a slot with itself is a
 * refusal, not a write: the menu's job is to know nothing happened.
 */
export function swapPigs(save: SaveGame, a: number, b: number): SaveGame | null {
  if (a === b || !save.squad[a] || !save.squad[b]) return null
  const squad = save.squad.slice()
  ;[squad[a], squad[b]] = [squad[b], squad[a]]
  return withSquad(save, squad)
}
