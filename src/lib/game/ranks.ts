// A pig's RANK — which is its class byte, and nothing else.
//
// The original keeps one number per pig at `team + 64*slot + 0x71` and reads
// everything off it: the name (`fetext` 467 + class), the badge its career
// wears, the stripes its step in that career wears, and where it can be
// promoted to. All four tables are the exe's and are named below;
// `army/notes.md` in the disasm repo carries the derivation.

/** Where the fifteen rank names start in `fetext` — 467 GRUNT … 481 HERO. */
export const RANK_TEXT = 467
export const RANKS = 15

/** `fetext` 466, the `PROMOTE - ` a rank is printed after. */
export const PROMOTE_TEXT = 466

/**
 * The six CAREERS, in the order the badge table counts them (0x4D29C0's first
 * byte). A career is what a pig can DO; the four in the middle are the ones
 * the CAREER PATH screen offers.
 */
export const CAREERS = ['heavy', 'espionage', 'engineer', 'medic', 'commando', 'hero'] as const
export type Career = (typeof CAREERS)[number]

/**
 * Class → its career and its step in it, out of the table at **0x4D29C0**:
 * three bytes a class, the first the career and the second the step, 0..2.
 * (The third is used only by the two rows past HERO, which nothing reaches.)
 *
 * The multiplayer screen has a table of its own at 0x4D29F8; it differs only
 * in flattening the steps, so it is not carried here.
 */
const TABLE: readonly (readonly [number, number])[] = [
  [0, 0], // 0  GRUNT
  [0, 0], // 1  GUNNER
  [0, 1], // 2  BOMBARDIER
  [0, 2], // 3  PYROTECH
  [4, 0], // 4  COMMANDO
  [2, 0], // 5  SAPPER
  [2, 1], // 6  ENGINEER
  [2, 2], // 7  SABOTEUR
  [1, 0], // 8  SCOUT
  [1, 1], // 9  SNIPER
  [1, 2], // 10 SPY
  [3, 0], // 11 ORDERLY
  [3, 1], // 12 MEDIC
  [3, 2], // 13 SURGEON
  [5, 0] //  14 HERO
]

/** Which career a class belongs to. */
export function careerOf(rank: number): Career {
  return CAREERS[TABLE[rank]?.[0] ?? 0] ?? 'heavy'
}

/** Which step of that career it is: 0 wears no stripes, 1 and 2 wear one each. */
export function stepOf(rank: number): number {
  return TABLE[rank]?.[1] ?? 0
}

/** Where a rank's name is in `fetext`. */
export const rankText = (rank: number): number => RANK_TEXT + rank

export interface Promotion {
  /** The class the pig becomes. */
  to: number
  /** What it costs in promotion points. */
  cost: number
}

/**
 * Every way out of a class, out of the pair table at **0x4D2980** with the
 * per-class count at 0x4D29A8.
 *
 * A GRUNT has four — one per career, all costing one — which is why choosing
 * is a screen of its own (CAREER PATH, record 25, whose four items are these
 * four in this order). Every other class has exactly one, and a HERO has none.
 *
 * The shape play named before any of it was read: **all four careers converge
 * on COMMANDO, and COMMANDO becomes a HERO.** Twenty points from a GRUNT,
 * whichever way round.
 */
const TREE: readonly (readonly Promotion[])[] = [
  [{ to: 1, cost: 1 }, { to: 5, cost: 1 }, { to: 8, cost: 1 }, { to: 11, cost: 1 }], // GRUNT
  [{ to: 2, cost: 2 }], // GUNNER
  [{ to: 3, cost: 3 }], // BOMBARDIER
  [{ to: 4, cost: 6 }], // PYROTECH
  [{ to: 14, cost: 8 }], // COMMANDO
  [{ to: 6, cost: 2 }], // SAPPER
  [{ to: 7, cost: 3 }], // ENGINEER
  [{ to: 4, cost: 6 }], // SABOTEUR
  [{ to: 9, cost: 2 }], // SCOUT
  [{ to: 10, cost: 3 }], // SNIPER
  [{ to: 4, cost: 6 }], // SPY
  [{ to: 12, cost: 2 }], // ORDERLY
  [{ to: 13, cost: 3 }], // MEDIC
  [{ to: 4, cost: 6 }], // SURGEON
  [] // HERO — 0x4D29A8[14] is 0, and there is nowhere above it
]

/** Where a class can go, cheapest listing first. Empty for a HERO. */
export function promotionsFrom(rank: number): readonly Promotion[] {
  return TREE[rank] ?? []
}

/** What a promotion costs, or null when the class has no such way out. */
export function costOf(rank: number, to: number): number | null {
  return promotionsFrom(rank).find((step) => step.to === to)?.cost ?? null
}

/** What it costs to take a GRUNT all the way to a HERO down any one career —
 * 1 + 2 + 3 + 6 + 8. The four are equal by construction. */
export const HERO_COST = 20
