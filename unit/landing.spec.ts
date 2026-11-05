// PHASE 002 (domain) — the rungs of the exe's impact handler, each with a case
// either side of it. Pure, no Electron.
//
// The handler is 0x470d10 (`movement/landing.md`). It asks one number, the full
// arrival speed in whole exe units a frame, so "over 75" starts at 76.

import { test, expect } from '@playwright/test'

import { BOUNCE_CUTOFF, EJECT_CUTOFF, EXE_FRAME_SECONDS, FRAME_SECONDS, fromExeSpeed } from '../src/lib/game/ballistics'
import { LANDING_DUST_EFFECT } from '../src/lib/game/effects'
import { createEffectField } from '../src/lib/game/effectField'
import type { BattleEvent } from '../src/lib/game/events'
import { chargeLanding, FALL_GATE } from '../src/lib/game/falling'
import type { Pig } from '../src/lib/game/game'
import {
  DUST_SPEED,
  EXERTION_MAX,
  LANDING_EXERTION,
  THUD_QUIET_SECONDS,
  THUD_SPEED,
  WINDED_SPEED,
  thudVolume
} from '../src/lib/game/landing'
import { createLocomotion, updateLocomotion } from '../src/lib/game/locomotion'
import { SILENT } from '../src/renderer/src/audio/bank'
import type { Bank } from '../src/renderer/src/audio/bank'
import { createBattleSounds } from '../src/renderer/src/audio/battle'
import { createBattleAudio } from '../src/renderer/src/audio/battleAudio'
import { terrain } from './fixture'

const FREE_GROUND = terrain(() => 0)
const WALL_GROUND = terrain(
  () => 0,
  () => ({ type: 0x80, slip: 0 })
)

/** A step short enough that gravity moves the arrival by under a quarter of an
 * exe unit, so a case can sit right beside its threshold. */
const FINE_STEP = 1 / 600
const STILL = { walk: 0, turn: 0, jump: false }

/** One frame's contact at `across` and `down` exe units a frame: thrown, so the
 * handler is the routine answering it. */
function contact(ground: typeof FREE_GROUND, across: number, down: number) {
  const state = createLocomotion(ground, 0, 0, 0)
  state.y -= 0.05
  state.airborne = {
    vx: fromExeSpeed(across),
    vy: fromExeSpeed(down),
    vz: 0,
    bouncing: true,
    pushIn: null,
    hurled: true
  }
  updateLocomotion(state, ground, STILL, FINE_STEP)
  expect(state.impact, 'the fixture made a ground contact').not.toBeNull()
  return state
}

const pigAt = (exertion = 0): Pig =>
  ({
    id: 1,
    health: 75,
    exertion,
    position: { x: 10, y: 20, z: 30 },
    body: { height: 0 }
  }) as unknown as Pig

/** What one contact at `exeSpeed` does, with the landing's gate open. */
function ladder(exeSpeed: number, pig: Pig = pigAt(), flying = true): BattleEvent[] {
  const heard: BattleEvent[] = []
  const state = createLocomotion(FREE_GROUND, 0, 0, 0)
  state.impact = { speed: fromExeSpeed(exeSpeed), flying, surface: 7 }
  chargeLanding(pig, state, false, (event) => void heard.push(event))
  return heard.filter((one) => one.kind === 'thudded')
}

// ——— 0x32: the eject ———

test('blocked ground under 50 throws the pig out on the landing frame, at 50 it bounces', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471045 — the eject is the unsigned "below 50".
  expect(EJECT_CUTOFF).toBeCloseTo(fromExeSpeed(0x32), 6)
  expect(contact(WALL_GROUND, 0, 49.5).airborne?.ejected).toBe(true)
  const over = contact(WALL_GROUND, 0, 50)
  expect(over.airborne, 'a bounce stays in the air').not.toBeNull()
  expect(over.airborne?.ejected ?? false).toBe(false)
})

test('free ground never ejects, at any speed', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x47103c — the eject asks `Map::IsBlocked` first.
  expect(contact(FREE_GROUND, 0, 30).airborne?.ejected ?? false).toBe(false)
})

test('blocked ground tests the FULL arrival, not its part along the normal', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x4711c7 and 0x407a44 — `di` is the length of the
  // relative velocity. Across 60 and down 5 is a glancing touch: 5 along the
  // normal, over 60 in all, so it slides on.
  const glancing = contact(WALL_GROUND, 60, 5)
  expect(glancing.airborne?.ejected ?? false).toBe(false)
  // …and a head-on 40, well past the fork's 25, is still under the eject's 50.
  expect(contact(WALL_GROUND, 0, 40).airborne?.ejected).toBe(true)
})

test('a slide on a wall runs down under the bar and is thrown out', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471045 — nothing rests on a blocked tile, and
  // the remake keeps no second test beside it: drag ends the slide.
  const state = createLocomotion(WALL_GROUND, 0, 0, 0)
  state.y -= 1
  state.airborne = { vx: fromExeSpeed(90), vy: 100, vz: 0, bouncing: true, pushIn: null, hurled: true }
  let ejected = false
  for (let i = 0; i < 600 && !ejected; i++) {
    updateLocomotion(state, WALL_GROUND, STILL, 1 / 60)
    ejected = state.airborne?.ejected === true
  }
  expect(ejected, 'the slide never ended').toBe(true)
})

// ——— 0x19: the fork ———

test('free ground under 25 settles, at 25 it bounces', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x4711d8 — the fork includes the 25 itself.
  expect(BOUNCE_CUTOFF).toBeCloseTo(fromExeSpeed(0x19), 6)
  expect(contact(FREE_GROUND, 0, 24.5).airborne).toBeNull()
  expect(contact(FREE_GROUND, 0, 25).airborne).not.toBeNull()
})

// ——— 0x19 again: the sound ———

test('past 25 a landing is heard, and at a whole 25 it is not', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471158 — "over", on the truncated integer, so 25.9
  // is still 25 (0x4ae390 chops).
  expect(THUD_SPEED).toBeCloseTo(fromExeSpeed(26), 6)
  expect(ladder(25.9)).toHaveLength(0)
  expect(ladder(26)).toHaveLength(1)
})

test('the thud is a tenth of the arrival, up to 60', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471166..0x471181 — the arrival over ten, capped
  // at 0x3c.
  expect(thudVolume(fromExeSpeed(26.5))).toBe(2)
  expect(thudVolume(fromExeSpeed(599.5))).toBe(59)
  expect(thudVolume(fromExeSpeed(600.5))).toBe(60)
  expect(thudVolume(fromExeSpeed(5000))).toBe(60)
  const [one] = ladder(120.5)
  expect(one).toMatchObject({ volume: 12, surface: 7, at: { x: 10, y: 20, z: 30 } })
})

// ——— 0x4b: the dust ———

test('past 75 a landing raises dust, and at a whole 75 it does not', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471052.
  expect(DUST_SPEED).toBeCloseTo(fromExeSpeed(76), 6)
  expect(ladder(75.9)[0]).toMatchObject({ dust: false })
  expect(ladder(76)[0]).toMatchObject({ dust: true })
})

test('the dust is row 5: one small grey ring, gone in five frames', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x4710fa..0x471143 for the id; effects/parameters.md
  // for its row (Init's arm 0x489106), whose one live stage is F.
  expect(LANDING_DUST_EFFECT).toMatchObject({ id: 0x1e, kind: 5 })
  expect(LANDING_DUST_EFFECT.rings).toEqual([
    // Row 5 at 0x4d64b3, stage F: 20 and 10 raw for radius and growth, scaled 2
    // and 5; width 10 raw, scaled 2; spread 10; age step 20; grey 7,7,7.
    { at: 1, radius: 40, growth: 50, drift: 1, width: 20, spread: 10, step: 20, colour: [7, 7, 7], lift: 0 }
  ])
  expect(LANDING_DUST_EFFECT.bursts ?? []).toEqual([])
  expect(LANDING_DUST_EFFECT.clouds ?? []).toEqual([])

  const field = createEffectField(() => 0)
  field.landingDust({ x: 0, y: 0, z: 0 })
  field.update(EXE_FRAME_SECONDS)
  expect(field.rings(), 'the landing threw no ring').toBe(1)
  for (let frame = 0; frame < 6; frame++) field.update(EXE_FRAME_SECONDS)
  expect(field.rings(), 'the ring outlived its five frames').toBe(0)
})

// ——— [pig+0x1b2]: the gate on both ———

test('one contact shuts the sound and the dust for three frames, and only those', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471061 and 0x47115e read the byte, 0x4711cb
  // zeroes it, 0x46cbd7 counts it once a pig update — and "over 2" is three of
  // those. Frames on the clock the same update's other counters run on.
  expect(THUD_QUIET_SECONDS).toBeCloseTo(3 * FRAME_SECONDS, 6)
  const heard: BattleEvent[] = []
  const emit = (event: BattleEvent): void => void heard.push(event)
  const pig = pigAt()
  const state = createLocomotion(FREE_GROUND, 0, 0, 0)
  const hit = (): void => {
    state.impact = { speed: fromExeSpeed(100), flying: true, surface: 1 }
    chargeLanding(pig, state, false, emit)
  }
  hit()
  expect(heard).toHaveLength(1)
  // A chain of contacts: quiet, right up to the third frame's end.
  updateLocomotion(state, FREE_GROUND, STILL, THUD_QUIET_SECONDS * 0.9)
  hit()
  expect(heard, 'the gate let one through early').toHaveLength(1)
  // …but the fatigue has no gate: it follows the fork, not the byte
  // (movement/landing.md, 0x471325).
  expect(pig.exertion).toBe(2 * LANDING_EXERTION)
  updateLocomotion(state, FREE_GROUND, STILL, THUD_QUIET_SECONDS * 0.2)
  hit()
  expect(heard, 'the gate never opened').toHaveLength(2)
})

test('a contact too soft to be heard leaves the gate alone', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x47115c — the jump past the zeroing of 0x4711cb.
  const heard: BattleEvent[] = []
  const emit = (event: BattleEvent): void => void heard.push(event)
  const state = createLocomotion(FREE_GROUND, 0, 0, 0)
  state.impact = { speed: fromExeSpeed(20), flying: true, surface: 1 }
  chargeLanding(pigAt(), state, false, emit)
  expect(state.thudQuiet).toBe(0)
  state.impact = { speed: fromExeSpeed(100), flying: true, surface: 1 }
  chargeLanding(pigAt(), state, false, emit)
  expect(heard.filter((one) => one.kind === 'thudded')).toHaveLength(1)
})

// ——— 0x46: the fatigue ———

test('past 70 a landing winds the pig by 60, and at a whole 70 it does not', { tag: '@nodata' }, () => {
  // exe: movement/landing.md, 0x471325 for the 70 and 0x47132b for the 60.
  expect(WINDED_SPEED).toBeCloseTo(fromExeSpeed(71), 6)
  expect(LANDING_EXERTION).toBe(0x3c)
  const under = pigAt()
  ladder(70.9, under)
  expect(under.exertion).toBe(0)
  const over = pigAt()
  ladder(71, over)
  expect(over.exertion).toBe(60)
})

test('the counter stops at 300', { tag: '@nodata' }, () => {
  // exe: movement/walk-speed.md, 0x46DCB2 — clamped 0..300.
  expect(EXERTION_MAX).toBe(300)
  const pig = pigAt(280)
  ladder(100, pig)
  expect(pig.exertion).toBe(300)
})

// ——— who climbs it ———

test('a plain contact climbs none of it, however hard', { tag: '@nodata' }, () => {
  // exe: movement/falling.md, 0x47716c..0x47718d — a plain fall or jump lands
  // through 0x470910, which is not this handler.
  const pig = pigAt()
  expect(ladder(500, pig, false)).toHaveLength(0)
  expect(pig.exertion).toBe(0)
  expect(pig.health).toBe(75)
})

test('a corpse is not hurt again, and still hits the ground', { tag: '@nodata' }, () => {
  // exe: movement/landing.md — the handler carries no TakeDamage and no test of
  // the pig's life. The damage arm is the part a dead pig skips.
  const pig = pigAt()
  pig.health = 0
  const heard = ladder(FALL_GATE * FRAME_SECONDS + 1, pig)
  expect(heard).toHaveLength(1)
  expect(pig.health).toBe(0)
})

// ——— what is heard ———

const listening = (): { bank: Bank; played: { name: string; gain: number; rate: number }[] } => {
  const played: { name: string; gain: number; rate: number }[] = []
  return {
    played,
    bank: {
      ...SILENT,
      play: (name, options) => void played.push({ name, gain: options?.gain ?? 1, rate: options?.rate ?? 1 })
    }
  }
}

test('a thud is I_PICKUP at the event\'s volume, over the ground\'s scuff at 40', { tag: '@nodata' }, () => {
  // exe: anim/audio-events.md, index 30 is I_PICKUP; movement/landing.md 0x4711aa
  // plays it at `100 + (rand & 63)` and 0x4711b8 is `Pig::Footstep(0, 40, 0, 0)`:
  // foot 0, the ground's file over the sand, each at 40 less `rand & 15`.
  const { bank, played } = listening()
  const audio = createBattleAudio(() => bank)
  audio.listen({ kind: 'thudded', at: { x: 0, y: 0, z: 0 }, volume: 37, surface: 7, dust: false })
  expect(played.map((one) => one.name)).toEqual(['I_PICKUP', 'FT_SAND', 'FT_SAND'])
  expect(played[0].gain).toBeCloseTo(0.37, 6)
  expect(played[0].rate).toBeGreaterThanOrEqual(1)
  expect(played[0].rate).toBeLessThanOrEqual(1.63)
  expect(played[1].gain).toBeGreaterThanOrEqual(0.25)
  expect(played[1].gain).toBeLessThanOrEqual(0.4)
  // Foot 0 plays flat (0x475275).
  expect(played[1].rate).toBe(1)
})

test('coming to rest is `Pig::Land`\'s sound for a plain flight, and silence for a flying one', { tag: '@nodata' }, () => {
  // exe: anim/audio-events.md, 0x470b0c plays I_PICKUP at 40 and 150 in
  // `Pig::Land`; movement/landing.md, the flying settle 0x471350 plays nothing.
  const rests = (hurled: boolean): string[] => {
    const { bank, played } = listening()
    const sounds = createBattleSounds(bank)
    const state = createLocomotion(FREE_GROUND, 0, 0, 0)
    sounds.follow(state, false)
    state.airborne = { vx: 0, vy: 0, vz: 0, bouncing: false, pushIn: null, hurled }
    sounds.follow(state, false)
    played.length = 0
    state.airborne = null
    sounds.follow(state, false)
    return played.map((one) => one.name)
  }
  expect(rests(false)).toEqual(['I_PICKUP'])
  expect(rests(true)).toEqual([])
})
