// PHASE 002 (domain) — the KILL COUNTER. Pure, no Electron, no installation.
//
// A kill carries its attacker: the exe's damage handler tallies every kill
// against the pig whose weapon it was (0x467c30, 0x467E11), and the remake
// says the same thing on the bus — `killed` events carry `by` where a weapon
// has an owner, and nothing where the map did it (water, a minefield). The
// campaign then puts the tally on the record: `credit` in lib/game/roster.ts
// is `Team::EndOfMission`'s two adders, missions++ and score += kills.

import { test, expect } from '@playwright/test'

import { Game } from '../src/lib/game/game'
import { NO_BODY } from '../src/lib/game/body'
import { burst } from '../src/lib/game/blast'
import { blastReach } from '../src/lib/game/grenade'
import { createBus } from '../src/lib/game/events'
import type { BattleEvent } from '../src/lib/game/events'
import { credit, newSquad } from '../src/lib/game/roster'

const twoPigs = (): Game =>
  new Game({
    players: [
      { name: 'OURS', pigNames: ['KILLER'] },
      { name: 'THEIRS', pigNames: ['VICTIM'] }
    ],
    spawns: [
      { x: 0, z: 0, body: NO_BODY },
      { x: 2000, z: 0, body: NO_BODY }
    ]
  })

test("a blast's kill names its attacker, and a mine's names nobody", { tag: '@nodata' }, () => {
  const game = twoPigs()
  const killer = game.players[0].pigs[0]
  const victim = game.players[1].pigs[0]
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))

  // A grenade's burst, owner threaded through — a hundred points on a grunt
  // of fifty is a death, and the `killed` it announces carries the thrower.
  burst(
    { x: victim.position.x, y: victim.position.y, z: victim.position.z },
    { damage: 12800, reach: blastReach(1024) },
    { pigs: () => [victim], targets: [], present: () => true, training: false },
    bus.emit,
    killer.id
  )
  expect(heard.find((event) => event.kind === 'killed')).toMatchObject({
    pig: victim.id,
    by: killer.id
  })

  // A MINE passes no owner — the map's own weapon — and its kill blames nobody.
  const again = twoPigs()
  const mined = again.players[1].pigs[0]
  const heardMine: BattleEvent[] = []
  const busMine = createBus()
  busMine.on((event) => heardMine.push(event))
  burst(
    { x: mined.position.x, y: mined.position.y, z: mined.position.z },
    { damage: 12800, reach: blastReach(1024) },
    { pigs: () => [mined], targets: [], present: () => true, training: false },
    busMine.emit
  )
  const killed = heardMine.find((event) => event.kind === 'killed')
  expect(killed).toMatchObject({ pig: mined.id })
  expect((killed as { by?: number }).by).toBeUndefined()
})

test('a mission on the record: the fielded count it, and the kills land by slot', { tag: '@nodata' }, () => {
  const squad = newSquad(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], [])
  const after = credit(squad, 3, [2, 0, 1])
  // The three that fought: a mission each, their own kills each.
  expect(after.slice(0, 3).map((pig) => pig.missions)).toEqual([1, 1, 1])
  expect(after.slice(0, 3).map((pig) => pig.score)).toEqual([2, 0, 1])
  // The bench: untouched.
  expect(after.slice(3).every((pig) => pig.missions === 0 && pig.score === 0)).toBe(true)
  // Copying, like regroup — the squad handed in is not written to.
  expect(squad[0].missions).toBe(0)
  // A slot the tally names nothing for played the mission and scored nothing.
  const quiet = credit(squad, 5, [])
  expect(quiet[4].missions).toBe(1)
  expect(quiet[4].score).toBe(0)
})
