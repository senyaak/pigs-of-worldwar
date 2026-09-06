// PHASE 002 (domain) — the sapper LAYS a mine. Pure, no Electron.
//
// The shape is PLAY's, over the disassembly's first reading
// (lib/game/mines.ts): the lay drops a visible object at the layer's feet,
// it arms after 25 frames with the L_MINETR click, and it stays FURNITURE
// through the turn — at the TURN'S END every laid mine beds into its tile's
// bit, and one bedded under somebody's feet goes off then and there. Two on
// one spot bed into ONE bit.

import { test, expect } from '@playwright/test'
import { NO_POSE } from '../src/lib/game/pose'

import { ARM_FRAMES, MINE_DAMAGE, createMines, isMine } from '../src/lib/game/mines'
import { fromExeFrames } from '../src/lib/game/ballistics'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const MINE = 35
/** 36 ANTI-PERSONNEL — row 39, the one whose refused blast is 3200. */
const AP_MINE = 36

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
      random: () => 0,
      // A pure spec draws nobody, so a charge falls back on the feet
      // (lib/game/mines.ts, `lay`).
      pose: NO_POSE
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

test('the turn ends and the layer never walked away: it CANNOT plant, so it blows', { tag: '@nodata' }, () => {
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, MINE)
  // The plant pass refuses a mine with any pig inside `PLANT_CLEAR` — no
  // owner exclusion, so the layer refuses his own — and a refusal is a bang
  // where it lies, not a shrug (lib/game/mines.ts, the exe's 0x4370c5).
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

test('two mines on ONE spot: the first plants, the SECOND is refused and blows', { tag: '@nodata' }, () => {
  // Play: "2 ложишь и 2 взрываются." Right, and it is the tile bit that makes
  // it so rather than in spite of it: the tile carries a bit and not a count,
  // so the second lay reads that bit, is refused, and its own destructor runs
  // (lib/game/mines.ts, the exe's 0x4371ee -> 0x4374e4).
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.laid()).toHaveLength(2)
  // Clear of them both, or neither would plant at all.
  sapper.position.x = 9000
  mines.bedAll()
  // One went into the ground…
  expect(mines.buried(256, 256)).toBe(true)
  // …and the other is already counting down where it lay.
  expect(mines.live()).toBe(1)
  mines.update(1)
  expect(heard.filter((one) => one.kind === 'blasted')).toHaveLength(1)
  // The bit is still there, and it is the one-shot it always was.
  expect(mines.tread(256, 256)).toBe(true)
  expect(mines.tread(256, 256), 'one bit, and it is spent').toBe(false)
})

test('an ANTI-PERSONNEL that could not plant hits harder than a trodden one', { tag: '@nodata' }, () => {
  // Rows 38 and 39 differ in one field, +0x0C: 2560 against 3200. A trodden
  // tile is rows 40/41, 2560 either way — so the anti-personnel does MORE
  // refused than stepped on.
  const { mines, pigs } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, AP_MINE)
  mines.bedAll()
  expect(mines.at()).toHaveLength(1)
  expect(mines.at()[0].damage).toBe(3200)
  // …and the plain one, refused the same way, is the tile's own figure.
  const plain = field()
  const other = pigAt(256, 256)
  plain.pigs.push(other)
  plain.mines.lay(other, MINE)
  plain.mines.bedAll()
  expect(plain.mines.at()[0].damage).toBe(MINE_DAMAGE)
})

test('a charge is laid IN FRONT, off the hand, and not under the soles', { tag: '@nodata' }, () => {
  // `Pig::Shoot` spawns skills 35, 36 and 37 at bone 5 plus the muzzle
  // table's row 2, (0, 0, 100) — play: "свин ставит не под себя, чуть вперёд".
  const heard: BattleEvent[] = []
  const pigs: Pig[] = []
  const mines = createMines(
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training: false,
      query: terrain(() => 0),
      random: () => 0,
      // A hand a whole tile in front of the pig, so the difference is
      // unmistakable in the answer.
      pose: { boneToWorld: (pig) => ({ x: pig.position.x + 512, y: 0, z: pig.position.z }) }
    },
    (event) => heard.push(event)
  )
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.laid()[0].x).toBe(256 + 512)
  expect(mines.laid()[0].z).toBe(256)
})
