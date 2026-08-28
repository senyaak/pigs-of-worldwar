// PHASE 002 (domain) — the POISON GAS canister streams. Pure, no Electron.
//
// The shape is the exe's (`weapons/gas.md` in the disasm repo): the valve
// opens at frame 15 of the flight and lets a little cloud go every 5th frame;
// each cloud sweeps once — no line of sight, no push — and the first touch
// per throw is fifteen points FLAT, the Sneeze and the poison bit; every
// later cloud only refreshes the bit. The pop is one last cloud and no blast.

import { test, expect } from '@playwright/test'

import { GAS_OPEN_FRAMES, GAS_PUFF_FRAMES, SNEEZE_CLIP, createGas } from '../src/lib/game/gas'
import { createPoison } from '../src/lib/game/poison'
import { blastRange, lobOf } from '../src/lib/game/grenade'
import type { Lobbed } from '../src/lib/game/grenade'
import { createLobs } from '../src/lib/game/lobs'
import { fromExeFrames } from '../src/lib/game/ballistics'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'
import { terrain } from './fixture'

const GAS = 26

const pigAt = (x: number, z: number, id = 1): Pig =>
  ({
    id,
    name: 'SCOUT',
    index: 0,
    health: 75,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 8,
    gone: false,
    parachutes: false
  }) as unknown as Pig

const canister = (age = 0): Lobbed => ({
  id: 7,
  skill: GAS,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  fuse: 5,
  age,
  resting: false,
  doused: false,
  sinking: 0,
  owner: 9
})

const field = (): {
  gas: ReturnType<typeof createGas>
  poison: ReturnType<typeof createPoison>
  pigs: Pig[]
  heard: BattleEvent[]
} => {
  const pigs: Pig[] = []
  const heard: BattleEvent[] = []
  const poison = createPoison({ training: false }, (event) => heard.push(event))
  const gas = createGas({ pigs: () => pigs, training: false, poison }, (event) =>
    heard.push(event)
  )
  return { gas, poison, pigs, heard }
}

const count = (heard: BattleEvent[], kind: BattleEvent['kind']): number =>
  heard.filter((one) => one.kind === kind).length

test('the valve opens at frame 15 and a cloud goes every 5th', { tag: '@nodata' }, () => {
  const { gas, heard } = field()
  const shot = canister(fromExeFrames(GAS_OPEN_FRAMES - 1))
  gas.stream(shot)
  expect(heard).toHaveLength(0)
  // Frame 15: the hiss starts and the first cloud goes.
  shot.age = fromExeFrames(GAS_OPEN_FRAMES)
  gas.stream(shot)
  expect(count(heard, 'gasStreaming')).toBe(1)
  expect(count(heard, 'gasPuffed')).toBe(1)
  // Three strides later: three more clouds, and the hiss is not restarted.
  shot.age = fromExeFrames(GAS_OPEN_FRAMES + 3 * GAS_PUFF_FRAMES)
  gas.stream(shot)
  expect(count(heard, 'gasStreaming')).toBe(1)
  expect(count(heard, 'gasPuffed')).toBe(4)
})

test('the touch is fifteen FLAT, once per throw — later clouds only refresh the bit', { tag: '@nodata' }, () => {
  const { gas, poison, pigs, heard } = field()
  const row = lobOf(GAS)!
  const caught = pigAt(300, 0)
  pigs.push(caught)
  const shot = canister(fromExeFrames(GAS_OPEN_FRAMES))
  gas.stream(shot)
  // Fifteen points, flat — the row's own 1920 over the health unit — and the
  // Sneeze over the hit.
  expect(caught.health).toBe(75 - row.damage / 128)
  const bitten = heard.filter((one) => one.kind === 'damaged')
  expect(bitten).toHaveLength(1)
  expect(bitten[0]).toMatchObject({ amount: row.damage / 128, pig: caught.id })
  expect(count(heard, 'gassed')).toBe(1)
  expect(heard.some((one) => one.kind === 'clip' && one.index === SNEEZE_CLIP)).toBe(true)
  expect(count(heard, 'poisoned')).toBe(1)
  expect(poison.poisoned(caught)).toBe(true)
  // Ten more clouds of the same throw: not a point more, not a second sneeze.
  shot.age = fromExeFrames(GAS_OPEN_FRAMES + 10 * GAS_PUFF_FRAMES)
  gas.stream(shot)
  expect(caught.health).toBe(75 - row.damage / 128)
  expect(count(heard, 'gassed')).toBe(1)
  expect(count(heard, 'poisoned')).toBe(1)
})

test('the cloud reaches exactly as far as the falloff gate — and not a corpse', { tag: '@nodata' }, () => {
  const { gas, pigs, heard } = field()
  const row = lobOf(GAS)!
  // The gate is `blastShare > 0`: a core of 512 and the row's own reach past
  // it (lib/game/grenade.ts) — the rim is the range, measured, not guessed.
  const rim = 512 + blastRange(row)
  const inside = pigAt(rim - 1, 0, 1)
  const outside = pigAt(rim + 2, 0, 2)
  const dead = pigAt(100, 0, 3)
  dead.health = 0
  pigs.push(inside, outside, dead)
  gas.stream(canister(fromExeFrames(GAS_OPEN_FRAMES)))
  expect(inside.health).toBeLessThan(75)
  expect(outside.health).toBe(75)
  expect(heard.filter((one) => one.kind === 'damaged')).toHaveLength(1)
})

test('the pop is one last cloud and NO blast', { tag: '@nodata' }, () => {
  const pigs: Pig[] = []
  const heard: BattleEvent[] = []
  const poison = createPoison({ training: false }, (event) => heard.push(event))
  const gas = createGas({ pigs: () => pigs, training: false, poison }, (event) =>
    heard.push(event)
  )
  const thrower = pigAt(0, 0, 9)
  thrower.holding = GAS
  pigs.push(thrower)
  const lobs = createLobs(
    {
      pigs: () => pigs,
      targets: [],
      present: () => true,
      training: false,
      query: terrain(() => 0),
      obstacles: { solid: () => false } as never,
      mines: { tread: () => false } as never,
      gas,
      pose: { boneToWorld: () => ({ x: 0, y: -100, z: 0 }) } as never,
      random: () => 0
    },
    (event) => heard.push(event)
  )
  expect(lobs.throwOne(thrower, 0, 0)).toBe(true)
  lobs.update(0.1)
  // The hand detonator: the canister ends the way the fuse would end it.
  lobs.detonateNow()
  expect(count(heard, 'gasPopped')).toBe(1)
  expect(count(heard, 'gasPuffed')).toBe(1)
  expect(count(heard, 'blasted')).toBe(0)
  expect(lobs.live()).toBe(0)
})
