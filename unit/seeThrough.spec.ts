// PHASE 002 (domain) — WHAT HIDES THE PIG is the ART, not the collider.
//
// Play: "текстуры листвы не делаются прозрачными когда свин закрыт ими." A
// tree's collision box is its TRUNK — 192 across on a TREEG — while the
// crown the player actually cannot see through is four times that, so a ray
// from the camera to the pig went through the leaves without ever touching
// the box, and the fade never fired. `sightBlockers` grows a record's box to
// the drawn art's own extents where the renderer supplies them
// (three/battle.ts measures each prop model the way `bodyExtent` measures a
// pig); a record nobody has art for keeps its collision box.

import { test, expect } from '@playwright/test'

import { crossedBy, sightBlockers } from '../src/lib/game/seeThrough'
import type { ArtExtent } from '../src/lib/game/seeThrough'
import type { MapObject } from '../src/lib/formats/pog'

/** A TREEG the way ESTU places one: trunk collider 192×704×192, centre 352
 * up, trunk foot on the ground. */
const TREE = {
  name: 'TREEG',
  id: 7,
  type: 0,
  x: 0,
  y: 352,
  z: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  shape: 0,
  box: { x: 192, y: 704, z: 192 }
} as MapObject

/** The crown, as the drawn mesh measures: 800 wide, same height. */
const CROWN: ArtExtent = { halfX: 400, halfZ: 400, topOffset: -352, bottomOffset: 352 }

/** A sight line through the CANOPY: level with the crown, 300 off the trunk's
 * axis — outside the 96-unit collider, inside the 400-unit crown. */
const eye = { x: 1000, y: -500, z: 300 }
const pig = { x: -1000, y: -500, z: 300 }

test('a ray through the CROWN misses the trunk collider…', { tag: '@nodata' }, () => {
  const bare = sightBlockers([TREE])
  expect(bare).toHaveLength(1)
  expect(crossedBy(bare, eye, pig)).toEqual([])
})

test('…and hits once the box is grown to the drawn art', { tag: '@nodata' }, () => {
  const leafy = sightBlockers([TREE], (name) => (name === 'TREEG' ? CROWN : null))
  expect(crossedBy(leafy, eye, pig)).toEqual([TREE.id])
})

test('the art only ever GROWS a box — a mesh smaller than its collider changes nothing', { tag: '@nodata' }, () => {
  const shrunk: ArtExtent = { halfX: 10, halfZ: 10, topOffset: -10, bottomOffset: 10 }
  const [box] = sightBlockers([TREE], () => shrunk)
  const [bare] = sightBlockers([TREE])
  expect(box).toEqual(bare)
})
