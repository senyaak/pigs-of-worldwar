// PHASE 002 (domain) — the rings a blow throws. Pure, no Electron.
//
// Every number is out of the original's effect table: 143 signed bytes per
// kind at 0x4d61e8, scaled per index by 0x4d6c88, read as twelve timed
// stages. `../../../pigs-disasm/effects/notes.md`.

import { test, expect } from '@playwright/test'

import { EXE_FRAME_SECONDS } from '../../src/lib/game/ballistics'
import { CLOUD_DEAD, CLOUD_STEP, cloudChannel, cloudSize } from '../../src/lib/game/cloud'
import {
  BLAST_EFFECT,
  BREAK_EFFECT,
  RING_DEAD,
  advanceEffect,
  beginEffect,
  hitEffectOf,
  ringColour,
  spent
} from '../../src/lib/game/effects'

/**
 * Step an effect by whole frames, the way the engine does — at the ENGINE's
 * rate. `FRAME_SECONDS` is the walk's stretched 1/15 and nothing in the effect
 * system counts a pig's stride.
 */
const frames = (effect: ReturnType<typeof beginEffect>, n: number): void => {
  for (let i = 0; i < n; i++) advanceEffect(effect, EXE_FRAME_SECONDS)
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

test('a BLAST and a BREAKING are the same parameter row', () => {
  // Both ids land on the same init arm — 0x488f80, `push 0; call 0x48ccc0` —
  // so what separates them is the id and nothing about the look.
  expect(BREAK_EFFECT.id).toBe(0x3e)
  expect(BLAST_EFFECT.id).toBe(0x54)
  expect(BREAK_EFFECT.kind).toBe(0)
  expect(BLAST_EFFECT.kind).toBe(0)
  expect(BLAST_EFFECT.clouds).toEqual(BREAK_EFFECT.clouds)
  expect(BLAST_EFFECT.bursts).toEqual(BREAK_EFFECT.bursts)
})

test('row 0 has no ring in it, and five stages that are not rings', () => {
  // F, G and H are off, which is why a hit and a blast look nothing alike.
  expect(BREAK_EFFECT.rings).toHaveLength(0)
  expect(BREAK_EFFECT.clouds).toHaveLength(2)
  expect(BREAK_EFFECT.bursts).toHaveLength(3)
})

test('the fireball is a hundred and forty sprites, and it comes first', () => {
  const effect = beginEffect(BLAST_EFFECT, { x: 0, y: -100, z: 0 })
  frames(effect, 1)
  // Stage B on frame 1: seventy sprites, dark red.
  expect(effect.clouds).toHaveLength(1)
  expect(effect.clouds[0].blobs).toHaveLength(70)
  expect(effect.clouds[0].colour).toEqual([16, 0, 0])
  frames(effect, 1)
  // …and stage A on frame 2, seventy more.
  expect(effect.clouds).toHaveLength(2)
  expect(effect.clouds[0].blobs.length + effect.clouds[1].blobs.length).toBe(140)
})

test('the fireball goes UP, and gravity brings it back', () => {
  // The engine's world has +y up — all three of its force generators point
  // (0,-1,0) — so the byte it subtracts from the vertical is gravity. Game
  // space is Y-down, so a rising sprite has a NEGATIVE y velocity here.
  const effect = beginEffect(BLAST_EFFECT, { x: 0, y: 0, z: 0 })
  frames(effect, 1)
  const cloud = effect.clouds[0]
  expect(cloud.blobs.every((blob) => blob.dy < 0)).toBe(true)
  const before = cloud.blobs[0].dy
  frames(effect, 1)
  // Gravity is 20 a frame and it takes the climb off, so dy moves toward zero.
  expect(cloud.blobs[0].dy).toBe(before + 20)
  // …and out along its own bearing at the same time.
  expect(Math.hypot(cloud.blobs[0].x, cloud.blobs[0].z)).toBeGreaterThan(0)
})

test('a fireball SHRINKS over twenty frames and then is gone', () => {
  const effect = beginEffect(BLAST_EFFECT, { x: 0, y: 0, z: 0 })
  frames(effect, 1)
  const cloud = effect.clouds[0]
  const born = cloudSize(cloud)
  frames(effect, 1)
  expect(cloudSize(cloud)).toBeLessThan(born)
  // The age steps 5 a frame and dies at 100: twenty frames, counted from the
  // frame it was born on, since the step runs in that frame's own tail.
  expect(CLOUD_DEAD / CLOUD_STEP).toBe(20)
  frames(effect, 17) // frame 19, and both are still up
  expect(effect.clouds).toHaveLength(2)
  frames(effect, 1)
  expect(effect.clouds).toHaveLength(1) // the second one is a frame behind
  frames(effect, 1)
  expect(effect.clouds).toHaveLength(0)
})

test('a cloud does not flash the way a ring does', () => {
  // A ring divides its colour by its age and so is blinding on frame one; a
  // cloud's law is flat, `c * 400 >> 6`, so the brightest anything gets is 193
  // rather than 255.
  expect(cloudChannel(16)).toBe(100)
  expect(cloudChannel(0)).toBe(0)
  expect(cloudChannel(31)).toBe(193)
})

test('the smoke bursts come after the fireball, and none of them falls', () => {
  const effect = beginEffect(BREAK_EFFECT, { x: 0, y: 0, z: 0 })
  frames(effect, 1)
  expect(effect.smoke).toHaveLength(0)
  frames(effect, 1) // stage I on frame 2
  expect(effect.smoke).toHaveLength(4)
  frames(effect, 1) // stages J and K on frame 3
  expect(effect.smoke).toHaveLength(14)
  // Row 0's bursts all carry a gravity of 0, so a puff drifts and never falls.
  expect(effect.smoke.every((one) => one.gravity === 0)).toBe(true)
})

test('the smoke goes out, and the effect with it', () => {
  const effect = beginEffect(BREAK_EFFECT, { x: 0, y: 0, z: 0 })
  frames(effect, 3)
  expect(spent(effect)).toBe(false)
  // The longest-lived stage is K, at an age step of 3: thirty-four frames from
  // the frame it appeared.
  frames(effect, 34)
  expect(effect.smoke).toHaveLength(0)
  expect(spent(effect)).toBe(true)
})

test('a long frame does not let a stage go by unfired', () => {
  // The engine counts FRAMES; a renderer that stalls hands back a delta worth
  // several, and both rings must still be born.
  const effect = beginEffect(hitEffectOf(4)!, { x: 0, y: 0, z: 0 })
  advanceEffect(effect, EXE_FRAME_SECONDS * 6)
  expect(effect.rings).toHaveLength(3)
})
