// DRIVING, and running somebody over.
//
// The shape is the manual's, the numbers behind the ram are the exe's, and the
// SPEED is nobody's yet — `drive.ts` says so at length and this file does not
// pretend otherwise: nothing here asserts how fast a tank is, only that it is
// faster than a pig and that the frame is linear in the delta.

import { test, expect } from '@playwright/test'

import { DRIVE_SPEED, DRIVE_TURN, driveStep, hullTurn } from '../src/lib/game/drive'
import { RAM_DAMAGE, RAM_SHOVE, ramOver, rammed } from '../src/lib/game/ram'
import { WALK_SPEED } from '../src/lib/game/movement'
import { ObstacleField } from '../src/lib/game/obstacles'
import { Game } from '../src/lib/game/game'
import { DAMAGE_UNIT } from '../src/lib/game/projectile'
import { terrain } from './fixture'
import type { Obstacle } from '../src/lib/game/obstacles'
import type { Velocity } from '../src/lib/game/tumble'
import type { BattleEvent } from '../src/lib/game/events'
import type { MapObject } from '../src/lib/formats/pog'
import type { Pig } from '../src/lib/game/game'

const flat = (): ReturnType<typeof terrain> => terrain(() => 0)

/** A tank's own collider, which every TANK record on every map carries. */
const hull = (over: Partial<Obstacle> = {}): Obstacle => ({
  id: 7,
  x: 0,
  z: 0,
  top: -384,
  bottom: 0,
  halfX: 320,
  halfZ: 192,
  turn: 0,
  sloped: false,
  surface: null,
  ...over
})

const NORTH = 0
const nowhere = { query: flat(), blocked: (): boolean => false }

test.describe('one frame of driving', () => {
  test('the walk is a THROTTLE and forward is the heading', { tag: '@nodata' }, () => {
    const at = { x: 0, z: 0, heading: NORTH }
    const went = driveStep(at, nowhere, { walk: 1, turn: 0 }, 1)
    expect(went.moved).toBe(true)
    // Forward is (sin h, cos h), so heading 0 is +z and nothing sideways.
    expect(at.x).toBeCloseTo(0)
    expect(at.z).toBeCloseTo(DRIVE_SPEED)
  })

  test('…and it reverses', { tag: '@nodata' }, () => {
    const at = { x: 0, z: 0, heading: NORTH }
    driveStep(at, nowhere, { walk: -1, turn: 0 }, 1)
    expect(at.z).toBeCloseTo(-DRIVE_SPEED)
  })

  test('A VEHICLE IS FASTER THAN A PIG AND TURNS SLOWER', { tag: '@nodata' }, () => {
    // `[CHECK — remake]` — the exe states no speed at all, so what is pinned
    // here is the RELATION, which is the part play can judge.
    expect(DRIVE_SPEED).toBeGreaterThan(WALK_SPEED)
    const at = { x: 0, z: 0, heading: NORTH }
    driveStep(at, nowhere, { walk: 0, turn: 1 }, 1)
    expect(at.heading).toBeCloseTo(DRIVE_TURN)
  })

  test('the turn happens BEFORE the step, so it drives where it now points', { tag: '@nodata' }, () => {
    const at = { x: 0, z: 0, heading: NORTH }
    driveStep(at, nowhere, { walk: 1, turn: 1 }, 1)
    // Some of the travel is sideways, which it would not be if the step used
    // the heading the frame started with.
    expect(Math.abs(at.x)).toBeGreaterThan(0)
  })

  test('SOLID GROUND REFUSES IT, and the hull stays put', { tag: '@nodata' }, () => {
    const at = { x: 0, z: 0, heading: NORTH }
    const went = driveStep(
      at,
      { query: flat(), blocked: () => true },
      { walk: 1, turn: 0 },
      1
    )
    expect(went.moved).toBe(false)
    expect(at.z).toBe(0)
  })

  test('a still frame is not a move, and still reports the water', { tag: '@nodata' }, () => {
    const at = { x: 0, z: 0, heading: NORTH }
    const went = driveStep(at, nowhere, { walk: 0, turn: 0 }, 1)
    expect(went.moved).toBe(false)
    expect(typeof went.wet).toBe('boolean')
  })

  test('the BOX yaw is a quarter turn off the heading', { tag: '@nodata' }, () => {
    // A model's +x runs along (cos turn, −sin turn) and forward is
    // (sin h, cos h); a hull longer than it is wide has to carry the
    // difference or its collider sits across the way it drives.
    const heading = 0.7
    const turn = hullTurn(heading)
    expect(Math.cos(turn)).toBeCloseTo(Math.sin(heading))
    expect(-Math.sin(turn)).toBeCloseTo(Math.cos(heading))
  })
})

test.describe('a box that moves', () => {
  const record = (name: string, x: number, z: number): MapObject =>
    ({
      id: 7,
      name,
      x,
      y: 0,
      z,
      yaw: 0,
      // A real TANK record's own: a plain box collider, 640 by 384.
      shape: 0,
      box: { x: 640, y: 384, z: 384 },
      contents: null
    }) as unknown as MapObject

  test('moveTo REBUCKETS it — the old tile is clear and the new one is not', { tag: '@nodata' }, () => {
    const field = new ObstacleField([record('TANK', 0, 0)])
    // Buckets are 512 across and a tank's box is wider than one, so a move of
    // four tiles is not a subtlety: it has to leave every cell it was in.
    expect(field.stopper(0, -100, 0)).toBe(7)
    field.moveTo(7, 4096, 0, 0)
    expect(field.stopper(0, -100, 0)).toBeNull()
    expect(field.stopper(4096, -100, 0)).toBe(7)
  })
})

test.describe('the RAM', () => {
  const squad = (): { game: Game; mine: Pig[]; theirs: Pig[] } => {
    const game = new Game({
      players: [
        { name: 'A', pigNames: ['driver', 'chum'] },
        { name: 'B', pigNames: ['enemy'] }
      ],
      spawns: [
        { x: 0, z: 0, heading: 0, pigClass: 0 },
        { x: 0, z: 0, heading: 0, pigClass: 0 },
        { x: 0, z: 0, heading: 0, pigClass: 0 }
      ]
    })
    return { game, mine: game.players[0].pigs, theirs: game.players[1].pigs }
  }

  const put = (pig: Pig, x: number, z: number): void => {
    pig.position.x = x
    pig.position.z = z
  }

  test('the footprint is the box, in the box own frame', { tag: '@nodata' }, () => {
    const { mine } = squad()
    const pig = mine[1]
    put(pig, 0, 0)
    expect(rammed(hull(), pig)).toBe(true)
    // Well clear along the LONG axis, which is 320 either way plus a pig.
    put(pig, 2000, 0)
    expect(rammed(hull(), pig)).toBe(false)
    // …and the box's own turn is what decides which axis is which: 250 along
    // z is inside the narrow half (192) plus a pig's radius, and the SAME
    // point is well inside the long half once the hull is turned a quarter.
    put(pig, 0, 250)
    expect(rammed(hull(), pig), 'across the narrow side').toBe(true)
    expect(rammed(hull({ turn: Math.PI / 2 }), pig), 'turned a quarter').toBe(true)
    // …and just past the narrow half it is out, where along the long axis it
    // would still be in.
    put(pig, 0, 300)
    expect(rammed(hull(), pig), 'past the narrow side').toBe(false)
    expect(rammed(hull({ turn: Math.PI / 2 }), pig), 'but not the long one').toBe(true)
  })

  test('A TANK KNOCKS FRIEND OR FOE — twenty points and a hard throw', { tag: '@nodata' }, () => {
    const { mine, theirs } = squad()
    const [driver, chum] = mine
    const enemy = theirs[0]
    put(driver, 0, 0)
    put(chum, 100, 0)
    put(enemy, -100, 0)
    const thrown: { pig: number; velocity: Velocity }[] = []
    const events: BattleEvent[] = []
    const before = chum.health
    const out = ramOver(
      hull(),
      3, // TANK
      driver,
      {
        pigs: () => [driver, chum, enemy],
        training: false,
        fling: (pig, velocity) => thrown.push({ pig: pig.id, velocity }),
        friendly: (pig) => mine.includes(pig)
      },
      (event) => events.push(event)
    )
    // Both of them, which is the manual's own "friend or foe".
    expect(out.struck.sort()).toEqual([chum.id, enemy.id].sort())
    expect(out.boarded).toEqual([])
    expect(before - chum.health).toBe(RAM_DAMAGE / DAMAGE_UNIT)
    expect(RAM_DAMAGE / DAMAGE_UNIT).toBe(20)
    // Thrown AWAY from the hull and upwards — y counts down.
    const push = thrown.find((one) => one.pig === chum.id)!
    expect(push.velocity.vx).toBeGreaterThan(0)
    expect(push.velocity.vy).toBeLessThan(0)
    expect(Math.hypot(push.velocity.vx, push.velocity.vy, push.velocity.vz)).toBeCloseTo(
      RAM_SHOVE,
      0
    )
  })

  test('…and it never runs over its own DRIVER', { tag: '@nodata' }, () => {
    const { mine } = squad()
    const driver = mine[0]
    put(driver, 0, 0)
    const out = ramOver(
      hull(),
      3,
      driver,
      { pigs: () => [driver], training: false },
      () => {}
    )
    expect(out.struck).toEqual([])
  })

  test('A CARRIER PICKS UP CHUMS AND IGNORES THE ENEMY', { tag: '@nodata' }, () => {
    const { mine, theirs } = squad()
    const [driver, chum] = mine
    const enemy = theirs[0]
    put(driver, 0, 0)
    put(chum, 100, 0)
    put(enemy, -100, 0)
    const aboard: number[] = []
    const before = chum.health
    const out = ramOver(
      hull(),
      4, // CARRY
      driver,
      {
        pigs: () => [driver, chum, enemy],
        training: false,
        friendly: (pig) => mine.includes(pig),
        board: (pig) => {
          aboard.push(pig.id)
          return true
        }
      },
      () => {}
    )
    expect(out.boarded).toEqual([chum.id])
    expect(aboard).toEqual([chum.id])
    // Nobody is knocked, and the chum is not hurt by being picked up.
    expect(out.struck).toEqual([])
    expect(chum.health).toBe(before)
  })

  test('a FULL carrier simply does not take him', { tag: '@nodata' }, () => {
    const { mine } = squad()
    const [driver, chum] = mine
    put(driver, 0, 0)
    put(chum, 100, 0)
    const out = ramOver(
      hull(),
      4,
      driver,
      {
        pigs: () => [driver, chum],
        training: false,
        friendly: () => true,
        board: () => false
      },
      () => {}
    )
    expect(out.boarded).toEqual([])
    expect(out.struck).toEqual([])
  })
})
