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
import { CAMPAIGN_LENGTH, mapAt } from './missions'
import { seeded } from './random'
import { regroup, SQUAD_SIZE, type Pig } from './roster'

/** Bumped when the shape changes in a way an older file cannot be read as. */
export const SAVE_VERSION = 1

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
   * The PROPOINT pickups taken at each COMPLETED position, indexed by
   * position — the record MISSION SELECT replays against (`[play]`,
   * 2026-08-24: "при прохождении если число больше того что было —
   * сохраняется новое и добавляются PP"). The remake's own field: the
   * original has no replay and keeps no such record. Sparse holes read as
   * zero (`bestAt`).
   */
  best: number[]
  /** ISO 8601, for the LOAD GAME list to sort and label by. */
  savedAt: string
}

/** A campaign that has been played to the end. */
export const isComplete = (save: SaveGame): boolean => save.position >= CAMPAIGN_LENGTH

/** The PROPOINT record at a position — a hole is an honest zero (a mission
 * finished before the field existed, or with nothing picked up). */
export const bestAt = (save: SaveGame, position: number): number => save.best[position] ?? 0

/**
 * A REPLAY came back with `points` pickups: worth banking only past the
 * record, and worth exactly the difference — the points already banked were
 * paid when they were first earned. Null when the record stands.
 */
export function bankReplay(
  save: SaveGame,
  position: number,
  points: number,
  now: string
): SaveGame | null {
  const stood = bestAt(save, position)
  if (points <= stood) return null
  const best = save.best.slice()
  best[position] = points
  return { ...save, best, tokens: save.tokens + (points - stood), savedAt: now }
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
    best: [],
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
 * `pickups` waits on the PROPOINT crate being built (`[gap]`); the manual's
 * "hidden bonus points" are exactly those pickups, and the per-position
 * count of them (0x4D3560) is only ever shown, never awarded.
 */
export function missionReward(position: number, losses: number, pickups = 0): number {
  if (position === 0) return 0
  const fifth = position > 1 && position % 5 === 0 ? 5 : 0
  return missionScore(position, losses, pickups) + fifth
}

/**
 * The MISSION'S OWN score — the reward less the every-fifth bounty, which
 * belongs to the campaign's march rather than to the mission. This is what
 * the RECORD keeps and what MISSION SELECT prints over `2 + bonusPoints`:
 * play caught the record counting pickups alone ("the war foundation
 * показывает 0/0 — не учитываются за прохождение уровня и за прохождение
 * без смертей").
 */
export function missionScore(position: number, losses: number, pickups = 0): number {
  if (position === 0) return 0
  return 1 + (survivalBonus(position, losses) ? 1 : 0) + pickups
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
  /** The mission's own score (`missionScore`) — the record MISSION SELECT
   * replays against (`best`). */
  earned = 0
): SaveGame {
  const { squad: next, drafts } = regroup(squad, save.drafts)
  const enemies = save.enemies.slice()
  enemies[save.position] = enemy
  const best = save.best.slice()
  best[save.position] = Math.max(bestAt(save, save.position), earned)
  return {
    ...save,
    position: Math.min(save.position + 1, CAMPAIGN_LENGTH),
    enemies,
    squad: next,
    drafts,
    tokens,
    best,
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
  // `best` arrived with MISSION SELECT (2026-08-24); a file without it is
  // from before replays existed, and every record it would hold is zero.
  // Normalised element-wise rather than rejected whole: a sparse write
  // serialises its holes as JSON nulls, and one null must not cost the
  // other twenty-five records.
  save.best = Array.isArray(save.best) ? save.best.map((one) => (isCount(one) ? one : 0)) : []
  // …and a record UNDER what completion alone pays is from the days `best`
  // counted pickups only: a position the campaign is PAST was finished, and
  // finishing is a point, so the floor is 1. The survival point cannot be
  // recovered — a replay re-earns it. Pure: seeded off the save itself.
  for (let p = 1; p < save.position; p++) save.best[p] = Math.max(save.best[p] ?? 0, 1)
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
