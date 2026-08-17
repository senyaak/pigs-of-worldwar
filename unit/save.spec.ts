// PHASE 002 (domain) — the campaign's order, the roster between missions, and
// the save. Pure, no Electron, no installation.
//
// The tables are the exe's (`army/notes.md` in the disasm repo): the campaign
// order at 0x4D17F0 indexed by the save's own position byte, a roster of eight
// that is eight again before every mission, and DRAFT off `fetext` 0x113.

import { test, expect } from '@playwright/test'

import { CAMPAIGN, CAMPAIGN_LENGTH, MAP_NAMES, mapAt, mapId, missionNameIndex } from '../src/lib/game/missions'
import { RETURNING, SQUAD_SIZE, fall, newSquad, regroup, standing, standingCount } from '../src/lib/game/roster'
import {
  finishMission,
  isComplete,
  missionReward,
  newGame,
  nextMap,
  parse,
  serialise
} from '../src/lib/game/save'
import { LARD, drawEnemies } from '../src/lib/game/enemies'

const NAMES = ['JONES', 'DEN', 'BASIL', 'GINGER', 'MONTY', 'SMITH', 'PONSONBY', 'PERCY']
const squadOf = (): ReturnType<typeof newSquad> => newSquad(NAMES, [8, 2, 4, 1, 3, 7, 5, 6])

test('the campaign is 26 missions, CAMP first and FINAL last', { tag: '@nodata' }, () => {
  expect(CAMPAIGN_LENGTH).toBe(26)
  expect(mapAt(0)).toBe('CAMP')
  expect(mapAt(1)).toBe('ESTU')
  expect(mapAt(CAMPAIGN_LENGTH - 1)).toBe('FINAL')
  expect(mapAt(CAMPAIGN_LENGTH)).toBeNull()
})

test('every campaign map appears once — 0..24 plus ESTU', { tag: '@nodata' }, () => {
  expect(new Set(CAMPAIGN).size).toBe(CAMPAIGN.length)
  for (let id = 0; id <= 24; id++) expect(CAMPAIGN).toContain(id)
  expect(CAMPAIGN).toContain(mapId('ESTU'))
  expect(MAP_NAMES).toHaveLength(59)
})

test('a mission name is gtext 11 + the map id, and only for the campaign', { tag: '@nodata' }, () => {
  // BOOT CAMP, which ui/titleCard.ts had hard-coded at 11 + 10 before the
  // campaign's order was read — CAMP's map id IS 10.
  expect(missionNameIndex('CAMP')).toBe(21)
  expect(missionNameIndex('FINAL')).toBe(35)
  // The first real mission's name overruns into the block after the 25.
  expect(missionNameIndex('ESTU')).toBe(36)
  // A skirmish arena is not in the campaign and has no card.
  expect(missionNameIndex('ARTGUN')).toBe(-1)
  expect(missionNameIndex('NOSUCHMAP')).toBe(-1)
})

test('a squad is eight, and it is eight again after a mission', { tag: '@nodata' }, () => {
  const squad = squadOf()
  expect(squad).toHaveLength(SQUAD_SIZE)
  expect(standingCount(squad)).toBe(SQUAD_SIZE)

  fall(squad, 3)
  fall(squad, 5)
  fall(squad, 0)
  expect(standingCount(squad)).toBe(5)

  const { squad: next, drafts, returned } = regroup(squad, 0)
  expect(next).toHaveLength(SQUAD_SIZE)
  expect(standingCount(next)).toBe(SQUAD_SIZE)
  // Three went down and the last RETURNING of them get up — in slot order.
  expect(returned).toEqual([0, 5])
  expect(drafts).toBe(3 - RETURNING)
})

test('the fallen who stay down are replaced by DRAFTs at the BACK', { tag: '@nodata' }, () => {
  const squad = squadOf()
  fall(squad, 3)
  fall(squad, 5)
  fall(squad, 0)
  const { squad: next } = regroup(squad, 0)
  // JONES and SMITH were the last two down and kept their names and their
  // place; GINGER — slot 3, the first to fall — is gone for good.
  expect(next.map((pig) => pig.name)).toEqual([
    'JONES', 'DEN', 'BASIL', 'MONTY', 'SMITH', 'PONSONBY', 'PERCY', 'DRAFT1'
  ])
  expect(next.every(standing)).toBe(true)
  // The identity a draft takes is one nobody in the squad is using.
  expect(new Set(next.map((pig) => pig.identity)).size).toBe(SQUAD_SIZE)
})

test('the drafts keep counting for the life of the campaign', { tag: '@nodata' }, () => {
  let squad = squadOf()
  let drafts = 0
  for (let mission = 0; mission < 3; mission++) {
    fall(squad, 0)
    fall(squad, 1)
    fall(squad, 2)
    ;({ squad, drafts } = regroup(squad, drafts))
  }
  expect(drafts).toBe(3)
  expect(squad.map((pig) => pig.name)).toContain('DRAFT3')
  expect(squad.filter((pig) => pig.name.startsWith('DRAFT'))).toHaveLength(3)
})

test('a finished mission steps the campaign and regroups, in that order', { tag: '@nodata' }, () => {
  const save = newGame("TOMMY'S TROTTERS", 0, squadOf(), '2026-08-13T00:00:00.000Z')
  expect(save.position).toBe(0)
  expect(nextMap(save)).toBe('CAMP')

  const squad = save.squad
  fall(squad, 7)
  const after = finishMission(save, squad, 2, 5, '2026-08-13T00:30:00.000Z')
  expect(after.position).toBe(1)
  expect(nextMap(after)).toBe('ESTU')
  expect(after.enemies[0]).toBe(2)
  expect(after.tokens).toBe(5)
  // One went down and one came back: the roster is untouched and nobody was
  // drafted.
  expect(after.drafts).toBe(0)
  expect(after.squad.map((pig) => pig.name)).toEqual(NAMES)
})

test('a campaign ends at 26 and the position stops there', { tag: '@nodata' }, () => {
  let save = newGame('TEAM', 0, squadOf(), '2026-08-13T00:00:00.000Z')
  for (let mission = 0; mission < CAMPAIGN_LENGTH; mission++) {
    expect(isComplete(save)).toBe(false)
    save = finishMission(save, save.squad, 1, 0, '2026-08-13T00:00:00.000Z')
  }
  expect(isComplete(save)).toBe(true)
  expect(nextMap(save)).toBeNull()
  save = finishMission(save, save.squad, 1, 0, '2026-08-13T00:00:00.000Z')
  expect(save.position).toBe(CAMPAIGN_LENGTH)
})

test('a save goes out and comes back, and rubbish comes back as nothing', { tag: '@nodata' }, () => {
  const save = newGame("TOMMY'S TROTTERS", 3, squadOf(), '2026-08-13T00:00:00.000Z')
  expect(parse(serialise(save))).toEqual(save)

  expect(parse('')).toBeNull()
  expect(parse('null')).toBeNull()
  expect(parse('{"version":99}')).toBeNull()
  expect(parse(serialise({ ...save, nation: 6 }))).toBeNull()
  expect(parse(serialise({ ...save, position: CAMPAIGN_LENGTH + 1 }))).toBeNull()
  expect(parse(serialise({ ...save, squad: save.squad.slice(1) }))).toBeNull()
})

test('a save from before the tutorial question answers "not played"', { tag: '@nodata' }, () => {
  const save = newGame('OLD GUARD', 0, squadOf(), '2026-08-13T00:00:00.000Z')
  const aged = JSON.parse(serialise(save)) as Record<string, unknown>
  delete aged.tutorial
  expect(parse(JSON.stringify(aged))).toEqual({ ...save, tutorial: false })
})

test('the award is the debrief adder: finish, five through, fifths — CAMP pays zero', { tag: '@nodata' }, () => {
  // The training ground never sees the debrief (0x47E606).
  expect(missionReward(0, 0)).toBe(0)
  // An ordinary win: one for the level, one more with all five through.
  expect(missionReward(2, 0)).toBe(2)
  expect(missionReward(2, 1)).toBe(1)
  // Every fifth position pays five on top — 5, 10, 15, 20, 25.
  expect(missionReward(5, 0)).toBe(7)
  expect(missionReward(10, 3)).toBe(6)
  // FINAL (position 25) forgives two down, and is itself a fifth.
  expect(missionReward(25, 2)).toBe(7)
  expect(missionReward(25, 3)).toBe(6)
  // The hidden bonuses are the PROPOINTs actually picked up.
  expect(missionReward(2, 0, 3)).toBe(5)
})

test('the enemies are drawn at birth: balanced, never you, LARD last', { tag: '@nodata' }, () => {
  // A seeded LCG, so the roll is the same every run — lib/game takes chance
  // as a port and never reaches for Math.random itself.
  let seed = 1
  const rand = (): number => {
    seed = (seed * 48271) % 2147483647
    return seed / 2147483647
  }
  for (let own = 0; own < 6; own++) {
    const enemies = drawEnemies(own, rand)
    expect(enemies).toHaveLength(26)
    // The training ground carries the launcher's own fallback.
    expect(enemies[0]).toBe((own + 1) % 6)
    // FINAL is always Team Lard.
    expect(enemies[25]).toBe(LARD)
    // Positions 1..24: never the player's own nation, never LARD, and the
    // balance holds — the roll gives five of each of the five others over
    // 1..25 and FINAL's overwrite takes one back, so four or five each.
    const middle = enemies.slice(1, 25)
    expect(middle).toHaveLength(24)
    expect(middle).not.toContain(own)
    expect(middle).not.toContain(LARD)
    for (let nation = 0; nation < 6; nation++) {
      if (nation === own) continue
      const count = middle.filter((enemy) => enemy === nation).length
      expect(count).toBeGreaterThanOrEqual(4)
      expect(count).toBeLessThanOrEqual(5)
    }
  }
})
