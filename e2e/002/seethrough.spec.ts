// PHASE 002 — SEEING THE PIG THROUGH A WALL.
//
// Play: "здание не просвечивает когда свинья внутри", and then "там
// полупрозрачность — в exe посмотри." He is right that the original has one, and
// this is what it is:
//
// ```
// 44e441  eax = [obj+0x38]                 ; the body type
// 44e45a  jmp [eax*4 + 0x44e5e8]           ; ...twelve draw arms, one per type
// 44e486  ; --- type 0x1359, a BUILDING ---
// 44e48a  cmp [[esp+0x10]+0x170], esi      ; is the watched pig INSIDE this one?
// 44e493  call [0x53804c]                  ; afForceTransparencyOff(building)
// 44e49e  0x45e110(building)               ; ...and then draw it
// ```
//
// `[0x53804c]` is `_d3d.dll`'s `afForceTransparencyOff`, resolved by name at
// 0x4ac916, and `[pig+0x170]` is what a pig has ENTERED — the same field the pig's
// own vtable slot +0x20 delegates through. So the original's rule is: the building
// the camera's pig is inside is drawn through the transparency hook.
//
// Two things it is NOT. The PC wrapper's hook is a stub — `afForceTransparencyOff`
// stores its argument at `[0x11c94838]` and nothing in the DLL ever reads it back
// (both writes found, no readers). And the semi-transparency is not in the ART
// either: the PSX palette bit is set in 6 of CAMP's 191 textures and not one of
// them belongs to the house or the shelter.
//
// And CAMP's house is not a BUILDING at all — it is eighteen scenery pieces
// (lib/game/breakable.ts) — so the exe's rule would not cover the case play is
// standing in. What the remake does is the general version of it: whatever stands
// between the camera and the pig goes see-through (lib/game/seeThrough.ts,
// three/props.ts).

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { expect, test } from '../app'
import { GAME_DIR } from '../launch'
import { warp } from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { parsePmg } from '../../src/lib/formats/pmg'
import { HEIGHT_SCALE, TerrainQuery } from '../../src/lib/game/terrain'
import { boxOf, isSolid } from '../../src/lib/game/obstacles'
import { isRamp } from '../../src/lib/game/ramps'
import {
  crossedBy,
  crossedTowards,
  crosses,
  sightBlockers,
  silhouetteOf
} from '../../src/lib/game/seeThrough'
import { PIG_HEIGHT, PIG_HOLD, PIG_RADIUS } from '../../src/lib/game/obstacles'

type Page = import('@playwright/test').Page

const mapFile = (name: string): Buffer => readFileSync(path.join(GAME_DIR, 'Maps', name))
const CAMP = parsePog(mapFile('CAMP.POG'))

/** Inside CAMP's house: the middle of its floor, record 48's own spot. */
const INDOORS = { x: -7680, z: -1024 }

test('a segment through a wall crosses it, and one along the wall does not', () => {
  // The wall play walks through the door of: STW04_D2, 64 thick and 512 either
  // way, at yaw 270.
  const door = CAMP.find((object) => object.name === 'STW04_D2')!
  const box = boxOf(door)
  const middle = { x: door.x, y: -door.y * HEIGHT_SCALE, z: door.z }

  // Straight through it, from either side.
  expect(
    crosses(box, { ...middle, x: middle.x - 900 }, { ...middle, x: middle.x + 900 }),
    'through the wall'
  ).toBe(true)
  // …and past it, a thousand units off to the side of a box that is 512 long.
  expect(
    crosses(box, { ...middle, x: middle.x - 900, z: middle.z + 1200 }, { ...middle, z: middle.z + 1200 }),
    'wide of the wall'
  ).toBe(false)
  // Nor does a segment that stops short of it count.
  expect(
    crosses(box, { ...middle, x: middle.x - 900 }, { ...middle, x: middle.x - 600 }),
    'stopping short'
  ).toBe(false)

  // A box is ORIENTED and the slab test is done in its own frame. The door's
  // record yaw is 270°, which `modelRotationY` turns into a half — so its own axes
  // are the world's, negated, and the crossing above is along its thin side.
  expect(Math.abs(Math.cos(box.turn) + 1), 'the door is turned a half').toBeLessThan(1e-5)
  expect(box.halfX * 2, 'and it is 64 thick').toBe(64)
})

test('the eye above the house sees it in the way, and out on the path it does not', () => {
  const query = new TerrainQuery(parsePmg(mapFile('CAMP.PMG')))
  const blockers = sightBlockers(CAMP)
  expect(blockers.length, 'CAMP has boxes to look through').toBeGreaterThan(20)

  const ground = (at: { x: number; z: number }): number => query.height(at.x, at.z)
  // The camera sits behind and above; from up there the roof is between it and a
  // pig standing on the floor.
  const eye = { x: INDOORS.x + 2600, y: ground(INDOORS) - 1400, z: INDOORS.z + 2600 }
  const inside = { x: INDOORS.x, y: ground(INDOORS) - 160, z: INDOORS.z }
  const hidden = crossedBy(blockers, eye, inside)
  expect(hidden.length, 'nothing hides a pig indoors').toBeGreaterThan(0)
  // …and every one of them is the house, not a tree the other side of the map.
  const names = hidden.map(
    (id) => CAMP.find((object) => object.id === id)!.name.toUpperCase()
  )
  expect(names.every((name) => /^ST[FRWS]/.test(name)), `hid ${names.join(', ')}`).toBe(true)

  // Out in the open — the training ground's green path — the same eye sees clear.
  const open = { x: 3000, y: ground({ x: 3000, z: 3000 }) - 160, z: 3000 }
  const clearEye = { x: open.x + 2600, y: open.y - 1400, z: open.z + 2600 }
  expect(crossedBy(blockers, clearEye, open), 'the open path is not hidden').toEqual([])
})

const fadedCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.pow!.debug!.props().faded)

test('the app fades the house round a pig inside it, and nothing in the open', async ({
  app
}) => {
  const { page } = app
  await startGame(page)
  // Out on the map first: nothing between the camera and the pig.
  await warp(page, 3000, 3000, 0)
  await page.waitForTimeout(700)
  expect(await fadedCount(page), 'something was faded in the open').toBe(0)

  // …and inside the house, where the camera has nowhere to swing to.
  await warp(page, INDOORS.x, INDOORS.z, 0)
  await expect
    .poll(async () => fadedCount(page), {
      timeout: 4000,
      message: 'the house to go see-through'
    })
    .toBeGreaterThan(0)

  // Back out, and it goes solid again — the fade is per frame, not a one-way door.
  await warp(page, 3000, 3000, 0)
  await expect.poll(async () => fadedCount(page), { timeout: 4000 }).toBe(0)

  expect(app.errors()).toEqual([])
})

test('a RAMP is never in the way, and only what COVERS the pig fades', () => {
  // Play: "просвечивание включается на рампе — не должно, ведь она за свином, не
  // между ним и камерой." A ramp's box is the whole triangular prism
  // (lib/game/ramps.ts), so a pig on its LOW end has its middle well below the
  // box's top and a camera behind and above looks down THROUGH the slab to reach
  // it. What you stand on is never between you and anything.
  const ramps = CAMP.filter((one) => isRamp(one.name) && isSolid(one))
  expect(ramps.length, 'CAMP carries ramps').toBeGreaterThan(0)
  const blockers = sightBlockers(CAMP)
  for (const ramp of ramps) {
    expect(blockers.some((box) => box.id === ramp.id), `${ramp.name} #${ramp.id} still fades`).toBe(
      false
    )
  }

  // …and the other half, which is the same dummy seen from two sides. Play:
  // "манекен пропадает когда я подхожу вплотную", and then "всё ещё становятся
  // прозрачными вещи, которые не перекрывают свина — то есть стоят не между ним
  // и камерой." A box is in the way when it covers HALF his silhouette, and a
  // box beside him covers none of it.
  const dummy = CAMP.find((one) => one.name.toUpperCase() === 'DUMMY')!
  const target = boxOf(dummy)
  expect(blockers.some((one) => one.id === dummy.id), 'a dummy blocks sight at all').toBe(true)
  // The camera behind (+z) and above, the way the chase rig stands.
  type Spot = { x: number; y: number; z: number }
  const look = (feet: { x: number; z: number }): { eye: Spot; body: Spot } => {
    const body = { x: feet.x, y: target.bottom, z: feet.z }
    return { eye: { x: body.x, y: body.y - 1000, z: body.z + 2200 }, body }
  }
  const seen = (feet: { x: number; z: number }): number[] => {
    const { eye, body } = look(feet)
    return crossedTowards(
      blockers,
      eye,
      silhouetteOf(eye, body, PIG_HEIGHT, PIG_RADIUS, PIG_HOLD / 2)
    )
  }

  // Standing the far side of it: the dummy is between him and the camera.
  expect(seen({ x: target.x, z: target.z - 400 }), 'the dummy in front of him').toContain(dummy.id)
  // …and standing BESIDE it, close enough to swing at, it hides nothing.
  const beside = { x: target.x + 300, z: target.z }
  expect(seen(beside), 'a dummy at his shoulder').not.toContain(dummy.id)
  // And this is exactly what the margin used to do: grown by half a tile the
  // very same box counts as being in front of him.
  const { eye, body } = look(beside)
  expect(
    crossedTowards(blockers, eye, silhouetteOf(eye, body, PIG_HEIGHT, PIG_RADIUS, PIG_HOLD / 2), 256),
    'the old margin is what faded it'
  ).toContain(dummy.id)
})
