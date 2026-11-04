// THE DOOR: what the clip carries a pig through, a building and a vehicle told
// apart. Pure, driven through the real door beat on a flat map.
//
// Every number here is off the arms in `objects/getting-inside.md`; the four arms
// are vehicle OUT 0x469BF6, vehicle IN 0x469F21, building OUT 0x46A0F6 and building
// IN 0x46A228.

import { test, expect } from '@playwright/test'

import { createAnim } from '../src/lib/game/anim'
import { doorBeat } from '../src/lib/game/battle/doors'
import type { BattleCore } from '../src/lib/game/battle/core'
import type { BattleState } from '../src/lib/game/battle/state'
import { INOUT_CLIP } from '../src/lib/game/buildings'
import {
  DOOR_FRAMES,
  DOOR_FROM,
  DOOR_STEPS,
  DOOR_TO,
  EXIT_EDGE,
  EXIT_LIMIT,
  VEHICLE_EXIT,
  advanceCarry,
  carryIn,
  carryOut,
  clearHeight,
  exitHeading,
  exitSpot,
  heightOnLeaving,
  middleOf
} from '../src/lib/game/doorway'
import { Game } from '../src/lib/game/game'
import type { Pig } from '../src/lib/game/game'
import { createIndoors } from '../src/lib/game/indoors'
import type { Building } from '../src/lib/game/indoors'
import { createLocomotion } from '../src/lib/game/locomotion'
import { PHASE_UNITS } from '../src/lib/game/melee'
import { NO_OBSTACLES, ObstacleField } from '../src/lib/game/obstacles'
import { SHAPE_BOX } from '../src/lib/formats/pog'
import type { MapObject } from '../src/lib/formats/pog'
import { terrain } from './fixture'

const FRAME = 1 / 25
/** Clip 7's length at the remake's flat 25, which is what `core.clips` holds. */
const CLIP_SECONDS = 54 / 25

const record = (id: number, name: string, x: number, z: number, yaw: number): MapObject =>
  ({
    id,
    name,
    x,
    y: 176,
    z,
    yaw,
    shape: SHAPE_BOX,
    flags: 0,
    box: { x: 640, y: 352, z: 640 },
    contents: null
  }) as unknown as MapObject

interface Scene {
  core: BattleCore
  state: BattleState
  pig: Pig
  mount: Building
}

/** A pig already inside one mount on flat ground, at the door beat's mercy. */
const inside = (name: string, yaw: number, x = 0, z = 0): Scene => {
  const objects = [record(1, name, x, z, yaw)]
  const query = terrain(() => 0)
  const obstacles = new ObstacleField(objects)
  const game = new Game({
    players: [{ name: 'A', pigNames: ['one'] }],
    spawns: [{ x: x + 400, z, heading: 0 }]
  })
  const pig = game.players[0].pigs[0]
  const indoors = createIndoors(objects, () => {})
  const clips = [] as unknown as BattleCore['clips']
  clips[INOUT_CLIP] = { frameCount: 54 } as BattleCore['clips'][number]
  const anim = createAnim(clips as never)
  const loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading)
  const state = {
    loco,
    climbing: null,
    leaving: null,
    carry: null,
    doorstep: null,
    doorRequested: false
  } as unknown as BattleState
  const core = {
    query,
    scenery: { obstacles },
    indoors,
    anim,
    state,
    clips,
    everyone: () => game.players.flatMap((player) => player.pigs)
  } as unknown as BattleCore
  expect(indoors.enter(pig, loco)).toBe(true)
  return { core, state, pig, mount: indoors.all()[0] }
}

/** Frames of the battle's own order: the door, then the carry, then the clock. */
const run = ({ core, state, pig }: Scene, seconds: number): void => {
  for (let t = 0; t < seconds; t += FRAME) {
    doorBeat(core, pig)
    if (state.carry && !advanceCarry(state.carry, state.loco, FRAME)) state.carry = null
    core.anim.update(FRAME)
  }
}

const pressDoor = (scene: Scene): void => {
  scene.state.doorRequested = true
  doorBeat(scene.core, scene.pig)
}

test.describe('the steps', () => {
  test('each is a seventeenth, and eighteen of them land', { tag: '@nodata' }, () => {
    // exe: objects/getting-inside.md, 0x46A2DA — the window over the cursor step,
    // truncated, and the cursor step is the library's 75 plus 1 (0x440E6D).
    expect(DOOR_STEPS).toBe(17)
    // exe: objects/getting-inside.md, 0x46E157 and 0x46E166 — the window includes
    // both its ends, so one more frame lands than was divided for.
    expect(DOOR_FRAMES).toBe(18)
  })

  test('so the pig finishes a seventeenth past what it aimed at', { tag: '@nodata' }, () => {
    const from = { x: 0, y: 0, z: 0 }
    const one = carryOut(from, { x: 1700, y: -340, z: 0 }, CLIP_SECONDS)
    const footing = createLocomotion(terrain(() => 0), 0, 0, 0)
    advanceCarry(one, footing, CLIP_SECONDS)
    // exe: objects/getting-inside.md, 0x46A2DA and 0x46E148
    expect(footing.x).toBeCloseTo(1800, 3)
    expect(footing.y).toBeCloseTo(-360, 3)
  })
})

test.describe('going IN is one arm for both classes', () => {
  for (const name of ['SHELTER', 'TANK']) {
    test(`${name}: to its own middle, after the crouch`, { tag: '@nodata' }, () => {
      const { mount } = inside(name, 0)
      const from = { x: 1700, y: 0, z: 0 }
      const one = carryIn(mount, from, CLIP_SECONDS, false)
      // exe: objects/getting-inside.md, 0x46A233 (building), 0x469F2C (vehicle) —
      // the window is clip 7's events 68 and 69, and the cursor starts at nothing.
      expect(one.hold).toBeCloseTo((CLIP_SECONDS * DOOR_FROM) / PHASE_UNITS, 9)
      expect(one.left).toBeCloseTo((CLIP_SECONDS * (DOOR_TO - DOOR_FROM)) / PHASE_UNITS, 9)
      // exe: objects/getting-inside.md, building 0x46A338, 0x46A392, 0x46A3EA;
      // vehicle 0x46A031, 0x46A08B, 0x46A0E3 — the object's own transform.
      const to = middleOf(mount)
      expect(one.vx * one.left).toBeCloseTo(((to.x - from.x) * DOOR_FRAMES) / DOOR_STEPS, 6)
      expect(one.vy * one.left).toBeCloseTo(((to.y - from.y) * DOOR_FRAMES) / DOOR_STEPS, 6)
    })

    test(`${name}: a pig in the air has no crouch to do`, { tag: '@nodata' }, () => {
      const { mount } = inside(name, 0)
      // exe: objects/getting-inside.md, 0x46A24A (building), 0x469F43 (vehicle) —
      // the cursor goes straight to the first marker for a pig falling or flying.
      expect(carryIn(mount, { x: 900, y: -40, z: 0 }, CLIP_SECONDS, true).hold).toBe(0)
    })
  }

  test('…and the clip starts at that marker for one', { tag: '@nodata' }, () => {
    const scene = inside('SHELTER', 0, 0, 0)
    const { core, state, pig } = scene
    core.indoors.leave(pig)
    state.loco = createLocomotion(core.query, 420, 0, 0)
    pig.position = { x: 420, y: 0, z: 0 }
    state.loco.airborne = { vx: 0, vy: 0, vz: 0, bouncing: false, pushIn: null }
    pressDoor(scene)
    expect(state.carry?.hold).toBe(0)
    // exe: objects/getting-inside.md, 0x46A251 — the same phase, from the cursor.
    expect(core.anim.wornBy(pig).elapsed).toBeCloseTo((CLIP_SECONDS * DOOR_FROM) / PHASE_UNITS, 9)
  })
})

test.describe('coming OUT of a BUILDING', () => {
  // CAMP's shelter is stored at 270°, where the turn shows.
  const YAW = (3 * Math.PI) / 2

  test('moves at once, off the clip\'s first marker', { tag: '@nodata' }, () => {
    const scene = inside('SHELTER', YAW)
    pressDoor(scene)
    // exe: objects/getting-inside.md, 0x46A200 — the cursor is written with the
    // first marker's phase, so there is no crouch on the way out.
    expect(scene.state.carry?.hold).toBe(0)
    const worn = scene.core.anim.wornBy(scene.pig)
    expect(worn.index).toBe(INOUT_CLIP)
    expect(worn.elapsed).toBeCloseTo((CLIP_SECONDS * DOOR_FROM) / PHASE_UNITS, 9)
    expect(worn.left).toBeCloseTo((CLIP_SECONDS * (PHASE_UNITS - DOOR_FROM)) / PHASE_UNITS, 9)
    const before = scene.state.loco.y
    run(scene, FRAME * 2)
    expect(scene.state.loco.y, 'he was still crouching').toBeLessThan(before)
  })

  test('goes straight up, over the first clear step above the ground', { tag: '@nodata' }, () => {
    const scene = inside('SHELTER', YAW)
    pressDoor(scene)
    const { x, z } = middleOf(scene.mount)
    // exe: objects/getting-inside.md, 0x46A150, 0x46A15E — the horizontal steps are
    // written as zero.
    expect(scene.state.carry?.vx).toBe(0)
    expect(scene.state.carry?.vz).toBe(0)
    run(scene, CLIP_SECONDS)
    expect(scene.state.loco.x).toBeCloseTo(x, 6)
    expect(scene.state.loco.z).toBeCloseTo(z, 6)
    // exe: objects/getting-inside.md, 0x46A1CF into 0x479690 (0x47975F) — up from
    // the ground 128 of the exe's doubled units at a time, 64 here, so a box 352
    // tall is cleared at 384. From the middle at 176 that is 208, and a seventeenth
    // past it.
    expect(scene.state.loco.y).toBeCloseTo(-176 - (208 * DOOR_FRAMES) / DOOR_STEPS, 3)
    // exe: objects/getting-inside.md, 0x47CB2E — the clip's end gives him back to
    // the physics, up there.
    expect(scene.state.leaving).toBeNull()
    expect(scene.state.loco.airborne).not.toBeNull()
  })

  test('…the height, a step at a time', { tag: '@nodata' }, () => {
    const roof = -352
    const way = { ...NO_OBSTACLES, blocks: (_x: number, _z: number, y: number) => y > roof }
    // exe: objects/getting-inside.md, 0x47975F — 128 in the exe's doubled heights.
    expect(clearHeight(0, way, 0, 0)).toBe(-384)
    expect(clearHeight(0, NO_OBSTACLES, 0, 0), 'nothing in the way').toBe(0)
    expect(clearHeight(-352, way, 0, 0), 'flush with a roof is clear').toBe(-352)
  })

  test('faces the yaw its record stored, in the exe\'s own angle', { tag: '@nodata' }, () => {
    const { mount } = inside('SHELTER', YAW)
    // exe: objects/getting-inside.md, 0x46A123 on 0x43F3A3 — less a quarter in the
    // constructor, plus a quarter in the arm: the pig's angle is the record's yaw,
    // and at 270° it walks along cos, sin = (0, −1) (0x478CC6).
    const heading = exitHeading(mount)
    expect(Math.sin(heading)).toBeCloseTo(Math.cos(YAW), 9)
    expect(Math.cos(heading)).toBeCloseTo(Math.sin(YAW), 9)
  })

  test('…and the door sets it on the pig', { tag: '@nodata' }, () => {
    const scene = inside('SHELTER', YAW)
    pressDoor(scene)
    expect(scene.pig.heading).toBeCloseTo(exitHeading(scene.mount), 9)
    expect(scene.state.loco.heading).toBeCloseTo(exitHeading(scene.mount), 9)
  })

  test('is let go in the air, however near the ground', { tag: '@nodata' }, () => {
    // exe: objects/getting-inside.md, 0x47CB13 — the building's toggle has no test
    // of the ground, where the vehicle's has (0x47C94D).
    expect(heightOnLeaving('building', 0, -8)).toBe(-8)
  })
})

test.describe('coming OUT of a VEHICLE', () => {
  test('moves at once, off the clip\'s first marker', { tag: '@nodata' }, () => {
    const scene = inside('TANK', 0)
    pressDoor(scene)
    // exe: objects/getting-inside.md, 0x469EFF — the same write as the building's.
    expect(scene.state.carry?.hold).toBe(0)
    expect(scene.core.anim.wornBy(scene.pig).elapsed).toBeCloseTo(
      (CLIP_SECONDS * DOOR_FROM) / PHASE_UNITS,
      9
    )
  })

  test('is put 1024 units off, along +x for the yaw every shipped one has', { tag: '@nodata' }, () => {
    // exe: objects/getting-inside.md, 0x469C9B and 0x469C8C through 0x44E620, on
    // 0x499C76 — at a stored yaw of zero the object's angle is −0x400, the arm's is
    // −0x400 less that, zero, and the polar helper is cosine into x, sine into z.
    expect(VEHICLE_EXIT).toBe(1024)
    const { mount } = inside('TANK', 0)
    const east = exitSpot(mount, middleOf(mount))
    expect(east.x).toBeCloseTo(1024, 6)
    expect(east.z).toBeCloseTo(0, 6)
  })

  test('…off the hull\'s side at every turn of it', { tag: '@nodata' }, () => {
    // exe: objects/getting-inside.md, 0x469C8C — the object's own axis is at −angle
    // and the exit at −angle − 0x400, a quarter turn from it whatever the angle.
    const { mount } = inside('TANK', 0)
    const from = middleOf(mount)
    for (const turn of [0, 0.7, 1.9, -2.4]) {
      mount.box.turn = turn
      const { x, z } = exitSpot(mount, from)
      const along = { x: Math.cos(turn), z: -Math.sin(turn) }
      expect(Math.hypot(x, z), `turn ${turn}`).toBeCloseTo(1024, 6)
      expect(x * along.x + z * along.z, `turn ${turn}`).toBeCloseTo(0, 6)
    }
  })

  test('a building never is', { tag: '@nodata' }, () => {
    const { mount } = inside('SHELTER', Math.PI / 2)
    const from = middleOf(mount)
    expect(exitSpot(mount, from)).toEqual({ x: from.x, z: from.z })
  })

  test('…held inside the world\'s edge', { tag: '@nodata' }, () => {
    // exe: objects/getting-inside.md, 0x469CF9 and 0x469D22 (x), 0x469D4F and
    // 0x469D79 (the far side), and the same pair on z at 0x469DAC.
    expect(EXIT_LIMIT).toBe(0x3000)
    expect(EXIT_EDGE).toBe(0x2ff6)
    const { mount } = inside('TANK', 0, 11900, 0)
    expect(exitSpot(mount, middleOf(mount)).x).toBe(EXIT_EDGE)
    const west = inside('TANK', Math.PI, -11900, 0).mount
    expect(exitSpot(west, middleOf(west)).x).toBe(-EXIT_EDGE)
    const north = inside('TANK', -Math.PI / 2, 0, 11900).mount
    expect(exitSpot(north, middleOf(north)).z).toBe(EXIT_EDGE)
  })

  test('goes there and down to the ground, and is stood on it', { tag: '@nodata' }, () => {
    const scene = inside('TANK', 0)
    pressDoor(scene)
    // exe: objects/getting-inside.md, 0x469EC3 — the height is asked at the exit
    // spot, which is open ground, not over the hull.
    expect(scene.state.carry?.vy).toBeGreaterThan(0)
    run(scene, CLIP_SECONDS)
    // …and all three steps run a seventeenth over.
    expect(scene.state.loco.x).toBeCloseTo((1024 * DOOR_FRAMES) / DOOR_STEPS, 3)
    expect(scene.state.loco.z).toBeCloseTo(0, 3)
    // exe: objects/getting-inside.md, 0x47C94D..0x47C9C1 — within 0x20 of the ground
    // (or under it, which the seventeenth makes of him) he is stood on it.
    expect(scene.state.leaving).toBeNull()
    expect(scene.state.loco.y).toBeCloseTo(0, 9)
    expect(scene.state.loco.airborne).toBeNull()
  })

  test('…the same test, off its numbers', { tag: '@nodata' }, () => {
    // exe: objects/getting-inside.md, 0x47C94D — 0x20 in the exe's doubled heights.
    expect(heightOnLeaving('vehicle', 0, -15)).toBe(0)
    expect(heightOnLeaving('vehicle', 0, 30), 'under it').toBe(0)
    expect(heightOnLeaving('vehicle', 0, -17), 'on something higher').toBe(-17)
  })

  test('faces along +x for the yaw every shipped one has', { tag: '@nodata' }, () => {
    const { mount } = inside('TANK', 0)
    // exe: objects/getting-inside.md, 0x469C23 on 0x499C76 — the constructor's −0x400
    // and the arm's +0x400 cancel, and a pig's angle of zero walks along cos, sin =
    // (1, 0) (0x478CC6).
    const heading = exitHeading(mount)
    expect(Math.sin(heading)).toBeCloseTo(1, 9)
    expect(Math.cos(heading)).toBeCloseTo(0, 9)
  })
})

test.describe('the clip', () => {
  test('a committed clip can start part of the way in', { tag: '@nodata' }, () => {
    const clips = [{ frameCount: 54 }] as never
    const anim = createAnim(clips)
    const pig = {} as Pig
    anim.playOnce(pig, 0)
    expect(anim.wornBy(pig).elapsed).toBe(0)
    expect(anim.wornBy(pig).left).toBeCloseTo(CLIP_SECONDS, 9)
    anim.playOnce(pig, 0, PHASE_UNITS / 2)
    expect(anim.wornBy(pig).elapsed).toBeCloseTo(CLIP_SECONDS / 2, 9)
    expect(anim.wornBy(pig).left).toBeCloseTo(CLIP_SECONDS / 2, 9)
  })
})
