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

import { CAMPAIGN_LENGTH, mapAt } from './missions'
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
  /** The nation faced at each position already played, indexed by position. */
  enemies: number[]
  /** Eight slots, always. */
  squad: Pig[]
  /** How many drafts this team has taken — what numbers their names. */
  drafts: number
  /** Unspent PP. */
  tokens: number
  /** ISO 8601, for the LOAD GAME list to sort and label by. */
  savedAt: string
}

/** A campaign that has been played to the end. */
export const isComplete = (save: SaveGame): boolean => save.position >= CAMPAIGN_LENGTH

/** The map the next mission opens, or null for a finished campaign. */
export const nextMap = (save: SaveGame): string | null => mapAt(save.position)

export function newGame(name: string, nation: number, squad: Pig[], now: string): SaveGame {
  return {
    version: SAVE_VERSION,
    name,
    nation,
    position: 0,
    enemies: [],
    squad,
    drafts: 0,
    tokens: 0,
    savedAt: now
  }
}

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
  now: string
): SaveGame {
  const { squad: next, drafts } = regroup(squad, save.drafts)
  const enemies = save.enemies.slice()
  enemies[save.position] = enemy
  return {
    ...save,
    position: Math.min(save.position + 1, CAMPAIGN_LENGTH),
    enemies,
    squad: next,
    drafts,
    tokens,
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
  return save as SaveGame
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
