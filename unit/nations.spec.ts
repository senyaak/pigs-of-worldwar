// PHASE 002 (domain) — who wears what. Pure, no Electron, no installation.
//
// Three numbers get confused with each other and the game keeps them apart:
// the NATION a player picks, the SKIN every piece of art is indexed by, and
// the SLOT a map's spawn markers sit in. `Team::SkinOf` (0x4508E0) converts
// the first into the second; nothing converts the third into either.

import { test, expect } from '@playwright/test'

import {
  LARD,
  NATIONS,
  SKIN_ARCHIVES,
  SKIN_COLOURS,
  SKIN_HATS,
  bootCampEnemy,
  skinOf
} from '../src/lib/game/nations'
import { NATION_COLOURS, nationArt, nationColour } from '../src/lib/game/pigmap'
import { mapSquads } from '../src/lib/game/muster'
import { spawnTeams } from '../src/lib/game/spawns'
import type { MapObject } from '../src/lib/formats/pog'
import type { Team } from '../src/lib/game/teams'

/** A spawn marker on `side`, optionally the campaign's own (record 0x58 bit 0). */
const marker = (side: number, player: boolean, x = 0): MapObject => {
  const fields = new Int16Array(31)
  fields[28] = player ? 1 : 0
  return {
    name: 'GR_ME',
    id: x,
    type: 0,
    x,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    shape: 0,
    box: { x: 0, y: 0, z: 0 },
    flags: 1 << (8 + side),
    contents: null,
    fields
  } as unknown as MapObject
}

const teamList = (): Team[] =>
  ['BRITISH', 'FRENCH', 'AMERICAN', 'RUSSIAN', 'JAPANESE', 'GERMAN'].map((name) => ({
    name,
    pigNames: ['ONE', 'TWO']
  }))

test('a nation is not its skin, and the remap is the exe\'s own', { tag: '@nodata' }, () => {
  // Nation order: British, French, American, Russian, Japanese, German, Lard.
  // Skin order:   British, American, French, German, Russian, Japanese, Lard.
  expect([0, 1, 2, 3, 4, 5, 6].map(skinOf)).toEqual([0, 2, 1, 4, 5, 3, 6])
  // French is nation 1 and skin 2; American is nation 2 and skin 1 — the pair
  // that crosses over, and the reason indexing art by the nation is a bug.
  expect(skinOf(1)).toBe(2)
  expect(skinOf(2)).toBe(1)
  // Anything out of range is Lard, exactly as 0x450919 clamps — including the
  // 100 an uninitialised team record carries.
  expect(skinOf(-1)).toBe(LARD)
  expect(skinOf(7)).toBe(LARD)
  expect(skinOf(100)).toBe(LARD)
})

test('the art tables are all in SKIN order and all agree on their length', { tag: '@nodata' }, () => {
  expect(SKIN_ARCHIVES).toHaveLength(LARD + 1)
  expect(SKIN_HATS).toHaveLength(LARD + 1)
  expect(SKIN_ARCHIVES[skinOf(1)]).toContain('FRENCH')
  expect(SKIN_ARCHIVES[skinOf(2)]).toContain('AMERICAN')
  expect(SKIN_ARCHIVES[skinOf(LARD)]).toContain('TEAMLARD')
  expect(SKIN_HATS[skinOf(5)]).toBe('germh')
  // The marker colours stop at six: there is no Lard entry in either the exe's
  // table or the library's.
  expect(SKIN_COLOURS).toHaveLength(NATIONS)
  // Russia is nation 3, skin 4, red; Japan is nation 4, skin 5, yellow.
  expect(SKIN_COLOURS[skinOf(3)]).toEqual([255, 0, 0])
  expect(SKIN_COLOURS[skinOf(4)]).toEqual([255, 255, 0])
})

test('the pig map paints a territory by the same remap', { tag: '@nodata' }, () => {
  // `nationArt` IS `skinOf` now rather than a second copy of the table.
  expect(nationArt).toBe(skinOf)
  // French land takes the THIRD colour and American the second — the crossover
  // again, and the whole reason this remap exists.
  expect(nationColour(1)).toEqual(NATION_COLOURS[2])
  expect(nationColour(2)).toEqual(NATION_COLOURS[1])
  // Anything that is not a nation is the brown "nobody", one past Lard.
  expect(nationColour(99)).toEqual(NATION_COLOURS[7])
  expect(nationColour(-1)).toEqual(NATION_COLOURS[7])
})

test('the boot camp fields the nation after yours, wrapping', { tag: '@nodata' }, () => {
  expect(bootCampEnemy(0)).toBe(1)
  expect(bootCampEnemy(5)).toBe(0)
  // It never fields Lard, because it never leaves the six.
  for (let nation = 0; nation < NATIONS; nation++) {
    expect(bootCampEnemy(nation)).toBeLessThan(NATIONS)
    expect(bootCampEnemy(nation)).not.toBe(nation)
  }
})

test('the CAMPAIGN\'s own side comes first, even when its slot does not', { tag: '@nodata' }, () => {
  // DEVI's shape: slots 2 and 4, no slot 0, and the scripted flag on 4.
  const devi = [marker(2, false, 1), marker(2, false, 2), marker(4, true, 3), marker(4, true, 4)]
  const sides = spawnTeams(devi)
  expect(sides[0].map((spawn) => spawn.team)).toEqual([4, 4])
  expect(sides[1].map((spawn) => spawn.team)).toEqual([2, 2])
  // …and on an ordinary map the scripted side is already the lowest, so
  // nothing moves.
  const road = [marker(0, true, 1), marker(0, true, 2), marker(5, false, 3), marker(5, false, 4)]
  expect(spawnTeams(road)[0].map((spawn) => spawn.team)).toEqual([0, 0])
})

test('the squads wear what they are HANDED, not what the map slots them in', { tag: '@nodata' }, () => {
  const devi = [marker(2, false, 1), marker(2, false, 2), marker(4, true, 3), marker(4, true, 4)]
  // A British player against the Germans, on a map whose slots are 2 and 4.
  const squads = mapSquads(devi, teamList(), [0, 5])
  expect(squads.map((squad) => squad.nation)).toEqual([0, 5])
  expect(squads.map((squad) => squad.name)).toEqual(['BRITISH', 'GERMAN'])
  expect(squads.map((squad) => skinOf(squad.nation))).toEqual([0, 3])
})

test('handed nothing, a side falls back on its own position', { tag: '@nodata' }, () => {
  // What a battle opened from the console gets, and what the headless spec
  // runs on: no campaign behind it, so no chosen uniforms.
  const road = [marker(0, true, 1), marker(0, true, 2), marker(5, false, 3), marker(5, false, 4)]
  expect(mapSquads(road, teamList(), []).map((squad) => squad.nation)).toEqual([0, 1])
})
