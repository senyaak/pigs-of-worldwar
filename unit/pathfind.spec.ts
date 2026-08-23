// PHASE 002 (domain) — the route round the world. Pure, no Electron.
//
// The ground here is synthetic — a few lambdas standing in for
// `TerrainQuery` — because what is pinned is the SEARCH: binary passability,
// the directed climb, best effort toward an unreachable goal
// (lib/game/pathfind.ts). The real ground's own verdicts are pinned where
// they live (terrain, obstacles).

import { test, expect } from '@playwright/test'

import { GRID_STEP, route } from '../src/lib/game/pathfind'
import type { Ground } from '../src/lib/game/pathfind'
import { WALL_CLIMB } from '../src/lib/game/locomotion'

const flat = (over: Partial<Ground> = {}): Ground => ({
  walkable: () => true,
  height: () => 0,
  isWater: () => false,
  hasMine: () => false,
  ...over
})

test('an open field is walked straight: one corner, the goal itself', { tag: '@nodata' }, () => {
  const corners = route({ ground: flat() }, { x: 0, z: 0 }, { x: 1024, z: 0 })
  expect(corners).toEqual([{ x: 1024, z: 0 }])
})

test('a wall with one gap is threaded through the gap', { tag: '@nodata' }, () => {
  // A wall down the whole x=256 column, except the cell at z=512.
  const ground = flat({ walkable: (x, z) => x !== 256 || z === 512 })
  const corners = route({ ground }, { x: 0, z: 0 }, { x: 512, z: 0 })!
  expect(corners.at(-1)).toEqual({ x: 512, z: 0 })
  // The detour is real: the route bends instead of running straight, and it
  // bends up to the gap's own row to cross there.
  expect(corners.length).toBeGreaterThan(1)
  expect(corners.some((corner) => corner.z === 512)).toBe(true)
})

test('water stops a walker and carries a swimmer', { tag: '@nodata' }, () => {
  // A strip of water across the whole world at z=256.
  const ground = flat({ isWater: (_x, z) => z === 256 })
  const walker = route({ ground }, { x: 0, z: 0 }, { x: 0, z: 512 })!
  // Best effort: the walker's route ends on the near bank, not across it.
  expect(walker.every((corner) => corner.z < 256)).toBe(true)
  const swimmer = route({ ground, swims: true }, { x: 0, z: 0 }, { x: 0, z: 512 })!
  expect(swimmer.at(-1)).toEqual({ x: 0, z: 512 })
})

test('for a swimmer the water is a SHORTCUT: across the bay, not round it', { tag: '@nodata' }, () => {
  // A bay spans the world except for a far land bridge at x >= 1280. The
  // cost is TIME (docs/ai.md): a wet step costs SWIM_COST (~4.3) of a dry
  // one, and here even at that price the crossing beats the long way
  // round — so the swimmer crosses and the walker detours.
  const ground = flat({ isWater: (x, z) => x < 1280 && z >= 256 && z <= 512 })
  const from = { x: 0, z: 0 }
  const goal = { x: 0, z: 768 }
  const length = (corners: { x: number; z: number }[]): number => {
    let at = from
    let sum = 0
    for (const corner of corners) {
      sum += Math.hypot(corner.x - at.x, corner.z - at.z)
      at = corner
    }
    return sum
  }
  const swimmer = route({ ground, swims: true }, from, goal)!
  const walker = route({ ground }, from, goal)!
  expect(swimmer.at(-1)).toEqual(goal)
  expect(walker.at(-1)).toEqual(goal)
  // The walker's detour reaches the land bridge; the swimmer's line never
  // leaves the column it started in.
  expect(walker.some((corner) => corner.x >= 1280)).toBe(true)
  expect(swimmer.every((corner) => corner.x === 0)).toBe(true)
  expect(length(swimmer)).toBeLessThan(length(walker))
})

test('…and ROUND the water when the walk is quicker than the swim', { tag: '@nodata' }, () => {
  // The same bay, but the land bridge is CLOSE (x >= 384): swimming the
  // three wet cells costs ~2050 in walked units against a ~1300 detour, so
  // the time model sends the swimmer round on its legs. Play's rule:
  // "через воду намного медленнее" — a crossing that saves distance but
  // not time is no shortcut.
  const ground = flat({ isWater: (x, z) => x < 384 && z >= 256 && z <= 512 })
  const swimmer = route({ ground, swims: true }, { x: 0, z: 0 }, { x: 0, z: 768 })!
  expect(swimmer.at(-1)).toEqual({ x: 0, z: 768 })
  expect(swimmer.some((corner) => corner.x >= 448)).toBe(true)
})

test('a swimmer rides the WATERLINE: a deep bay is crossed, and left again', { tag: '@nodata' }, () => {
  // The bay's BED lies four climb envelopes down. Feet measured off the bed
  // would make the far shore a cliff — routed in, never out — so a wet cell
  // stands on the SURFACE the ground names, and the crossing completes.
  const drowned = {
    isWater: (_x: number, z: number) => z >= 256 && z <= 512,
    height: (_x: number, z: number) => (z >= 256 && z <= 512 ? WALL_CLIMB * 4 : 0)
  }
  const out = route(
    { ground: flat({ ...drowned, surface: () => 0 }), swims: true },
    { x: 0, z: 0 },
    { x: 0, z: 768 }
  )!
  expect(out.at(-1)).toEqual({ x: 0, z: 768 })
  // …and without a surface the bed is all there is: the route bogs down in
  // the bay, which is the failure the field exists to prevent.
  const bedded = route({ ground: flat(drowned), swims: true }, { x: 0, z: 0 }, { x: 0, z: 768 })!
  expect(bedded.at(-1)!.z).toBeLessThan(768)
})

test('a known mine is walked ROUND, never onto', { tag: '@nodata' }, () => {
  const ground = flat({ hasMine: (x, z) => x === 256 && z === 0 })
  const corners = route({ ground }, { x: 0, z: 0 }, { x: 512, z: 0 })!
  expect(corners.at(-1)).toEqual({ x: 512, z: 0 })
  expect(corners.some((corner) => corner.x === 256 && corner.z === 0)).toBe(false)
})

test('the graph is DIRECTED: any drop is walked off, the climb is capped', { tag: '@nodata' }, () => {
  // Y-DOWN: the ground at x >= 256 is LOWER by four climb envelopes.
  const cliff = flat({ height: (x) => (x >= 256 ? WALL_CLIMB * 4 : 0) })
  const down = route({ ground: cliff }, { x: 0, z: 0 }, { x: 512, z: 0 })!
  expect(down.at(-1)).toEqual({ x: 512, z: 0 })
  // Back up: unreachable, and best effort parks at the cliff's foot.
  const up = route({ ground: cliff }, { x: 512, z: 0 }, { x: 0, z: 0 })!
  expect(up.length).toBeGreaterThan(0)
  expect(up.at(-1)!.x).toBe(256)
})

test('a prop shuts cells the terrain would allow', { tag: '@nodata' }, () => {
  // A prop squatting on the straight line's midpoint column, one cell wide.
  const squat = (x: number, z: number): boolean => x === 256 && Math.abs(z) <= GRID_STEP
  const obstruction = {
    standOn: () => null,
    blocks: (x: number, z: number) => squat(x, z)
  }
  const corners = route({ ground: flat(), obstruction }, { x: 0, z: 0 }, { x: 512, z: 0 })!
  expect(corners.at(-1)).toEqual({ x: 512, z: 0 })
  expect(corners.some((corner) => squat(corner.x, corner.z))).toBe(false)
})

test('a bridge DECK is a road over water the walker could not cross', { tag: '@nodata' }, () => {
  // The same strip of water at z=256, but a deck spans it at x=0 — the prop
  // world's `standOn` holds the feet level over the wet tile.
  const ground = flat({ isWater: (_x, z) => z === 256 })
  const obstruction = {
    standOn: (x: number, z: number) => (x === 0 && z === 256 ? 0 : null),
    blocks: () => false
  }
  const corners = route({ ground, obstruction }, { x: 0, z: 0 }, { x: 0, z: 512 })!
  expect(corners.at(-1)).toEqual({ x: 0, z: 512 })
  // …and a walker starting to one SIDE crosses at the bridge, not the water.
  const round = route({ ground, obstruction }, { x: 512, z: 0 }, { x: 512, z: 512 })!
  expect(round.at(-1)).toEqual({ x: 512, z: 512 })
  expect(round.some((corner) => corner.x === 0)).toBe(true)
})

test('standing at the goal already is an EMPTY route, not a refusal', { tag: '@nodata' }, () => {
  expect(route({ ground: flat() }, { x: 0, z: 0 }, { x: 10, z: 10 })).toEqual([])
})
