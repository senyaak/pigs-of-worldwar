// PHASE 002 (domain) - down the SIGHTS: the zoom, and the tremor that lives IN THE
// AIM.
//
// The ZOOM is the exe's: 0x20 a frame to a cap of 0x1000, for skills 11 and 64 only,
// and the aim STEP is divided by `(0x1000 - zoom) >> 12` on the way out of
// `[game+0x300]` so the sights get finer as they close in (0x495ecc, 0x495bc1).
//
// The TREMOR is a STEP added into the aim itself, every engine frame - the exe feeds
// the analogue stick's reading through `Pig::Aim`, which is the field the camera, the
// barrel and the dial all read. Play settled that after five passes of it being kept
// beside the aim instead: "то что у тебя на камере было - должно было уйти в движок,
// а камера просто всегда должна отражать то что в движке."
//
// One number, so nothing can disagree: the picture follows the sight, the bullet goes
// where the picture points, and nothing is bounded but the aim's own clamp.

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../src/lib/game/zoom'
import { createWobble, resetWobble, wobbleStep } from '../src/lib/game/wobble'
import { layerFires, layerSights, weaponLayer } from '../src/lib/game/controls'
import { SKILL } from '../src/lib/game/skills'
import { createSights } from '../src/lib/game/sights'

/** A deterministic stand-in for `Math.random` - varied, so a walk is a walk, and
 * repeatable, so the numbers below mean something. */
const rolling = (from = 12345): (() => number) => {
  let seed = from
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

/** Where the aim ends up after `frames` engine frames of tremor, starting level. */
const wandered = (frames: number, seed = 12345): number => {
  const wobble = createWobble()
  const random = rolling(seed)
  let angle = 0
  for (let frame = 0; frame < frames; frame++) angle += wobbleStep(wobble, 1, random).pitch
  return angle
}

/** ...and how far it typically gets, over twenty walks. One walk proves nothing: any
 * single one may be passing through zero at the moment you look. */
const typically = (frames: number): number => {
  let sum = 0
  for (let seed = 1; seed <= 20; seed++) sum += Math.abs(wandered(frames, seed * 7919))
  return sum / 20
}

test('only the two zooming skills zoom, and they creep to the cap', { tag: '@nodata' }, () => {
  expect(zoomsIn(11)).toBe(true)
  expect(zoomsIn(64)).toBe(true)
  expect(zoomsIn(19)).toBe(false)
  expect(zoomsIn(null)).toBe(false)

  const zoom = createZoom()
  updateZoom(zoom, 1, true)
  expect(zoom.value).toBe(ZOOM_STEP)
  // 0x20 a frame to 0x1000 - 128 engine frames, and it stops there.
  updateZoom(zoom, 1000, true)
  expect(zoom.value).toBe(ZOOM_CAP)
  expect(zoomFraction(zoom)).toBe(1)
  // Letting the sights go winds it back out.
  updateZoom(zoom, 1000, false)
  expect(zoom.value).toBe(0)
})

test('a step lands once an ENGINE frame, and a fraction owes', { tag: '@nodata' }, () => {
  const wobble = createWobble()
  const random = rolling()
  // Half a frame is nothing yet; the other half pays for it.
  expect(wobbleStep(wobble, 0.5, random).pitch).toBe(0)
  expect(wobbleStep(wobble, 0.5, random).pitch).not.toBe(0)
  // Three frames at once are three steps, not one - a slow render frame owes the
  // engine the same number of steps a fast one does.
  const three = Math.abs(wobbleStep(wobble, 3, random).pitch)
  const one = Math.abs(wobbleStep(wobble, 1, random).pitch)
  expect(three).toBeGreaterThan(0)
  expect(one).toBeGreaterThan(0)
})

test('it WANDERS, and nothing brings it back', { tag: '@nodata' }, () => {
  // A walk of small steps: a rattle frame to frame, a drift over seconds, and no
  // centre anywhere in it. "ЦЕНТРА ВООБЩЕ НЕ ДОЛЖНО БЫТЬ."
  const wobble = createWobble()
  const random = rolling()
  const steps: number[] = []
  let angle = 0
  for (let frame = 0; frame < 240; frame++) {
    const step = wobbleStep(wobble, 1, random)
    steps.push(Math.abs(step.pitch))
    angle += step.pitch
  }
  // Each step is small - this is a stick reading, not a jump...
  expect(Math.max(...steps)).toBeLessThan(3)
  // ...and yet it has gone somewhere, further the longer it runs.
  expect(typically(600)).toBeGreaterThan(typically(30) * 2)
  // The two axes step independently, so it wanders in any direction.
  const both = wobbleStep(createWobble(), 1, rolling())
  expect(both.pitch).not.toBeCloseTo(both.yaw, 6)
})

test('lowering the sights owes nothing - the aim keeps what the tremor put there', { tag: '@nodata' }, () => {
  // There is nothing to put back: the tremor IS the aim now. Stopping the steps is
  // all that lowering the sights does, and the fuse holds the same way - `Pig::Aim`
  // is refused from the press to the attack.
  const wobble = createWobble()
  wobbleStep(wobble, 0.5, rolling())
  resetWobble(wobble)
  expect(wobble.owed).toBe(0)
})

test('a weapon brings its own LAYER, and only two of them have an aim view', { tag: '@nodata' }, () => {
  // Play's model: "каждое оружие — свой контроллер; можно ведь комбинировать их,
  // movement + melee или movement + gun?" This is that table.
  expect(weaponLayer(3)).toBe('melee')
  expect(weaponLayer(19)).toBe('lob')
  expect(weaponLayer(11)).toBe('gun')
  // An EMPTY hand is the only `none`. SKIP TURN has no weapon behind it and F
  // still uses it, so it is its own layer — play drew that line: "пропуск хода
  // это не none, там есть реакция на f, а без оружия нет!"
  expect(weaponLayer(null)).toBe('none')
  expect(weaponLayer(SKILL.SKIP_TURN)).toBe('skill')
  expect(layerFires('none')).toBe(false)
  for (const layer of ['skill', 'melee', 'gun', 'lob'] as const) {
    expect(layerFires(layer)).toBe(true)
  }
  expect(layerSights('skill')).toBe(false)
  // A BLADE has no aim view, which is the bug play kept hitting: G handed the
  // sights over, a set change drops the driving keys, and the pig stopped for
  // nothing. The exe agrees from the other end — 0x46a891 pins a bayonet's aim
  // angle to zero, so there is nothing for an aim view to show.
  expect(layerSights('melee')).toBe(false)
  expect(layerSights('none')).toBe(false)
  expect(layerSights('gun')).toBe(true)
  expect(layerSights('lob')).toBe(true)
})

test('the VIEW key is inert unless the weapon aims', { tag: '@nodata' }, () => {
  // Play: "g, по-моему, для без оружия и для штыка например — вроде тоже двигало
  // камеру." It must not, and this is the rule that says so: `sighting` is what
  // the camera reads (three/battle.ts picks `lob`/`throw` off it and off the
  // weapon's own layer), and it answers for the two layers that HAVE an aim view
  // and no others — which is the exe's own dispatch, where a blade is not among
  // the weapons the aim-bit branch gives a camera to.
  const sights = createSights(() => 0.5)
  sights.setHeld(true)
  for (const [skill, what] of [
    [null, 'empty hands'],
    [SKILL.BAYONET, 'a bayonet'],
    [SKILL.SKIP_TURN, 'SKIP TURN'],
    [SKILL.TNT, 'a planted charge']
  ] as const) {
    expect(sights.sighting(skill), `${what} answered the view key`).toBe(false)
    expect(sights.scoped(skill), `${what} went first person`).toBe(false)
  }
  expect(sights.sighting(SKILL.RIFLE), 'a rifle').toBe(true)
  expect(sights.sighting(SKILL.GRENADE), 'a grenade').toBe(true)
})
