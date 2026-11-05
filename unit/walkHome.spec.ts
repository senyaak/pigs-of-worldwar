// PHASE 002 (domain) — THE LINE HOLDS THE WALK, AND A THROWN PIG WALKS HOME.
//
// Play, 2026-08-26: "там можно чтобы взрывом отбросило за проходимую границу вроде
// - но потом обратно свин сам бежит." The exe's whole of it is `terrain/boundary.md`
// in the disasm repo, and every number below is cited beside its assertion.
//
// The worlds are built to order (unit/fixture.ts). The whole chain on a shipped map,
// the turn's wait included, is e2e/002/walk-home.spec.ts.

import { expect, test } from '@playwright/test'

import { NO_BODY } from '../src/lib/game/body'
import { STEP_SECONDS } from '../src/lib/game/engine'
import { FRAME_SECONDS, fromExeSpeed } from '../src/lib/game/ballistics'
import { createBus } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'
import { ANIM, GRAVITY, TURN_SPEED, WOUND_SPEED, createLocomotion, updateLocomotion } from '../src/lib/game/locomotion'
import type { LocomotionState } from '../src/lib/game/locomotion'
import { WALK_SPEED } from '../src/lib/game/movement'
import { NO_OBSTACLES } from '../src/lib/game/obstacles'
import type { Obstruction } from '../src/lib/game/obstacles'
import { GRID_STEP, SIDE } from '../src/lib/game/pathgrid'
import { seeded } from '../src/lib/game/random'
import { THROWN_LIMIT, WORLD_LIMIT } from '../src/lib/game/terrain'
import type { TerrainQuery } from '../src/lib/game/terrain'
import { createTumbles, flingVelocity } from '../src/lib/game/tumble'
import { beginWalkAway, shoreFrom } from '../src/lib/game/walkAway'
import { createWalkHome, homeFrom } from '../src/lib/game/walkHome'
import { terrain } from './fixture'

/** Steps of the engine in one of the exe's frames. */
const PER_FRAME = Math.round(FRAME_SECONDS / STEP_SECONDS)

const TILE = 512
/** The column or row a world coordinate is on: (x + 0x4000) >> 9 (0x472DD0). */
const tileOf = (at: number): number => Math.floor((at + 16384) / TILE)
/** …and its centre: (col << 9) − 0x3F00 (0x4732B0). */
const centreOf = (tile: number): number => tile * TILE - 0x3f00

/** The middle of the row z = 0 is on, so the walk from there runs straight along x. */
const ROW = centreOf(tileOf(0))

const pigAt = (x: number, z: number, id = 1): Pig =>
  ({
    id,
    name: 'GRUNT',
    index: 0,
    health: 100,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 0,
    gone: false,
    parachutes: false
  }) as unknown as Pig

const flat = (): TerrainQuery => terrain(() => 0)

/** Terrain whose tiles are told apart by column. */
const columns = (type: (col: number) => number, shape: (x: number, z: number) => number = () => 0): TerrainQuery =>
  terrain(shape, (x) => ({ type: type(tileOf(x)) }))

const everywhere = (): boolean => true

interface Rig {
  home: ReturnType<typeof createWalkHome>
  worn: Map<number, number>
  adopted: LocomotionState[]
  /** Run this many of the exe's frames. */
  frames(count: number, where?: { acting?: Pig; walkAway?: boolean }): void
  /** …or of the engine's steps, four to a frame. */
  steps(count: number, where?: { acting?: Pig; walkAway?: boolean }): void
}

const rig = (
  query: TerrainQuery,
  pigs: Pig[],
  { obstacles = NO_OBSTACLES, training = false }: { obstacles?: Obstruction; training?: boolean } = {}
): Rig => {
  const worn = new Map<number, number>()
  const adopted: LocomotionState[] = []
  const flying = new Set<number>()
  const home = createWalkHome({
    pigs: () => pigs,
    query,
    obstacles,
    training,
    riding: () => false,
    tumbles: {
      has: (pig) => flying.has(pig.id),
      aloft: (pig) => flying.has(pig.id),
      adopt: (pig, loco) => {
        flying.add(pig.id)
        adopted.push(loco)
      }
    },
    wear: (pig, clip) => worn.set(pig.id, clip)
  })
  const steps: Rig['steps'] = (count, { acting, walkAway = false } = {}) => {
    for (let step = 0; step < count; step++) {
      home.update(STEP_SECONDS, {
        acting: acting ?? null,
        walkAway,
        aloft: false,
        fall: (loco) => adopted.push(loco)
      })
    }
  }
  return {
    home,
    worn,
    adopted,
    steps,
    frames: (count, where) => steps(count * PER_FRAME, where)
  }
}

// ---- the line ----

test('the walk stops at the line', { tag: '@nodata' }, () => {
  const query = flat()
  const state = createLocomotion(query, WORLD_LIMIT - 200, 0, Math.PI / 2)
  for (let step = 0; step < 120; step++) {
    updateLocomotion(state, query, { walk: 1, turn: 0, jump: false }, STEP_SECONDS)
    // exe: terrain/boundary.md, 0x478D32 — ±0x3000, the acting pig's candidate.
    expect(state.x).toBeLessThanOrEqual(0x3000)
  }
  expect(state.x).toBeGreaterThan(WORLD_LIMIT - 40)
})

test('a jump past the line is put at 12256 and stilled', { tag: '@nodata' }, () => {
  const query = flat()
  const state = createLocomotion(query, WORLD_LIMIT - 5, 0, Math.PI / 2)
  state.y = -500
  state.airborne = { vx: 900, vy: -200, vz: 300, bouncing: false, pushIn: null }
  updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, STEP_SECONDS)
  // exe: terrain/boundary.md, 0x46D5FB and 0x46D60B — x = 0x463F8000 = 12256, then
  // 0x4A9EE0 stills the body.
  expect(state.x).toBe(12256)
  expect(state.airborne?.vx).toBe(0)
  expect(state.airborne?.vz).toBe(0)
  // Stilled, then the frame's own pull: it falls from rest.
  expect(state.airborne?.vy).toBeCloseTo(GRAVITY * STEP_SECONDS, 5)
})

test('a throw carries past the line', { tag: '@nodata' }, () => {
  const query = flat()
  const pig = pigAt(WORLD_LIMIT - 100, 0)
  const tumbles = createTumbles(
    { query, pigs: () => [pig], obstacles: NO_OBSTACLES, training: false, random: seeded(1) },
    createBus().emit
  )
  tumbles.fling(pig, flingVelocity(1800, Math.PI / 2))
  let furthest = 0
  for (let step = 0; step < 300; step++) {
    tumbles.update(STEP_SECONDS)
    furthest = Math.max(furthest, pig.position.x)
  }
  // [play] 2026-08-26, and exe: terrain/boundary.md — no pig but the acting one is
  // ever held at ±0x3000.
  expect(furthest).toBeGreaterThan(0x3000)
  expect(pig.position.x).toBeGreaterThan(0x3000)
})

test('the acting pig, thrown once its turn is over, goes past too', { tag: '@nodata' }, () => {
  const query = flat()
  const state = createLocomotion(query, WORLD_LIMIT - 5, 0, 0)
  // exe: terrain/boundary.md, 0x46D574 — the air's clamp is skipped in mode 13, and
  // the blow (0x467C6B -> 0x494430) has written mode 13.
  state.heldAtLimit = false
  state.y = -500
  state.airborne = { vx: 900, vy: -200, vz: 0, bouncing: true, pushIn: null, hurled: true }
  updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, STEP_SECONDS)
  expect(state.x).toBeGreaterThan(0x3000)
  expect(state.airborne?.vx).toBeGreaterThan(0)
})

test('past 15871 the flight is put on the line, until #32 kills it', { tag: '@nodata' }, () => {
  const query = flat()
  const state = createLocomotion(query, THROWN_LIMIT - 5, 200, 0)
  state.heldAtLimit = false
  state.y = -500
  state.airborne = { vx: 900, vy: 0, vz: 0, bouncing: true, pushIn: null, hurled: true }
  updateLocomotion(state, query, { walk: 0, turn: 0, jump: false }, STEP_SECONDS)
  // exe: 0x46CF10 tests ±0x3DFF; the training ground's arm clamps to ±12288
  // (0x46D0F1, 0x46400000). Everywhere else that arm is the kill, #32's.
  expect(THROWN_LIMIT).toBe(15871)
  expect(state.x).toBe(12288)
  expect(state.z).toBe(200)
})

// ---- the search ----

test('the search skips what is outside the box and takes the first tile inside', { tag: '@nodata' }, () => {
  const x = -13000
  const col = tileOf(x)
  const row = tileOf(0)
  const target = homeFrom(flat(), x, 0, everywhere, false)
  // exe: water/notes.md, 0x472EC9 skips tiles outside 8..0x37; 0x4732B0 the centre.
  expect(target).toEqual({ x: centreOf(8), z: centreOf(row) })
  expect(col).toBeLessThan(8)
})

test('a wall ring outside the box is never read', { tag: '@nodata' }, () => {
  // exe: terrain/boundary.md, 0x472EC9..0x472EE7 runs before the wall test.
  const query = columns((col) => (col === 7 ? 0x80 : 0))
  expect(homeFrom(query, -13000, 0, everywhere, false)).toEqual({ x: centreOf(8), z: centreOf(tileOf(0)) })
})

test('a wall inside the box ends the ray', { tag: '@nodata' }, () => {
  // exe: water/notes.md, 0x472F3E -> 0x473092. Every ray from out here meets column 8,
  // so nothing is left.
  const query = columns((col) => (col === 8 ? 0x80 : 0))
  expect(homeFrom(query, -13000, 0, everywhere, false)).toBeNull()
})

test('on the training ground a wall is a candidate like any other', { tag: '@nodata' }, () => {
  // exe: water/notes.md, 0x472F40 — the wall ends the ray only for clips 5, 6 and 0x4A
  // (0x470160), the swim and the drowning; a pig on dry land wears none.
  const query = columns((col) => (col === 8 ? 0x80 : 0))
  expect(homeFrom(query, -13000, 0, everywhere, true)).toEqual({ x: centreOf(8), z: centreOf(tileOf(0)) })
})

test('water of type 4 or 11 is passed over', { tag: '@nodata' }, () => {
  // exe: water/notes.md, 0x472F6F — bit 5 on those two types.
  const lake = columns((col) => (col === 8 ? 0x24 : col === 9 ? 0x2b : 0))
  expect(homeFrom(lake, -13000, 0, everywhere, false)).toEqual({ x: centreOf(10), z: centreOf(tileOf(0)) })
  // …and on those two only, with the flag.
  const other = columns((col) => (col === 8 ? 0x21 : 0))
  expect(homeFrom(other, -13000, 0, everywhere, false)).toEqual({ x: centreOf(8), z: centreOf(tileOf(0)) })
})

test('a refused tile lets the ray go on', { tag: '@nodata' }, () => {
  // exe: water/notes.md, 0x473007..0x473031 — only success ends the ray.
  const refused = (x: number): boolean => tileOf(x) !== 8
  expect(homeFrom(flat(), -13000, 0, refused, false)).toEqual({ x: centreOf(9), z: centreOf(tileOf(0)) })
})

test('the nearest wins, and the lower ray a tie', { tag: '@nodata' }, () => {
  // exe: terrain/boundary.md, 0x47322D..0x473244, over the table at 0x4D1010, whose
  // first entry is (0, 1). From the middle of the map rays 0, 2, 4 and 6 all find a
  // tile one away.
  expect(homeFrom(flat(), 256, 256, everywhere, false)).toEqual({ x: 256, z: 768 })
})

test('a ray that found nothing still competes: home in hops that double', { tag: '@nodata' }, () => {
  // exe: terrain/boundary.md, 0x472E49 — every record starts as the pig's own col and
  // row, and the compare does not ask. At tile (2, 2) ray 0 finds nothing and holds
  // 2² + 2² = 8; the real candidate, (8, 8), is 6² + 6² = 72.
  const first = homeFrom(flat(), centreOf(2), centreOf(2), everywhere, false)
  expect(first).toEqual({ x: centreOf(4), z: centreOf(4) })
  // From (4, 4) that is 32 against the real one's 32, and the failed ray comes first:
  // the same tile, as it happens, (8, 8).
  const second = homeFrom(flat(), centreOf(4), centreOf(4), everywhere, false)
  expect(second).toEqual({ x: centreOf(8), z: centreOf(8) })
})

test('the swim to shore skips the same tiles', { tag: '@nodata' }, () => {
  // exe: water/notes.md, 0x472EC9: the one routine, called by the water at 0x470079.
  const query = columns((col) => (col === 7 ? 0x80 : col < 7 ? 0x24 : 0))
  const shore = shoreFrom(query, -13000, 100)
  expect(shore).not.toBeNull()
  expect(shore?.x).toBeGreaterThanOrEqual(-WORLD_LIMIT)
})

// ---- the walk ----

test('it stands fifty frames, then turns on the spot, then walks', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  const { home, frames, worn } = rig(flat(), [pig])
  frames(50)
  // exe: terrain/boundary.md, 0x46CE84 — `cmp [pig+0x1A8],0x32`, and `jle`.
  expect(home.walking(pig)).toBe(false)
  expect(pig.position.x).toBe(-13000)
  // exe: 0x46CE4C — [0x537FC0] goes up on every frame of it.
  expect(home.waiting()).toBe(1)

  frames(1)
  expect(home.walking(pig)).toBe(true)

  // exe: 0x46DE60..0x46DEC8 — standing to turn, and that is the frame.
  const headingBefore = pig.heading
  frames(5)
  expect(pig.position.x).toBe(-13000)
  expect(pig.heading).toBeCloseTo(headingBefore + 5 * FRAME_SECONDS * TURN_SPEED, 5)
  expect(worn.get(pig.id)).toBe(ANIM.TURN)

  // The bearing is 75 degrees off, 853 of 4096, and it sets off within 0x40 of it, at
  // 0x20 a frame (0x46DEBB): about twenty more, and a little walk.
  frames(22)
  expect(pig.position.x).toBeGreaterThan(-13000)
  expect(worn.get(pig.id)).toBe(ANIM.RUN)
})

test('it runs at its own speed, wounds and all', { tag: '@nodata' }, () => {
  for (const [health, band, clip] of [
    [100, 0, ANIM.RUN],
    [20, 1, ANIM.RUN_WOUNDED],
    [5, 2, ANIM.RUN_HURT]
  ] as const) {
    const pig = pigAt(-15000, ROW)
    pig.health = health
    pig.heading = Math.PI / 2
    const { frames, worn } = rig(flat(), [pig])
    // Fifty-one frames, and the frame that finds it facing already.
    frames(52)
    const from = pig.position.x
    frames(15)
    // exe: terrain/boundary.md, 0x46E10A — `Pig::Walk(0x40)`, the request everything
    // asks for, cut by wounds at 0x46AD38; the clip 0x46C4A5.
    expect(pig.position.x - from).toBeCloseTo(WALK_SPEED * WOUND_SPEED[band], -1)
    expect(worn.get(pig.id)).toBe(clip)
  }
})

test('it stops on the first step back on dry clear ground', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  pig.heading = Math.PI / 2
  const { home, frames, worn } = rig(flat(), [pig])
  frames(200)
  expect(home.walking(pig)).toBe(false)
  // exe: terrain/boundary.md, 0x46E0CB — out on the step that lands inside, well short
  // of the tile's centre at 0x4732B0.
  expect(pig.position.x).toBeGreaterThan(-WORLD_LIMIT)
  expect(pig.position.x).toBeLessThan(-WORLD_LIMIT + WALK_SPEED * FRAME_SECONDS + 1)
  expect(pig.position.x).toBeLessThan(centreOf(8))
  // exe: 0x46CD48 — the box test zeroes the counter, and nothing holds the turn now.
  expect(home.waiting()).toBe(0)
  expect(worn.get(pig.id)).toBe(ANIM.IDLE)
})

test('it walks on through water, at the swim, to the tile past it', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, ROW)
  pig.heading = Math.PI / 2
  const query = columns((col) => (col === 8 ? 0x24 : 0))
  const { home, frames, worn } = rig(query, [pig])
  frames(70)
  // exe: terrain/boundary.md, 0x46DFBC and 0x46ADF7: past the line, still wading.
  expect(home.walking(pig)).toBe(true)
  expect(pig.position.x).toBeGreaterThan(-WORLD_LIMIT)
  expect(worn.get(pig.id)).toBe(ANIM.SWIM)
  const from = pig.position.x
  frames(15)
  expect(pig.position.x - from).toBeCloseTo(fromExeSpeed(16), 0)
  frames(200)
  expect(home.walking(pig)).toBe(false)
  expect(pig.position.x).toBeGreaterThanOrEqual(-WORLD_LIMIT + TILE)
})

test('a wall ring costs it only the crawl: never wedged, never refused', { tag: '@nodata' }, () => {
  // A steep rising band of wall in column 7, the ring the mapmakers build on.
  const shape = (x: number): number => (x <= -12800 ? 0 : x <= -12288 ? 700 : 0)
  const query = terrain(
    (x) => shape(x),
    (x) => ({ type: tileOf(x) === 7 ? 0x80 : 0 })
  )
  const pig = pigAt(-13000, ROW)
  pig.heading = Math.PI / 2
  const { home, frames, worn, adopted } = rig(query, [pig])
  frames(60)
  expect(pig.position.x).toBeGreaterThan(-12800)
  // exe: terrain/boundary.md — 0x46ACEE caps the step at 4 up a wall tile, and the
  // walk bit there is the Scramble (0x46C507).
  const from = pig.position.x
  frames(15)
  expect(pig.position.x - from).toBeCloseTo(fromExeSpeed(4), 0)
  expect(worn.get(pig.id)).toBe(ANIM.SCRAMBLE)
  // exe: 0x46FF91 — state 2 zeroes [pig+0x388], so the hop at 25 frames never fires.
  frames(80)
  expect(adopted).toEqual([])
  expect(home.walking(pig)).toBe(true)
})

test('ground falling away starts a fall, and the wait again', { tag: '@nodata' }, () => {
  const pig = pigAt(-13200, 0)
  pig.heading = Math.PI / 2
  // A cliff across the walk: down 2000 over one tile, far past WALK_OFF_GRADE.
  const query = terrain((x) => (x < -12900 ? 2000 : 0))
  const { home, frames, adopted } = rig(query, [pig])
  frames(120)
  // exe: terrain/boundary.md, 0x46B969 — TryMove's return of 2.
  expect(adopted).toHaveLength(1)
  expect(adopted[0].airborne).not.toBeNull()
  expect(adopted[0].goingHome).toBe(false)
  expect(adopted[0].heldAtLimit).toBe(false)
  expect(home.walking(pig)).toBe(false)
})

// ---- what restarts it ----

test('a hit restarts the wait', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  const { home, frames } = rig(flat(), [pig])
  frames(40)
  pig.health -= 1
  frames(40)
  // exe: terrain/boundary.md, 0x467BF4 — any damage above zero zeroes the counter.
  expect(home.walking(pig)).toBe(false)
  frames(12)
  expect(home.walking(pig)).toBe(true)
})

test('a blow stops the walk, and it stands the wait again', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  pig.heading = Math.PI / 2
  const { home, frames, worn } = rig(flat(), [pig])
  frames(55)
  expect(home.walking(pig)).toBe(true)
  home.struck(pig.id)
  // exe: terrain/boundary.md, 0x467C47..0x467C50 — a hit of cause 0 drops state 2.
  expect(home.walking(pig)).toBe(false)
  expect(worn.get(pig.id)).toBe(ANIM.IDLE)
  const stood = pig.position.x
  frames(50)
  expect(pig.position.x).toBe(stood)
  frames(3)
  expect(home.walking(pig)).toBe(true)
})

test('the acting pig goes home only in mode 13', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  const { home, frames } = rig(flat(), [pig])
  frames(60, { acting: pig })
  // exe: terrain/boundary.md, 0x46CE8D..0x46CE9F.
  expect(home.walking(pig)).toBe(false)
  // This engine cashes a blow's mode 13 on the quiet after it, and that quiet must not
  // wait for a walk only the beat after it can start.
  expect(home.waiting()).toBe(0)
  // The counter has been running all the while (0x46CE4C), so it sets off at once.
  frames(1, { acting: pig, walkAway: true })
  expect(home.walking(pig)).toBe(true)
  expect(home.waiting()).toBe(1)
})

test('in the water out there the swim is what gets it out', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  const query = columns((col) => (col < 8 ? 0x24 : 0))
  const { home, frames } = rig(query, [pig])
  frames(60)
  // exe: terrain/boundary.md — the bite restarts the counter (0x467BF4), and the water's
  // own search at 0x47004A gets there first. In this engine that is the walk-away beat,
  // which counts its own swimmers, so this wait does not.
  expect(home.walking(pig)).toBe(false)
  expect(home.waiting()).toBe(0)

  const beat = beginWalkAway({
    pigs: () => [pig],
    query,
    soaked: () => 1,
    walkingHome: () => false,
    wear: () => {},
    emit: () => {}
  })
  for (let step = 0; step < 600; step++) beat.update(STEP_SECONDS, false)
  // exe: 0x46D574 — mode 13 holds nobody at the line: the swim crosses it.
  expect(pig.position.x).toBeGreaterThan(-WORLD_LIMIT)
})

test('a pig wading on its walk home is not a swimmer of the beat', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 0)
  const query = columns(() => 0x24)
  const beat = beginWalkAway({
    pigs: () => [pig],
    query,
    soaked: () => 1,
    walkingHome: () => true,
    wear: () => {},
    emit: () => {}
  })
  beat.update(STEP_SECONDS, false)
  expect(beat.swimming()).toBe(0)
  expect(pig.position.x).toBe(-13000)
})

// ---- #32's, for now ----

test('no ray finding a tile puts it on the line, until #32 kills it', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, 300)
  const query = columns((col) => (col === 8 ? 0x80 : 0))
  const { home, frames } = rig(query, [pig])
  frames(50)
  expect(pig.position.x).toBe(-13000)
  frames(1)
  // exe: terrain/boundary.md, 0x4730D5 is the kill and #32's. The stand-in is the
  // training ground's arm, 0x46D0B5: x clamped to −12288, and nothing holds the turn.
  expect(pig.position.x).toBe(-WORLD_LIMIT)
  expect(pig.position.z).toBe(300)
  expect(home.waiting()).toBe(0)
  frames(1)
  expect(home.waiting()).toBe(0)
})

test('an object is sidestepped on the way home', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, ROW)
  pig.heading = Math.PI / 2
  // A prop on the straight line home, with open ground either side of it.
  const obstacles: Obstruction = {
    ...NO_OBSTACLES,
    blocks: (x, z) => Math.hypot(x + 12700, z - ROW) < 100
  }
  const { home, frames, steps } = rig(flat(), [pig], { obstacles })
  let from = { ...pig.position }
  for (let step = 0; step < 200 * PER_FRAME; step++) {
    steps(1)
    // exe: terrain/boundary.md — the line holds nobody on this walk, the sidestep's
    // scrape included (the probes at 0x4791B0, 0x4792F3): nothing here is a snap to it.
    expect(Math.hypot(pig.position.x - from.x, pig.position.z - from.z)).toBeLessThan(WALK_SPEED * STEP_SECONDS + 1)
    from = { ...pig.position }
  }
  frames(1)
  // exe: movement/step.md, 0x4790D9 — both right angles probed, 8 units along the clear
  // one, and the step counts as taken (return 3): the walk goes on.
  expect(pig.position.x).toBeGreaterThan(-WORLD_LIMIT)
  expect(home.walking(pig)).toBe(false)
  expect(home.waiting()).toBe(0)
})

test('still out after 500 frames it is put on the line, until #32 kills it', { tag: '@nodata' }, () => {
  const pig = pigAt(-13000, ROW)
  pig.heading = Math.PI / 2
  // A dead end across the only way home: a prop ahead and a wall of them either side, so
  // it can neither step up nor sidestep, and it looks again and never gets through.
  const obstacles: Obstruction = {
    ...NO_OBSTACLES,
    blocks: (x, z) => (x > -12900 && x < -12700) || (x > -13100 && Math.abs(z - ROW) > 5)
  }
  const { home, frames, steps } = rig(flat(), [pig], { obstacles })
  frames(100)
  // exe: terrain/boundary.md, 0x46B8CC..0x46B8DB — `TryMove` returning 1 ends the walk,
  // and the counter, still over 0x32, searches again next frame: so it is seen both ways.
  const seen = new Set<boolean>()
  for (let sample = 0; sample < 12; sample++) {
    steps(1)
    seen.add(home.walking(pig))
  }
  expect([...seen].sort()).toEqual([false, true])
  frames(387)
  expect(pig.position.x).toBeLessThan(-12700)
  expect(pig.position.x).toBeLessThan(-WORLD_LIMIT)
  expect(home.waiting()).toBe(1)
  frames(20)
  // exe: 0x46CEDC against [game+0x4E0], 0x1F4 at 0x48F2F4. The kill is #32's; the arm
  // here is the training ground's, 0x46D0B5.
  expect(pig.position.x).toBe(-WORLD_LIMIT)
  expect(home.waiting()).toBe(0)
})

// ---- what does not move with it ----

test("the AI's grid does not move with this", { tag: '@nodata' }, () => {
  // pathgrid.ts is derived from the line, ±0x3000 in steps of 128, and a plan never
  // leaves it (docs/todo/map-bounds.md).
  expect(GRID_STEP).toBe(128)
  expect(SIDE).toBe(Math.floor((2 * 0x3000) / 128) + 1)
})
