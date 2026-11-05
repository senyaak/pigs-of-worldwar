// PHASE 002 (domain) — the sapper LAYS a mine. Pure, no Electron.
//
// The shape is PLAY's, over the disassembly's first reading
// (lib/game/mines.ts): the lay drops a visible object at the layer's feet,
// it arms after 25 frames with the L_MINETR click, and it stays FURNITURE
// through the turn — at the TURN'S END every laid mine beds into its tile's
// bit, and one bedded under somebody's feet goes off then and there. Two on
// one spot bed into ONE bit.
//
// …and what a projectile does to a mine already in the ground, at the end.

import { test, expect } from '@playwright/test'
import { NO_POSE } from '../src/lib/game/pose'

import { createBullets } from '../src/lib/game/bullets'
import { createLobs } from '../src/lib/game/lobs'
import {
  ARM_FRAMES,
  LAID_FUSE_FRAMES,
  MINE_DAMAGE,
  createMines,
  isMine
} from '../src/lib/game/mines'
import { fromExeFrames } from '../src/lib/game/ballistics'
import { GAUGE_FULL } from '../src/lib/game/gauge'
import { ObstacleField } from '../src/lib/game/obstacles'
import { TILE_MINE, TILE_WATER } from '../src/lib/formats/pmg'
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

test('a detector lights the tile it can see, and a corpse still does until it is gone', { tag: '@nodata' }, () => {
  const { mines, pigs } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, MINE)
  sapper.position.x = 9000
  mines.bedAll()
  // The tile by its place, which is what the ground wears the stamp on. The map's
  // 64 tiles of 512 are centred on the origin, so (256, 256) is col 32, row 32.
  const eyes = pigAt(256 + 512, 256, 2)
  expect(mines.revealed([eyes])).toEqual([{ col: 32, row: 32, x: 256, z: 256 }])
  // exe: scanner/visibility.md, 0x4768D5 — the gate refuses state 8 and lets
  // DEAD's 6 through, and 0x468232 writes 8 only when the body leaves the map.
  eyes.health = 0
  expect(mines.revealed([eyes]), 'a body on the map still sees').toHaveLength(1)
  eyes.gone = true
  expect(mines.revealed([eyes]), 'a gone pig sees nothing').toEqual([])
})

test('the reveal is exactly the one tile either way, on both axes', { tag: '@nodata' }, () => {
  const { mines, pigs } = field()
  const sapper = pigAt(256, 256)
  pigs.push(sapper)
  mines.lay(sapper, MINE)
  sapper.position.x = 9000
  mines.bedAll()
  // exe: scanner/visibility.md, 0x476B11 — col and row each run −1..+1 round the
  // detector's own tile, so the corner of the block counts and the next tile out
  // does not. One tile is 512.
  expect(mines.revealed([pigAt(256 + 512, 256 + 512, 2)])).toHaveLength(1)
  expect(mines.revealed([pigAt(256 + 1024, 256, 2)])).toEqual([])
  expect(mines.revealed([pigAt(256, 256 + 1024, 2)])).toEqual([])
  // exe: scanner/visibility.md, 0x476B4A — it is the bit that is tested, so a
  // spent mine lights nothing.
  mines.tread(256, 256)
  expect(mines.revealed([pigAt(256 + 512, 256, 2)])).toEqual([])
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

test('TWO laid beside an enemy: both arm, both stay up, and both blow when the turn ENDS', { tag: '@nodata' }, () => {
  // Play, correcting the sequence: "ты ставишь одну — она взводится если есть
  // чужой свин — потом ставишь ещё 1 — остаётся 3-5 секунд на конец хода и уже
  // 2 взведены — и когда ход кончился, взрываются — не сразу." That is the
  // PIG test doing it, not the tile bit: the enemy is inside `PLANT_CLEAR`, so
  // NEITHER can go into the ground and both take their own fuse at the bed-in.
  const { mines, pigs, heard } = field()
  const sapper = pigAt(256, 256)
  const enemy = pigAt(320, 256, 2)
  pigs.push(sapper, enemy)

  expect(mines.lay(sapper, MINE)).toBe(true)
  expect(mines.lay(sapper, MINE)).toBe(true)
  // …and both come up to the click while the turn still runs. Furniture until
  // it ends: nothing has gone off yet.
  mines.update(fromExeFrames(ARM_FRAMES) + 0.01)
  expect(heard.filter((one) => one.kind === 'mineArmed')).toHaveLength(2)
  expect(mines.laid().every((one) => one.arming === 0)).toBe(true)
  expect(heard.some((one) => one.kind === 'blasted'), 'nothing goes off during the turn').toBe(
    false
  )

  // THE TURN ENDS. Neither may plant, so neither becomes the ground…
  mines.bedAll()
  expect(mines.buried(256, 256), 'no bit was written').toBe(false)
  expect(mines.live(), 'both are counting').toBe(2)
  // …and NOT IMMEDIATELY: each has its own row's 25 frames to burn first.
  expect(heard.some((one) => one.kind === 'blasted')).toBe(false)
  mines.update(fromExeFrames(LAID_FUSE_FRAMES) - 0.01)
  expect(heard.some((one) => one.kind === 'blasted'), 'still burning').toBe(false)

  mines.update(0.02)
  expect(heard.filter((one) => one.kind === 'blasted'), 'both of them').toHaveLength(2)
  expect(mines.live()).toBe(0)
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

// ---------------------------------------------------------------------------
// A PROJECTILE on a mine that is already in the ground.
//
// exe: weapons/mines.md, `Projectile::OnHitLandscape` 0x4377d0, the mine arm
// 0x437a50 -- every projectile's landscape contact runs it, and nothing before
// it asks the kind. Row +0x26 is no gate on it: its one reader, 0x436201, turns
// the body along its flight.

const RIFLE = 7
const GRENADE = 19
const BAZOOKA = 29
/** Tile (32, 32): its low corner is (0, 0), so its centre is (256, 256). */
const onTheMine = (x: number, z: number): boolean => x === 0 && z === 0
/** Straight down and level, in the 4096-to-the-turn aim units. */
const DOWN = -1024
const LEVEL = 0

const minefield = (
  type: number,
  from: { x: number; y: number; z: number }
): {
  mines: ReturnType<typeof createMines>
  bullets: ReturnType<typeof createBullets>
  lobs: ReturnType<typeof createLobs>
  heard: BattleEvent[]
  shooter: Pig
} => {
  const heard: BattleEvent[] = []
  const emit = (event: BattleEvent): void => {
    heard.push(event)
  }
  const query = terrain(
    () => 0,
    (x, z) => (onTheMine(x, z) ? { type } : {})
  )
  const pose = { boneToWorld: () => from }
  const shared = { pigs: () => [], targets: [], present: () => true, training: false, query, pose, random: () => 0.5 }
  const mines = createMines(shared, emit)
  const obstacles = new ObstacleField([])
  return {
    mines,
    bullets: createBullets({ ...shared, obstacles, mines }, emit),
    lobs: createLobs({ ...shared, obstacles, mines }, emit),
    heard,
    shooter: pigAt(from.x, from.z, 99)
  }
}

test('a rifle round that meets the ground on a mine tile sets it off', { tag: '@nodata' }, () => {
  const { mines, bullets, heard, shooter } = minefield(TILE_MINE, { x: 200, y: -300, z: 200 })
  shooter.holding = RIFLE
  // exe: 0x437a50 -- a gun's kind is no exception. The same handler plays that
  // round's own impact sound further down (0x43806c, kinds 12..19 in the byte
  // map 0x4381c4), so a bullet is known to reach it.
  expect(bullets.fire(shooter, DOWN)).toBe(true)
  for (let step = 0; step < 60 && bullets.live().length > 0; step++) bullets.update(1 / 60)
  expect(heard.some((one) => one.kind === 'mineTripped')).toBe(true)
  // exe: 0x437a94 -- at the tile's CENTRE, not where the round came down.
  expect(mines.at()).toHaveLength(1)
  expect(mines.at()[0]).toMatchObject({ x: 256, z: 256, damage: MINE_DAMAGE })
  // exe: 0x437bbf -- `Map::SetMine` clears the bit: one shot.
  expect(mines.buried(256, 256)).toBe(false)
})

test('a round passing OVER a mine tile touches nothing and sets nothing off', { tag: '@nodata' }, () => {
  // exe: 0x4a8b41 -- the handler is the world's contact loop's, so no contact
  // is no trigger, however low it flies.
  const { mines, bullets, heard, shooter } = minefield(TILE_MINE, { x: 256, y: -300, z: -600 })
  shooter.holding = RIFLE
  expect(bullets.fire(shooter, LEVEL)).toBe(true)
  for (let step = 0; step < 240 && bullets.live().length > 0; step++) bullets.update(1 / 60)
  expect(bullets.live()).toHaveLength(0)
  expect(heard.some((one) => one.kind === 'mineTripped')).toBe(false)
  expect(mines.buried(256, 256)).toBe(true)
})

test('a bazooka rocket that lands on a mine tile sets it off', { tag: '@nodata' }, () => {
  const { mines, lobs, heard, shooter } = minefield(TILE_MINE, { x: 200, y: -300, z: 200 })
  shooter.holding = BAZOOKA
  // exe: 0x437a50 -- the arm stands before the contact burst at 0x437f2c.
  expect(lobs.throwOne(shooter, DOWN, GAUGE_FULL)).toBe(true)
  for (let step = 0; step < 60 && lobs.live() > 0; step++) lobs.update(1 / 60)
  expect(heard.some((one) => one.kind === 'mineTripped')).toBe(true)
  expect(mines.at()[0]).toMatchObject({ x: 256, z: 256 })
  expect(mines.buried(256, 256)).toBe(false)
})

test('a grenade that lands on a mine tile sets it off, and flies on over one that it does not touch', { tag: '@nodata' }, () => {
  // exe: 0x437a50 -- row +0x26 is 0 on every grenade and that gates nothing
  // here: the only flag this handler tests is +0xc6 (0x43785b), which the
  // constructor clears for every thrown thing (0x431fba).
  const landing = minefield(TILE_MINE, { x: 200, y: -300, z: 200 })
  landing.shooter.holding = GRENADE
  expect(landing.lobs.throwOne(landing.shooter, DOWN, GAUGE_FULL)).toBe(true)
  for (let step = 0; step < 60; step++) landing.lobs.update(1 / 60)
  expect(landing.heard.filter((one) => one.kind === 'mineTripped')).toHaveLength(1)
  expect(landing.mines.buried(256, 256)).toBe(false)

  // Up and over, thrown from the far side, and down well beyond: in the air
  // above the tile it is not on the tile.
  const over = minefield(TILE_MINE, { x: 256, y: -300, z: -300 })
  over.shooter.holding = GRENADE
  expect(over.lobs.throwOne(over.shooter, 512, GAUGE_FULL)).toBe(true)
  for (let step = 0; step < 90; step++) over.lobs.update(1 / 60)
  expect(over.lobs.at()[0].z, 'it has passed the tile').toBeGreaterThan(512)
  expect(over.heard.some((one) => one.kind === 'mineTripped')).toBe(false)
  expect(over.mines.buried(256, 256)).toBe(true)
})

test('a WET mine tile goes off under the grenade that then sinks in it', { tag: '@nodata' }, () => {
  // exe: weapons/fire/water-one-handler-no-depth.md -- the mine arm 0x437a50
  // comes before the water arms 0x437bfb in the one handler, and 197 tiles of
  // the 61 shipped maps carry both bits (a throwaway count over the PMGs).
  const { mines, lobs, heard, shooter } = minefield(TILE_MINE | TILE_WATER, { x: 200, y: -300, z: 200 })
  shooter.holding = GRENADE
  expect(lobs.throwOne(shooter, DOWN, GAUGE_FULL)).toBe(true)
  for (let step = 0; step < 60; step++) lobs.update(1 / 60)
  const kinds = heard.map((one) => one.kind)
  expect(kinds).toContain('mineTripped')
  expect(kinds).toContain('doused')
  expect(kinds.indexOf('mineTripped')).toBeLessThan(kinds.indexOf('doused'))
  expect(mines.buried(256, 256)).toBe(false)
})
