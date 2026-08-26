// THE CAMPAIGN IN PLAY — the one save the renderer is living in, and every
// change it goes through between the menu and a mission.
//
// The rules are `lib/game/save.ts` and `lib/game/roster.ts`; this module is
// the STATE — which slot the campaign writes, what the save says right now,
// and the one mission result that is waiting to be accepted or thrown away.
// `main.ts` stays the composition root: it decides which screen to show, this
// decides what is true when it asks.
//
// **The original keeps EIGHT slots**, `savearmy0..7` — `sprintf("%s%d")` at
// 0x42C3E7, and the no-save arm at 0x42C52D walks exactly that range
// (`army/notes.md`). Ours are the same eight names holding JSON instead of the
// exe's 680-byte struct, which is the shape `lib/game/save.ts` owns.
//
// **A won mission is not written until it is ACCEPTED** (`[play]`): the
// debrief offers REPLAY to a player unhappy with the result, and a replay must
// find the squad as the mission found it — so `finishMission` runs into
// `pending` and only `acceptMission` writes it over the live save.

import {
  bankReplay,
  finishMission,
  medalsWon,
  missionReward,
  newGame,
  parse,
  serialise,
  type Medals,
  type SaveGame
} from '../../lib/game/save'
import { drawEnemies } from '../../lib/game/enemies'
import { bootCampEnemy } from '../../lib/game/nations'
import { credit, standingCount, SQUAD_SIZE, type Pig } from '../../lib/game/roster'
import { fieldedAt } from '../../lib/game/missions'

/** The eight slot names, the original's own. */
export const SLOTS = Array.from({ length: 8 }, (_, i) => `savearmy${i}`)

let slot: string | null = null
let save: SaveGame | null = null
let pending: SaveGame | null = null

/** The save as it stands, or null outside a campaign. */
export const current = (): SaveGame | null => save

/** The result waiting on the debrief, or null when nothing is. */
export const afterMission = (): SaveGame | null => pending

const write = async (): Promise<void> => {
  if (!slot || !save) return
  const wrote = await window.api.writeSave(slot, serialise(save))
  // A save that will not write does NOT stop the game — the player asked to
  // play, not to write files. It is worth a line in the console and no more.
  if (!wrote.ok) console.warn(`campaign: the save would not write (${wrote.error})`)
}

/** Every slot that holds a readable save, newest first — LOAD GAME's list. */
export async function listCampaigns(): Promise<{ slot: string; save: SaveGame }[]> {
  const listed = await window.api.listSaves()
  if (!listed.ok) return []
  return listed.saves
    .filter((file) => SLOTS.includes(file.name))
    .map((file) => ({ slot: file.name, save: parse(file.text) }))
    .filter((entry): entry is { slot: string; save: SaveGame } => entry.save !== null)
}

/**
 * Start a fresh campaign in the first FREE slot — or, all eight taken, over
 * the oldest, which is the listing's last (`src/main/saves.ts` sorts newest
 * first). The original makes the player pick a slot on a SAVE ARMY screen;
 * ours autosaves, so the slot is picked here and kept for the campaign's life.
 */
export async function begin(name: string, nation: number, squad: Pig[]): Promise<SaveGame> {
  const listed = await window.api.listSaves()
  const taken = listed.ok ? listed.saves.map((file) => file.name) : []
  slot = SLOTS.find((name_) => !taken.includes(name_)) ?? taken[taken.length - 1] ?? SLOTS[0]
  // The whole campaign's enemies are decided HERE, the original's own way —
  // rolled at the team's birth, balanced, FINAL always Team Lard.
  save = newGame(name, nation, squad, new Date().toISOString(), drawEnemies(nation, Math.random))
  pending = null
  await write()
  return save
}

/** Take up a loaded save: LOAD GAME chose it, this is now the campaign. */
export function adopt(from: { slot: string; save: SaveGame }): SaveGame {
  slot = from.slot
  save = from.save
  pending = null
  return save
}

/**
 * The mission was WON: work out what that RESULT is — the settled roster, the
 * stepped campaign, the tokens — and hold it for the debrief.
 *
 * **It is named for what it returns because it writes nothing.** `save` is not
 * touched and the disk is not touched; the result waits in `pending` until
 * CONTINUE takes it through `acceptMission`, which is the only reason RETRY
 * and EDIT SQUAD have nothing to undo (`docs/history/turns.md`). The four
 * writers in this file are `begin`, `acceptMission`, `amend` and
 * `skipTutorial`, and this is not one of them.
 *
 * The tokens earned are the manual's own rule; the
 * enemy nation comes off the table the campaign was born with (`enemies.ts`),
 * with the training ground's `(own + 1) % 6` covering a loaded save from
 * before the table existed.
 *
 * The squad handed in is the roster as the battle left it: `main.ts` has
 * already stamped the battle's dead onto it with `fall`, in the order they
 * went down, so the losses counted here are the mission's own. `kills` is the
 * battle's tally by slot, and `credit` puts it on the record — the mission
 * played and the kills taken, for every pig that was fielded — before the
 * roster regroups, the original's own order (`Team::EndOfMission`).
 */
export function missionWonResult(
  kills: readonly number[] = [],
  points: readonly number[] = []
): SaveGame | null {
  if (!save) return null
  const losses = SQUAD_SIZE - standingCount(save.squad)
  // WHAT was earned, medal by medal - one object answers both the tokens
  // paid and the record kept, so the two can no longer disagree.
  const medals = medalsWon(save.position, losses, points)
  const won = finishMission(
    save,
    credit(save.squad, fieldedAt(save.position), kills),
    save.enemies[save.position] ?? bootCampEnemy(save.nation),
    save.tokens + missionReward(save.position, medals),
    new Date().toISOString(),
    medals
  )
  // Winning the training ground is what sets the tutorial flag.
  pending = save.position === 0 ? { ...won, tutorial: true } : won
  return pending
}

/** The debrief took the result: it becomes the save and goes to disk. */
export async function acceptMission(): Promise<SaveGame | null> {
  if (!pending) return save
  save = pending
  pending = null
  await write()
  return save
}

/** The debrief chose REPLAY (or the mission was lost): the result is thrown
 * away and the save stands as the mission found it — the battle's fall marks
 * included, because a replay fields the whole front line again and a lost
 * mission writes nothing (the manual's "do the level all over again"). */
export const discardMission = (): void => {
  pending = null
  if (save) save = { ...save, squad: save.squad.map((pig) => ({ ...pig, fell: -1 })) }
}

/**
 * A MISSION SELECT replay came back WON, and `won` is the medals it earned.
 * The roster is put back the way the mission found it - a replay is
 * consequence-free: no deaths, no battles-and-kills credit, no campaign step.
 * What it can win is a MEDAL THE RECORD DOES NOT HOLD: each new one pays a
 * token and joins the record (`bankReplay`, lib/game/save.ts). `[play]`,
 * 2026-08-26 - the medals are held apart precisely so a second run can go
 * and fetch the one that is still missing.
 */
export async function bankReplayResult(
  position: number,
  won: Medals
): Promise<SaveGame | null> {
  discardMission()
  if (!save) return null
  const banked = bankReplay(save, position, won, new Date().toISOString())
  if (!banked) return save
  save = banked
  await write()
  return save
}

/**
 * A squad edit off the pig menu — promote, rename, swap (`lib/game/promotion`)
 * — applied to the live save and AUTOSAVED at once: the original waits for
 * SAVE TEAM, which the remake deliberately does not have, and an edit is a
 * decision the same way declining the tutorial is. A refused edit (null from
 * the rule) writes nothing and returns null so the screen can say no.
 */
export async function amend(edit: (save: SaveGame) => SaveGame | null): Promise<SaveGame | null> {
  if (!save) return null
  const changed = edit(save)
  if (!changed) return null
  save = { ...changed, savedAt: new Date().toISOString() }
  await write()
  return save
}

/**
 * The player declined the training ground: the campaign steps past position 0
 * with no reward and no roster change, and the tutorial flag stays down —
 * skipped is not finished. **The step is the exe's own** (0x42C37E writes
 * `team[0x53] = 1` on record 39's NO and launches); written at once because a
 * decline is a decision, which the original cannot do — it has no autosave.
 */
export async function skipTutorial(): Promise<SaveGame | null> {
  if (!save || save.position !== 0) return save
  save = { ...save, position: 1, savedAt: new Date().toISOString() }
  await write()
  return save
}
