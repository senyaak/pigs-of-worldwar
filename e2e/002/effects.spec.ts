// PHASE 002 (domain) — the rings a blow throws. Pure, no Electron.
//
// Every number is out of the original's effect table: 143 signed bytes per
// kind at 0x4d61e8, scaled per index by 0x4d6c88, read as twelve timed
// stages. `../../../pigs-disasm/effects/notes.md`.

import { test, expect } from '@playwright/test'

import { FRAME_SECONDS } from '../../src/lib/game/ballistics'
import {
  BREAK_EFFECT,
  RING_DEAD,
  advanceEffect,
  beginEffect,
  hitEffectOf,
  ringColour,
  spent
} from '../../src/lib/game/effects'

/** Step an effect by whole frames, the way the engine does. */
const frames = (effect: ReturnType<typeof beginEffect>, n: number): void => {
  for (let i = 0; i < n; i++) advanceEffect(effect, FRAME_SECONDS)
}

test('each melee weapon throws its own id and its own row', () => {
  // Not the grouping the impact SOUNDS use — the bayonet shares I_STAB with
  // the knife and the prod, and shares its ring with neither.
  expect(hitEffectOf(1)).toMatchObject({ id: 0x37, kind: 0x0b })
  expect(hitEffectOf(2)).toMatchObject({ id: 0x37, kind: 0x0b })
  expect(hitEffectOf(3)).toMatchObject({ id: 0x36, kind: 0x0a })
  expect(hitEffectOf(4)).toMatchObject({ id: 0x38, kind: 0x0c })
  expect(hitEffectOf(5)).toMatchObject({ id: 0x39, kind: 0x09 })
  // Nothing else is a melee weapon, so nothing else throws one.
  expect(hitEffectOf(6)).toBeNull()
  expect(hitEffectOf(null)).toBeNull()
})

test('the bayonet throws two rings and the sword three', () => {
  expect(hitEffectOf(3)!.rings).toHaveLength(2)
  expect(hitEffectOf(4)!.rings).toHaveLength(3)
  expect(hitEffectOf(5)!.rings).toHaveLength(3)
})

test('the second ring is born three frames after the first', () => {
  const effect = beginEffect(hitEffectOf(3)!, { x: 0, y: 0, z: 0 })
  expect(effect.rings).toHaveLength(0)
  frames(effect, 1)
  expect(effect.rings).toHaveLength(1)
  frames(effect, 2)
  expect(effect.rings).toHaveLength(1)
  frames(effect, 1) // frame 4
  expect(effect.rings).toHaveLength(2)
})

test('a bayonet ring grows 25 a frame and lives seven of them', () => {
  const effect = beginEffect(hitEffectOf(3)!, { x: 100, y: -50, z: 200 })
  frames(effect, 1)
  const [first] = effect.rings
  // Born at nothing and already stepped once by the frame it appears on.
  expect(first).toMatchObject({ x: 100, y: -50, z: 200, radius: 25, width: 5, age: 14 })
  frames(effect, 3)
  expect(effect.rings[0].radius).toBe(100)
  expect(effect.rings[0].age).toBe(56)
  // 100/14 is 7.14, so the seventh step is the last one under 100.
  frames(effect, 3)
  expect(effect.rings[0].age).toBe(98)
  frames(effect, 1)
  expect(effect.rings.map((one) => one.age)).not.toContain(112)
})

test("the sword's big rings SLOW as they go out — the only negative drift", () => {
  const effect = beginEffect(hitEffectOf(4)!, { x: 0, y: 0, z: 0 })
  frames(effect, 1)
  const one = effect.rings[0]
  expect(one.growth).toBe(48) // 50, less the drift, once
  frames(effect, 9)
  expect(one.growth).toBe(30)
  // It is still going: an age step of 4 is twenty-five frames.
  expect(one.age).toBeLessThan(RING_DEAD)
})

test('a hit is a white flash that collapses into the row own colour', () => {
  const effect = beginEffect(hitEffectOf(3)!, { x: 0, y: 0, z: 0 })
  frames(effect, 1)
  const one = effect.rings[0]
  // c * 400 / (age + 1): at an age of fourteen red and blue are both over
  // the top and green is nearly — so the flash is a hot pink-white, not a
  // pure one. (10, 7, 15) of 31 never has as much green as the other two.
  const flash = ringColour(one)
  expect(flash[0]).toBe(1)
  expect(flash[2]).toBe(1)
  expect(flash[1]).toBeGreaterThan(0.7)
  expect(flash[1]).toBeLessThan(1)
  one.age = 98
  const [r, g, b] = ringColour(one)
  // …and at the end it is the table's own dark blue-purple: blue highest,
  // red about two thirds of it, green about half.
  expect(b).toBeGreaterThan(r)
  expect(r).toBeGreaterThan(g)
  expect(b).toBeLessThan(0.3)
})

test('an effect is spent once its last ring has gone', () => {
  const effect = beginEffect(hitEffectOf(3)!, { x: 0, y: 0, z: 0 })
  expect(spent(effect)).toBe(false)
  frames(effect, 30)
  expect(effect.rings).toHaveLength(0)
  expect(spent(effect)).toBe(true)
})

test('a thing BREAKING makes smoke and not one ring', () => {
  // Row 0 is a different animal from the hand-to-hand rows: stages F, G and H
  // are all off, and what it has is the burst.
  expect(BREAK_EFFECT.rings).toHaveLength(0)
  const effect = beginEffect(BREAK_EFFECT, { x: 0, y: -100, z: 0 })
  frames(effect, 2)
  expect(effect.smoke).toHaveLength(0)
  frames(effect, 1) // the burst is on frame 3
  expect(effect.smoke).toHaveLength(6)
})

test('the smoke RISES — the byte the engine calls gravity is buoyancy', () => {
  // y is DOWN in this space, and the engine SUBTRACTS the byte from the y
  // velocity every frame, so a puff climbs and climbs faster.
  const effect = beginEffect(BREAK_EFFECT, { x: 0, y: 0, z: 0 })
  frames(effect, 3)
  const puff = effect.smoke[0]
  expect(puff.y).toBeLessThan(0)
  const firstStep = puff.y
  frames(effect, 1)
  expect(puff.y - firstStep).toBeLessThan(firstStep)
  // …and outward at the same time: it left along its own bearing.
  expect(Math.hypot(puff.x, puff.z)).toBeGreaterThan(0)
})

test('the smoke goes out, and the effect with it', () => {
  const effect = beginEffect(BREAK_EFFECT, { x: 0, y: 0, z: 0 })
  frames(effect, 3)
  expect(spent(effect)).toBe(false)
  // A step of 10 is ten frames of life, counted from the frame it appeared.
  frames(effect, 10)
  expect(effect.smoke).toHaveLength(0)
  expect(spent(effect)).toBe(true)
})

test('a long frame does not let a stage go by unfired', () => {
  // The engine counts FRAMES; a renderer that stalls hands back a delta worth
  // several, and both rings must still be born.
  const effect = beginEffect(hitEffectOf(4)!, { x: 0, y: 0, z: 0 })
  advanceEffect(effect, FRAME_SECONDS * 6)
  expect(effect.rings).toHaveLength(3)
})
