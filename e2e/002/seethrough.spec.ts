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
import { boxOf } from '../../src/lib/game/obstacles'
import { crossedBy, crosses, sightBlockers } from '../../src/lib/game/seeThrough'

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
