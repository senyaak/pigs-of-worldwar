// PHASE 002 (app) — the squads come off the map, not off a search.
//
// A map's .POG carries `*_ME` markers: a position, a facing, a class, and a
// SIDE in the high byte of the flags word (one bit each, six of them for
// the game's six nations). Every shipped map partitions cleanly along it,
// so a battle can be fielded exactly where the original fielded one.
//
// LIBERATE is the map to test on: its two sides are five distinct class
// groups between them (SB, LE, GR against SP and HV), so the class, the
// side and the art all have something to be wrong about.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { swapMap } from '../controller'
import { GAME_DIR } from '../launch'
import { startGame } from '../menu'
import { existsForPlayers, parsePog } from '../../src/lib/formats/pog'
import { MAX_TEAMS, battleSides, mapSpawns, spawnTeams } from '../../src/lib/game/spawns'
import type { SpawnPoint } from '../../src/lib/game/spawns'
import { classArt } from '../../src/renderer/src/three/soldiers'

const pog = (name: string): ReturnType<typeof parsePog> =>
  parsePog(readFileSync(path.join(GAME_DIR, 'Maps', `${name}.POG`)))

test('the sides are one bit each, and every map partitions along them', () => {
  // The skirmish arenas field four sides of five.
  expect(spawnTeams(pog('ARTGUN')).map((side) => side.length)).toEqual([5, 5, 5, 5])
  // A campaign map fields two.
  expect(spawnTeams(pog('LIBERATE')).map((side) => side.length)).toEqual([5, 5])
  // FINAL is the one that uses all six bits — which is what says they ARE
  // six independent bits rather than a number.
  expect(spawnTeams(pog('FINAL')).length).toBe(MAX_TEAMS)

  // The training ground carries exactly one marker, because it is a
  // tutorial and not a battle — and that ONE side is what it fields.
  expect(mapSpawns(pog('CAMP'))).toHaveLength(1)
  expect(battleSides(pog('CAMP'), 2).map((side) => side.length)).toEqual([1])
})

test('a map does not field the same squad in every game', () => {
  // BOOM stacks two sets of markers on one side — and the low byte of the
  // flags is what tells them apart. Read whole, side 2 looks like ten pigs.
  expect(spawnTeams(pog('BOOM')).map((side) => side.length)).toEqual([5, 10, 5, 5])

  // The loader's own test sorts them out, and what falls out is the
  // campaign against the skirmish: ONE player gets two sides, a squad
  // against five snipers; two or more get the arena's four sides of five
  // grunts. The snipers and the grunts stand on the very same spots.
  const forPlayers = (players: number): SpawnPoint[][] =>
    spawnTeams(pog('BOOM').filter((object) => existsForPlayers(object, players)))
  expect(forPlayers(1).map((side) => side.length)).toEqual([5, 5])
  expect(forPlayers(1)[1].map((at) => at.marker)).toEqual(Array(5).fill('SN_ME'))
  for (const players of [2, 3, 4]) {
    expect(forPlayers(players).map((side) => side.length)).toEqual([5, 5, 5, 5])
    expect(forPlayers(players)[1].map((at) => at.marker)).toEqual(Array(5).fill('GR_ME'))
  }
  // The same five spots, in whatever order the file lists them.
  const spots = (side: SpawnPoint[]): string[] =>
    side.map((at) => `${at.x},${at.z}`).sort()
  expect(spots(forPlayers(1)[1])).toEqual(spots(forPlayers(2)[1]))
})

test('a marker carries the class, and the class picks the art', () => {
  const [first, second] = battleSides(pog('LIBERATE'), 2)

  // Names and classes agree, marker by marker — the class list from gtext
  // index 63: Grunt 0, Sapper 5, Sniper 9, Spy 10, Hero 14.
  expect(first.map((at) => at.marker)).toEqual(['SB_ME', 'LE_ME', 'GR_ME', 'GR_ME', 'GR_ME'])
  expect(first.map((at) => at.pigClass)).toEqual([10, 14, 0, 0, 0])
  expect(second.map((at) => at.marker)).toEqual(['SP_ME', 'SP_ME', 'HV_ME', 'SP_ME', 'SP_ME'])

  // Each class group has its own model in Chars/british.mad.
  expect(first.map((at) => classArt(at.pigClass))).toEqual([
    'pcsab_hi',
    'pcleg_hi',
    'pcgru_hi',
    'pcgru_hi',
    'pcgru_hi'
  ])
  expect(second.map((at) => classArt(at.pigClass))).toEqual([
    'pcspy_hi',
    'pcspy_hi',
    'pchvy_hi',
    'pcspy_hi',
    'pcspy_hi'
  ])
})

test('the battle fields the map’s own squads, dressed by class', async ({ app }) => {
  const { page } = app
  await startGame(page)
  await expect(page.locator('#battle')).toBeVisible()

  // The training ground fields exactly what it carries: one side, one pig,
  // standing on its own marker. Nothing is invented to face it.
  const onCamp = await page.evaluate(() => window.pow!.debug!.squads())
  expect(onCamp.map((squad) => squad.pigs.length)).toEqual([1])
  const trainee = mapSpawns(pog('CAMP'))[0]
  expect(onCamp[0].pigs[0]).toMatchObject({
    art: 'pcgru_hi',
    pigClass: trainee.pigClass,
    x: trainee.x,
    z: trainee.z
  })

  expect(await swapMap(page, 'LIBERATE')).toBe(true)
  const squads = await page.evaluate(() => window.pow!.debug!.squads())
  expect(squads.map((squad) => squad.pigs.length)).toEqual([5, 5])
  expect(squads[0].pigs.map((pig) => pig.art)).toEqual([
    'pcsab_hi',
    'pcleg_hi',
    'pcgru_hi',
    'pcgru_hi',
    'pcgru_hi'
  ])

  // Every pig stands on the marker that named it — position and facing.
  const sides = battleSides(pog('LIBERATE'), 2)
  for (const [index, squad] of squads.entries()) {
    expect(squad.pigs.map((pig) => [pig.x, pig.z])).toEqual(
      sides[index].map((at) => [at.x, at.z])
    )
    expect(squad.pigs.map((pig) => pig.heading)).toEqual(sides[index].map((at) => at.heading))
  }

  expect(app.errors()).toEqual([])
  // Leave the app on the map the rest of the phase expects.
  expect(await swapMap(page, 'CAMP')).toBe(true)
})
