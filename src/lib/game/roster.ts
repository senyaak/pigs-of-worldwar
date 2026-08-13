// THE SQUAD BETWEEN MISSIONS — who is still standing, who gets up again, and
// who is replaced.
//
// Read out of `warhogs_.exe` 2026-08-13 (`army/notes.md` in the disasm repo).
// Play's question was whether a new pig takes a dead one's place, and the
// answer is **yes**: the roster is a live list of eight and it is eight again
// before every mission. It is not a fixed list with headstones — a name that
// leaves it never comes back.
//
// The original does it in two arms and this module is both:
//
//  - `Team::EndOfMission` (0x450970) puts a couple of the fallen back on their
//    feet, name and stats intact, and records the slots at `team+0x290`;
//  - `0x482810` drafts a fresh Grunt into every slot still empty and swaps it
//    to the TAIL, so the survivors stay packed at the front in the order they
//    already had and the newcomers line up behind them. `0x482720` names one
//    `DRAFT` + a per-team counter (`team+0x28F`, `fetext` 0x113).
//
// A pig keeps its slot while it is down — the original keeps the whole 64-byte
// record and only zeroes the byte at +0x00 — which is why `fell` lives on the
// pig here rather than in a list beside it.

/** Eight slots, and the original never has more or fewer (0x482820). */
export const SQUAD_SIZE = 8

/**
 * How many of the fallen get up again.
 *
 * `[exe]`, with one link inferred. Both readers — the roster arm at 0x4509F1
 * and the end-of-mission screen at 0x4848B5 — keep a pig whose `pig+0x2C` is
 * not -1 and is `>= holes - 2`, where `holes` is how many went down. Nothing
 * found WRITES that field: a scan of `.text` for stores to it turns up only
 * `Pig::Init`'s -1. Read as the order a pig fell in, the two sites agree and
 * the arithmetic is exactly "the last two to fall come back", which is what
 * this constant is. **Correct it in play** — the writer is still to be found.
 */
export const RETURNING = 2

export interface Pig {
  /** Encoded `ASCII − 0x1F` in the original; plain text here. */
  name: string
  /** 0..8, unique inside the squad — the original's `pig+0x02`, which is what
   *  picks the face and the voice out of the nation's nine. */
  identity: number
  /** The class, an index into `gtext` 63 (Grunt) onward. A draft is a Grunt. */
  rank: number
  /** Missions this pig has played (`pig+0x08`). */
  missions: number
  /** What it has been worth across them (`pig+0x0A`). */
  score: number
  /** How many had already fallen when this one did, or -1 while it stands —
   *  the original's `pig+0x2C`. */
  fell: number
}

/** Is this pig on the roster? The original asks the same of one byte. */
export const standing = (pig: Pig): boolean => pig.fell < 0

/** How many of the eight are still up (`team+0x01`, recounted at 0x450930). */
export const standingCount = (squad: Pig[]): number => squad.filter(standing).length

/** Mark a pig down, in the order it happened. */
export function fall(squad: Pig[], slot: number): void {
  const pig = squad[slot]
  if (!pig || !standing(pig)) return
  pig.fell = squad.length - standingCount(squad)
}

/**
 * A squad of eight built from a nation's names.
 *
 * The original draws eight of the nation's NINE, at random and without
 * replacement — `0x482520` rolls `rand() % 9` against the identity table at
 * 0x4D3040 and re-rolls while the identity is taken. Which eight is the
 * caller's business (and its random stream's, `lib/game/random.ts`); what this
 * module insists on is that the identities are the ones the names came from,
 * because that is what stays unique for the life of the campaign.
 */
export function newSquad(names: string[], identities: number[]): Pig[] {
  return names.slice(0, SQUAD_SIZE).map((name, at) => ({
    name,
    identity: identities[at] ?? at,
    rank: 0,
    missions: 0,
    score: 0,
    fell: -1
  }))
}

/** The lowest identity nobody in the squad is using. */
function freeIdentity(squad: Pig[]): number {
  const taken = new Set(squad.map((pig) => pig.identity))
  for (let id = 0; ; id++) if (!taken.has(id)) return id
}

export interface Regrouped {
  squad: Pig[]
  /** The running draft count, which is what numbers the names. */
  drafts: number
  /** The slots whose pig got up again — the original's `team+0x290`, and what
   *  the end-of-mission screen draws. */
  returned: number[]
}

/**
 * The squad the next mission is fielded from.
 *
 * `word` is what a draft is called before its number — `fetext` 0x113, DRAFT.
 * It is a parameter because this module is pure and the strings are the
 * frontend's.
 */
export function regroup(squad: Pig[], drafts: number, word = 'DRAFT'): Regrouped {
  const holes = squad.length - standingCount(squad)
  const returned: number[] = []
  const out: Pig[] = []

  // 0x450970 then 0x482810, in one walk because the second only compacts what
  // the first left: the last few to fall get up in their own slots with
  // everything they had, everyone still down is gone, and what is left closes
  // up at the FRONT in the order it already had. Nothing here writes to the
  // squad it was handed — the pigs that carry on are copies.
  for (let slot = 0; slot < squad.length; slot++) {
    const pig = squad[slot]
    if (standing(pig)) {
      out.push({ ...pig })
      continue
    }
    if (pig.fell < holes - RETURNING) continue
    returned.push(slot)
    out.push({ ...pig, fell: -1 })
  }

  // …and a draft fills every place that left, at the BACK.
  let count = drafts
  while (out.length < SQUAD_SIZE) {
    out.push({
      name: `${word}${++count}`,
      identity: freeIdentity(out),
      rank: 0,
      missions: 0,
      score: 0,
      fell: -1
    })
  }
  return { squad: out, drafts: count, returned }
}
