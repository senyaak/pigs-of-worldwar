// THE SAVE — what a campaign in progress is, and how it goes to a file.
//
// Pure: no Electron, no filesystem. The main process owns the file
// (`src/main/saves.ts`); this module owns the SHAPE, and the shape is ours —
// only what a player sees has to match the original, and a player never sees
// this. It is JSON on purpose: `savearmy0` is 680 packed bytes of the exe's
// own struct and we neither read nor write it.
//
// **What it holds** is play's list, 2026-08-13: which missions are done, the
// chosen army, the team's name, every pig's name and rank, and the PP tokens.
// The original's record holds the same things and a few more, and where a
// field is the same field its address is named so the two can be compared:
// the team's name at `team+0x270`, its nation at `+0x28E`, the campaign
// position at `+0x53`, the enemy nations at `+0x54`, the draft counter at
// `+0x28F`, and eight 64-byte pig slots from `+0x70` (`army/notes.md`).
//
// **There is no SAVE screen.** It autosaves — one slot per game, written when
// a mission ends.

import { fillEnemies } from './enemies'
import { CAMPAIGN_LENGTH, fieldedAt, mapAt } from './missions'
import { seeded } from './random'
import { regroup, SQUAD_SIZE, type Pig } from './roster'

/**
 * Bumped when the shape changes in a way an older file cannot be read as.
 *
 * **2 dropped `best`** - a COUNT of the medals a position had yielded - for
 * `medals`, which says WHICH ones. A v1 file cannot be read as a v2 one
 * because the count does not carry that: 2 could be finishing plus the
 * survival bonus, or finishing plus a pickup, and guessing would either pay
 * a medal twice or lock one away for ever. The four campaigns in this
 * checkout were converted by hand off what their tokens and rosters
 * actually say (`docs/history/frontend.md`, 2026-08-26).
 */
export const SAVE_VERSION = 2

/** One fielded pig as a finished mission recorded it — enough to stand the
 * same squad up again for a replay and to draw its debrief row. */
export interface FoughtPig {
  name: string
  identity: number
  rank: number
}

/**
 * The three KINDS of medal a mission can yield, held apart rather than
 * counted: LEVEL COMPLETE, SURVIVAL BONUS, and the level's own SPECIAL
 * BONUS pickups. `specials` names the PROPOINTs by the map object's id, so
 * a replay knows which one is still lying out there.
 */
export interface Medals {
  completed: boolean
  survived: boolean
  specials: number[]
}

export interface SaveGame {
  version: number
  /** The team's own name, as the player typed it. */
  name: string
  /** Which of the six nations, 0..5 — the index `lib/game/teams.ts` counts by. */
  nation: number
  /**
   * How far down `CAMPAIGN` the team has got: the position of the mission to
   * play NEXT, and `CAMPAIGN_LENGTH` once there is none. The original keeps
   * exactly this in one byte and ends the campaign when it reaches 26.
   */
  position: number
  /** The nation faced at each position, indexed by position — rolled ONCE at
   * creation, the original's own way (`lib/game/enemies.ts`), and re-stamped
   * with the nation actually fought as each mission ends (0x484F2E). */
  enemies: number[]
  /** Eight slots, always. */
  squad: Pig[]
  /** How many drafts this team has taken — what numbers their names. */
  drafts: number
  /** Unspent PP. */
  tokens: number
  /** Whether the training ground has been PLAYED to its end. Position 0 is
   * CAMP and the player is asked whether to play it at all (the original's
   * record 39, PLAY TRAINING MISSION?); declining steps past it, so this flag
   * is what says the tutorial was finished rather than skipped. */
  tutorial: boolean
  /**
   * WHICH medals each position has yielded, indexed by position - not how
   * many. `[play]`, 2026-08-26: each medal is tied to what it was FOR - the
   * one picked up on the map, the one for finishing, the one for finishing
   * with nobody lost - so a replay can go and fetch the one still missing.
   *
   * A COUNT could not answer that: finishing with the survival bonus and
   * finishing with a pickup instead both read 2, so a replay that took the
   * pickup this time was paid nothing and the medal still out there was
   * unreachable for ever.
   *
   * Sparse holes read as null (`medalsAt`). The remake's own field: the
   * original has no replay and keeps no such record.
   */
  medals: Medals[]
  /**
   * WHO finished each completed position, indexed by position — the fielded
   * pigs as the mission ended, with the ranks they wore then. A REPLAY
   * fields exactly this squad (`[play]`, 2026-08-26: "надо запоминать каким
   * составом миссия завершилась и переигрывать именно тем составом"), not
   * the live roster, which may have marched on. The remake's own field, like
   * `medals`: the original has no replay. Sparse holes read as null
   * (`foughtAt`), and a position with no record cannot be replayed at all.
   */
  fought: FoughtPig[][]
  /** ISO 8601, for the LOAD GAME list to sort and label by. */
  savedAt: string
}

/** A campaign that has been played to the end. */
export const isComplete = (save: SaveGame): boolean => save.position >= CAMPAIGN_LENGTH

/** The medals a position has yielded, or null where nothing is recorded. */
export const medalsAt = (save: SaveGame, position: number): Medals | null =>
  save.medals[position] ?? null

/** How many medals a record holds - what MISSION SELECT prints as `taken`. */
export const medalCount = (medals: Medals | null): number =>
  medals ? (medals.completed ? 1 : 0) + (medals.survived ? 1 : 0) + medals.specials.length : 0

/**
 * What one FINISHED run earned. The training ground pays nothing at all
 * (`paysPoints`), so it earns no medal either - the debrief it is shown
 * after is the remake's own page and must not promise one.
 */
export function medalsWon(position: number, losses: number, specials: readonly number[]): Medals {
  if (!paysPoints(position)) return { completed: false, survived: false, specials: [] }
  return {
    completed: true,
    survived: survivalBonus(position, losses),
    specials: [...new Set(specials)].sort((a, b) => a - b)
  }
}

/** Everything held once a run is added to what already stood. */
export function unionMedals(stood: Medals | null, won: Medals): Medals {
  if (!stood) return won
  return {
    completed: stood.completed || won.completed,
    survived: stood.survived || won.survived,
    specials: [...new Set([...stood.specials, ...won.specials])].sort((a, b) => a - b)
  }
}

/** How many medals a run ADDS to what already stood - what a replay is paid,
 * and zero for a run that only re-earned what the record already held. */
export const gainedOver = (stood: Medals | null, won: Medals): number =>
  medalCount(unionMedals(stood, won)) - medalCount(stood)

/** The squad that finished a position, or null where no record stands — a
 * hole and an empty list both mean "no record", never "field nobody". */
export const foughtAt = (save: SaveGame, position: number): FoughtPig[] | null => {
  const fought = save.fought[position]
  return fought && fought.length > 0 ? fought : null
}

/**
 * A REPLAY finished, and `won` is what it earned. Worth banking only where
 * it holds a medal the record does not: each NEW one pays a token, and the
 * rest were paid when they were first earned. Null when the record already
 * held everything this run managed.
 *
 * This is the whole point of holding the medals apart (`[play]`): a run
 * that finishes with nobody lost, having only ever finished before, earns
 * exactly the SURVIVAL medal - and a count could never have said so.
 */
export function bankReplay(
  save: SaveGame,
  position: number,
  won: Medals,
  now: string
): SaveGame | null {
  const stood = medalsAt(save, position)
  const gained = gainedOver(stood, won)
  if (gained <= 0) return null
  const medals = save.medals.slice()
  medals[position] = unionMedals(stood, won)
  return { ...save, medals, tokens: save.tokens + gained, savedAt: now }
}

/** The map the next mission opens, or null for a finished campaign. */
export const nextMap = (save: SaveGame): string | null => mapAt(save.position)

export function newGame(
  name: string,
  nation: number,
  squad: Pig[],
  now: string,
  enemies: number[] = []
): SaveGame {
  // An unseeded table is the caller's convenience — every campaign still gets
  // a whole one, because half a table is a map nobody can draw.
  const drawn = fillEnemies(nation, enemies, seeded(seedOf(name, nation)))
  return {
    version: SAVE_VERSION,
    name,
    nation,
    position: 0,
    enemies: drawn,
    squad,
    drafts: 0,
    tokens: 0,
    tutorial: false,
    medals: [],
    fought: [],
    savedAt: now
  }
}

/**
 * What winning a mission is worth in promotion points — `[exe]` now, the
 * debrief's one adder (0x484EFF, `debrief/notes.md`):
 *
 *   1 for finishing, +1 for bringing all five through — and FINAL forgives
 *   two down (0x4848F1) — plus every PROPOINT the five picked up on the
 *   field, plus 5 on every fifth position. The training ground never sees
 *   the debrief and pays ZERO.
 *
 * The +5 is the ISLAND bonus in spirit — play: "+5 медалей за закрытие
 * острова вроде" — and the mechanism is literally `% 5`, which is the same
 * thing on the first four islands (5 missions each) and NOT on the tail:
 * the fifth island is four missions and closes UNPAID at position 24, and
 * FINAL (25, an island of its own on the map) pays. `[exe]` for the `% 5`;
 * the naming is play's.
 *
 * The manual's "hidden bonus points" are the PROPOINTs the squad walks over
 * (lib/game/scenery.ts), and the per-position COUNT of them (0x4D3560) is
 * only ever shown, never awarded - what pays is what was actually picked
 * up, which is why `Medals.specials` names them one by one.
 *
 * It reads the MEDALS rather than counting anything itself: one object says
 * both what the tokens are and what the record keeps, so the two can no
 * longer disagree. They did: play found a mission paying two tokens while
 * its row on MISSION SELECT read 1/2.
 */
export function missionReward(position: number, won: Medals): number {
  const fifth = position > 1 && position % 5 === 0 ? 5 : 0
  return medalCount(won) + fifth
}

/**
 * Whether a position pays points at all. The training ground does not: in the
 * exe it never even reaches the debrief (0x47E606 sends CAMP straight to
 * `EndOfMission`), and the one adder that exists lives inside that screen. The
 * remake DOES show the screen after boot camp — `[play]`, the roll call is
 * wanted — so the screen has to ask this before it draws a token, or it
 * promises what `missionReward` refuses to pay.
 */
export const paysPoints = (position: number): boolean => position > 0

/** The "all five through" half of the award, which the debrief also shows as
 * its SURVIVAL BONUS token — FINAL forgives two down (0x4848F1). */
export const survivalBonus = (position: number, losses: number): boolean =>
  position === CAMPAIGN_LENGTH - 1 ? losses < 3 : losses === 0

/**
 * A mission is over: the fallen are settled, the campaign steps on, and the
 * result is what gets written.
 *
 * The order is the original's — the roster is regrouped and only then does the
 * position move (0x450970 does both, in that order) — so a save written here
 * is a squad of eight ready for the mission the position now names.
 *
 * `squad` is the roster as the battle left it, with `fell` set on whoever went
 * down (`lib/game/roster.ts`). `enemy` is the nation that was fought, kept
 * against the position that was played, the way the original keeps it.
 */
export function finishMission(
  save: SaveGame,
  squad: Pig[],
  enemy: number,
  tokens: number,
  now: string,
  /** What the run EARNED, medal by medal - unioned onto whatever the
   * position already held (`unionMedals`). */
  won: Medals = { completed: false, survived: false, specials: [] }
): SaveGame {
  const { squad: next, drafts } = regroup(squad, save.drafts)
  const enemies = save.enemies.slice()
  enemies[save.position] = enemy
  const medals = save.medals.slice()
  medals[save.position] = unionMedals(medalsAt(save, save.position), won)
  // WHO finished it goes on the record too, off the squad as the battle left
  // it — before the regroup, so the fallen are still themselves and the
  // ranks are the ones the mission was fought at. A replay fields this.
  const fought = save.fought.slice()
  fought[save.position] = squad
    .slice(0, fieldedAt(save.position))
    .map(({ name, identity, rank }) => ({ name, identity, rank }))
  return {
    ...save,
    position: Math.min(save.position + 1, CAMPAIGN_LENGTH),
    enemies,
    squad: next,
    drafts,
    tokens,
    medals,
    fought,
    savedAt: now
  }
}

export const serialise = (save: SaveGame): string => JSON.stringify(save, null, 2)

/**
 * Read one back, or null for anything that is not one.
 *
 * A save is a file on a disk the app does not own: it can be truncated, hand
 * edited or left behind by an older build. Everything the rest of the game
 * relies on is checked here so nothing downstream has to — a bad save is
 * "there is no save", which is a state LOAD GAME already has to draw.
 */
export function parse(text: string): SaveGame | null {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const save = raw as Partial<SaveGame>
  if (save.version !== SAVE_VERSION) return null
  if (typeof save.name !== 'string' || typeof save.savedAt !== 'string') return null
  if (!isCount(save.nation) || save.nation > 5) return null
  if (!isCount(save.position) || save.position > CAMPAIGN_LENGTH) return null
  if (!isCount(save.drafts) || !isCount(save.tokens)) return null
  if (!Array.isArray(save.enemies) || !save.enemies.every(isCount)) return null
  if (!Array.isArray(save.squad) || save.squad.length !== SQUAD_SIZE) return null
  if (!save.squad.every(isPig)) return null
  // `deaths` arrived after the shape shipped — the remake's own counter, the
  // original keeps none — so a file from before it holds pigs that simply
  // have not died yet. Repaired here, at the door, like `tutorial`.
  for (const pig of save.squad) if (!isCount(pig.deaths)) pig.deaths = 0
  // `tutorial` arrived after the shape shipped; a file without it is from
  // before the question existed, and the honest answer for it is "not played".
  if (typeof save.tutorial !== 'boolean') save.tutorial = false
  // `medals` is READ, never invented, and never counted back up from the
  // old `best` number: which medal a token stood for is exactly what that
  // number threw away. Malformed rows drop to a hole, which reads as "no
  // record" and lets a replay earn the lot.
  const rows = Array.isArray(save.medals) ? save.medals : []
  save.medals = rows.map((one) =>
    isMedals(one) ? tidyMedals(one) : (undefined as unknown as Medals)
  )
  // `fought` is READ, never invented. A file from before the field existed
  // carries no record, and no record means that position cannot be replayed
  // — the live roster is NOT the squad that fought it (`[play]`,
  // 2026-08-26: "живой ростер может смениться если свины умерли - так что
  // только из сейва"). Malformed rows are dropped to empty, which reads the
  // same as absent; nothing is filled in.
  const recorded = Array.isArray(save.fought) ? save.fought : []
  save.fought = recorded.map((one) =>
    Array.isArray(one) && one.every(isFoughtPig)
      ? one.map(({ name, identity, rank }) => ({ name, identity, rank }))
      : []
  )
  /**
   * A SHORT ENEMY TABLE IS FILLED IN HERE, at the door, because nothing
   * downstream can cope with one and everything downstream believes it.
   *
   * Campaigns begun before the enemies were drawn at birth saved `enemies:
   * []`, and the checks above pass it — `every` over nothing is true. The pig
   * map then read nation 7 for all 25 territories, which is the exe's brown
   * "nobody", and play saw the whole map in one colour. The lesson is not
   * that the map needed a guard: it is that a file was allowed past the
   * parser describing a campaign that cannot exist, and every screen after
   * that was working correctly on nonsense.
   *
   * The draw is SEEDED from the save itself, so it is pure, and so a file
   * that is loaded twice gets the same enemies both times.
   */
  save.enemies = fillEnemies(save.nation, save.enemies, seeded(seedOf(save.name, save.nation)))
  return save as SaveGame
}

/** A stable seed for a save: its team name and army, nothing that moves. */
function seedOf(name: string, nation: number): number {
  let hash = 0x50_49_47_53 ^ nation
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 0x01000193)
  return hash >>> 0
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

function isMedals(value: unknown): value is Medals {
  if (typeof value !== 'object' || value === null) return false
  const medals = value as Partial<Medals>
  return (
    typeof medals.completed === 'boolean' &&
    typeof medals.survived === 'boolean' &&
    Array.isArray(medals.specials) &&
    medals.specials.every(isCount)
  )
}

/** A record off the disk, kept to the fields this shape owns. */
const tidyMedals = (medals: Medals): Medals => ({
  completed: medals.completed,
  survived: medals.survived,
  specials: [...new Set(medals.specials)].sort((a, b) => a - b)
})

function isFoughtPig(value: unknown): value is FoughtPig {
  if (typeof value !== 'object' || value === null) return false
  const pig = value as Partial<FoughtPig>
  return typeof pig.name === 'string' && isCount(pig.identity) && isCount(pig.rank)
}

function isPig(value: unknown): value is Pig {
  if (typeof value !== 'object' || value === null) return false
  const pig = value as Partial<Pig>
  return (
    typeof pig.name === 'string' &&
    isCount(pig.identity) &&
    isCount(pig.rank) &&
    isCount(pig.missions) &&
    isCount(pig.score) &&
    typeof pig.fell === 'number' &&
    Number.isInteger(pig.fell)
  )
}
