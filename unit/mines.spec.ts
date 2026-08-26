// PHASE 002 (domain) — the sapper LAYS a mine. Pure, no Electron.
//
// The shape is PLAY's, over the disassembly's first reading
// (lib/game/mines.ts): the lay drops a visible object at the layer's feet,
// it arms after 25 frames with the L_MINETR click, and it stays FURNITURE
// through the turn — at the TURN'S END every laid mine beds into its tile's
// bit, and one bedded under somebody's feet goes off then and there. Two on
// one spot bed into ONE bit.

import { test, expect } from '@playwright/test'

import { ARM_FRAMES, createMines, isMine } from '../src/lib/game/mines'
import { fromExeFrames } from '../src/lib/game/ballistics'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const MINE = 35

const pigAt = (x: number, z: number, id = 1): Pig =>
  ({
    id,
    name: 'SAPPER',
    index: 0,
    health: 80,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 5,
    gone: false,
    parachutes: false
  }) as unknown as Pig

const field = (): {
  mines: ReturnType<typeof createMines>
  pigs: Pig[]
  heard: BattleEvent[]
} => {
  const pigs: Pig[] = []
  const heard: BattleEvent[] = []
  const mines = createMines(
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training: false,
      query: terrain(() => 0),
      random: () => 0
    },
    (event) => heard.push(event)
  )
  return { mines, pigs, heard }
}

test('a laid mine arms with the click and stays FURNITURE through the turn', { tag: '@nodata' }, () => {
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  expect(isMine(MINE)).toBe(true)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.laid()).toHaveLength(1)
  expect(mines.buried(256, 256)).toBe(false)
  mines.update(fromExeFrames(ARM_FRAMES) + 0.01)
  expect(heard.some((one) => one.kind === 'mineArmed')).toBe(true)
  // Armed, everyone could be a map away — STILL furniture: only the turn's
  // end beds it, never a clearance.
  sapper.position.x = 9000
  mines.update(1)
  expect(mines.laid()).toHaveLength(1)
  expect(mines.buried(256, 256)).toBe(false)
  expect(mines.tread(256, 256)).toBe(false)
})

test('the turn ends: it beds in — and goes off under whoever STANDS there', { tag: '@nodata' }, () => {
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, MINE)
  // The layer never walked away: the end-of-turn bed-in finds a live pig on
  // the tile and the mine goes off under it — the layer's own foot counts,
  // no side is checked anywhere.
  mines.bedAll()
  expect(mines.laid()).toHaveLength(0)
  expect(heard.some((one) => one.kind === 'mineTripped')).toBe(true)
  expect(mines.live()).toBe(1)
  mines.update(1)
  expect(heard.some((one) => one.kind === 'blasted')).toBe(true)
  // …and the tile is spent by it: one-shot, like any mine.
  expect(mines.buried(256, 256)).toBe(false)
})

test('bedded clear of everyone it waits in the ground, revealed to detectors', { tag: '@nodata' }, () => {
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, MINE)
  sapper.position.x = 9000
  mines.bedAll()
  expect(mines.laid()).toHaveLength(0)
  expect(heard.some((one) => one.kind === 'mineTripped')).toBe(false)
  expect(mines.buried(256, 256)).toBe(true)
  // A detector one tile off sees it, like any bedded bit (the exe's 3×3).
  expect(
    mines.revealed([pigAt(256 + 512, 256, 2)]).some((one) => one.x === 256 && one.z === 256)
  ).toBe(true)
  // …and anyone treading it — the layer come back included — sets it off.
  sapper.position.x = 256
  expect(mines.tread(256, 256)).toBe(true)
  expect(mines.buried(256, 256)).toBe(false)
})

test('two mines on ONE spot bed into one bit and one bang', { tag: '@nodata' }, () => {
  // Play: "2 мины можно в 1 место поставить - там урон вроде не как от
  // двух будет." The tile carries a bit, not a count: the second lay is
  // absorbed at the bed-in.
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.laid()).toHaveLength(2)
  sapper.position.x = 9000
  mines.bedAll()
  expect(mines.buried(256, 256)).toBe(true)
  expect(mines.tread(256, 256)).toBe(true)
  expect(mines.tread(256, 256), 'the second was absorbed, not stacked').toBe(false)
  mines.update(1)
  expect(heard.filter((one) => one.kind === 'blasted')).toHaveLength(1)
})
