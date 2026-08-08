// PHASE 002 (domain) - down the SIGHTS: the zoom, and the tremor that moves the MARK.
//
// The ZOOM is the exe's: 0x20 a frame to a cap of 0x1000, for skills 11 and 64 only,
// and the aim STEP is divided by `(0x1000 - zoom) >> 12` on the way out of
// `[game+0x300]` so the sights get finer as they close in (0x495ecc, 0x495bc1).
//
// The TREMOR is the mark on the glass wandering while the camera holds still - play
// named the mistake it replaces outright, "вместо того чтобы трясти прицел, ты
// тряс камеру?????" - and it is two halves: a JITTER sampled every engine frame
// and a DRIFT that is a free random walk with no centre and no bound. The shot leaves
// along the same offset, so what is under the mark is what is hit, and the zoom needs
// no scaling of its own because an angle over a smaller field of view is a bigger
// fraction of the glass.

import { test, expect } from '@playwright/test'

import { ZOOM_CAP, ZOOM_STEP, createZoom, updateZoom, zoomFraction, zoomsIn } from '../../src/lib/game/zoom'
import { createWobble, resetWobble, updateWobble, wobblePitch, wobbleYaw } from '../../src/lib/game/wobble'
import { layerFires, layerSights, weaponLayer } from '../../src/lib/game/controls'
import { SKILL } from '../../src/lib/game/skills'

/** A deterministic stand-in for `Math.random` - varied, so a walk is a walk, and
 * repeatable, so the numbers below mean something. */
const rolling = (from = 12345): (() => number) => {
  let seed = from
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
}

/** Run the tremor for `frames` engine frames. */
const shaken = (frames = 240, seed = 12345): ReturnType<typeof createWobble> => {
  const wobble = createWobble()
  const random = rolling(seed)
  for (let frame = 0; frame < frames; frame++) updateWobble(wobble, 1, random)
  return wobble
}

/** How far the DRIFT typically gets in `frames` frames, over twenty walks. One walk
 * proves nothing — it is a random walk, and any single one may come back through the
 * middle at the moment you look. */
const typically = (frames: number): number => {
  let sum = 0
  for (let seed = 1; seed <= 20; seed++) sum += Math.abs(shaken(frames, seed * 7919).driftPitch)
  return sum / 20
}

test('only the two zooming skills zoom, and they creep to the cap', () => {
  expect(zoomsIn(11)).toBe(true)
  expect(zoomsIn(64)).toBe(true)
  expect(zoomsIn(19)).toBe(false)
  expect(zoomsIn(null)).toBe(false)

  const zoom = createZoom()
  updateZoom(zoom, 1, true)
  expect(zoom.value).toBe(ZOOM_STEP)
  // 0x20 a frame to 0x1000 — 128 engine frames, and it stops there.
  updateZoom(zoom, 1000, true)
  expect(zoom.value).toBe(ZOOM_CAP)
  expect(zoomFraction(zoom)).toBe(1)
  // Letting the sights go winds it back out.
  updateZoom(zoom, 1000, false)
  expect(zoom.value).toBe(0)
})

test('the MARK wanders freely - no centre, and nothing pulls it back', () => {
  const wobble = createWobble()
  const random = rolling()
  const seen: number[] = []
  for (let frame = 0; frame < 240; frame++) {
    updateWobble(wobble, 1, random)
    seen.push(wobblePitch(wobble))
  }
  // It gets properly away from the middle - further than the jitter alone reaches,
  // because the drift's steps add up and nothing brings them back.
  expect(Math.max(...seen.map(Math.abs))).toBeGreaterThan(10)
  // ...and it gets there by STEPS: the drift is a walk, so consecutive frames are
  // neighbours rather than independent draws. (The jitter rides on top, which is why
  // this is generous.)
  const steps = seen.slice(1).map((one, i) => Math.abs(one - seen[i]))
  expect(Math.max(...steps)).toBeLessThan(2 * 7 + 2)
  // The two axes are independent, which is what lets it go in any direction.
  expect(wobbleYaw(wobble)).not.toBeCloseTo(wobblePitch(wobble), 3)
})

test('the drift GOES SOMEWHERE over time, and the jitter does not', () => {
  // A walk wanders as the square root of the frames, so the longer the scope is up
  // the further off the mark can be. The jitter, sampled fresh each frame, does not
  // accumulate at all.
  expect(typically(600)).toBeGreaterThan(typically(30) * 2)
  expect(Math.abs(shaken(600).jitterPitch)).toBeLessThan(8)
})

test('it FREEZES when it stops being advanced - that is the fuse', () => {
  // `Pig::Aim` is refused from the fire press until the attack and the tremor
  // arrives through it, so the mark stops dead and the bullet leaves along what the
  // player last saw. Resetting instead read as the shot lagging a second.
  const wobble = shaken(60)
  const held = wobblePitch(wobble)
  expect(held).not.toBe(0)
  expect(wobblePitch(wobble)).toBe(held)
})

test('nothing at all once the sights are lowered for good', () => {
  const wobble = shaken(60)
  expect(Math.abs(wobblePitch(wobble))).toBeGreaterThan(0)
  resetWobble(wobble)
  expect(wobblePitch(wobble)).toBe(0)
  expect(wobbleYaw(wobble)).toBe(0)
})

test('a weapon brings its own LAYER, and only two of them have an aim view', () => {
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
