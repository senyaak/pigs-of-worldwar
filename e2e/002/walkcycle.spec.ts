// PHASE 002 (app) — a walking pig's BODY moves, and both halves of the chain
// are measured.
//
// Play, twice: "свиньи ещё не двигаются при ходьбе", and then "реально не
// двигается у нас — баг". The clip data is not the problem — measured over the
// shipped `mcap.mad`, clip 0 swings the legs ±75° and the torso ±19.6°
// (`animations/notes.md`) — so the fault is somewhere between the clip and the
// screen, and there are exactly two places for it: the engine's own sampler
// (`lib/game/bonePose.ts`, which the blade and the muzzle are measured with) and
// the bones the mesh actually wears (`three/wear.ts`).
//
// `pow.debug.pose()` reports both, which is what makes this a measurement rather
// than a guess: `foot` is the ankle relative to the hip out of the sampler, so
// the pig's own travel is out of it, and `bones` is every bone's quaternion on
// the skinned mesh.
//
// **What it answers, and it is not a fault of ours.** Play again: "там именно та
// часть тела не шевелится вообще." Over a second of held W, the per-bone travel
// on the mesh comes out
//
//     0:0.041  1:0.300  2:0.439  3:0.469  4:0.365  5:0.006  6:0.663  7:0.409
//     8:0.075  9:0.508 10:0.768 11:0.285 12:0.574 13:0.516 14:0.390
//
// so every one of the fifteen is being driven — and bone 0, the hip with the TAIL
// on it, is the smallest by a factor of seven because the shipped clip gives it
// 4.9° of PITCH and no yaw at all, on any of the three run cycles
// (`animations/notes.md`). The part moves; the data barely moves it.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { Page } from '@playwright/test'

import { parsePmg } from '../../src/lib/formats/pmg'
import { ANIM } from '../../src/lib/game/locomotion'
import { SWAMP_TILE, TerrainQuery, WORLD_LIMIT } from '../../src/lib/game/terrain'
import { expect, test } from '../app'
import { beginTurn, swapMap, warp } from '../controller'
import { GAME_DIR } from '../launch'
import { openBattle } from '../load'

type Pose = {
  clip: number | null
  elapsed: number
  lift: number
  bones: [number, number, number, number][]
  foot: [number, number, number] | null
  drawn: [number, number, number, number] | null
}

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values)

/** Every point a pig can walk from on a 64 grid, the walks below being picked off the
 * shipped ground rather than off numbers that would rot with it. */
const points = function* (): Generator<{ x: number; z: number }> {
  const reach = WORLD_LIMIT - 1024
  for (let x = -reach; x < reach; x += 64) {
    for (let z = -reach; z < reach; z += 64) yield { x, z }
  }
}

/** A point on tile 43,17 with the ground rising ahead of it, uphill. */
const campWallPoint = (query: TerrainQuery): { x: number; z: number } => {
  for (const at of points()) {
    const tile = query.tileAddress(at.x, at.z)
    if (tile?.col !== 43 || tile.row !== 17 || query.walkable(at.x, at.z)) continue
    if (query.downhill(at.x, at.z) !== null) return at
  }
  throw new Error('CAMP has no blocked point on tile 43,17')
}

/** Dry type-11 ground with more of it ahead, the middle of a bank's walk. */
const artgunBankPoint = (query: TerrainQuery): { at: { x: number; z: number }; heading: number } => {
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
  for (const at of points()) {
    for (const heading of headings) {
      const clear = [0, 256, 512].every((far) => {
        const x = at.x + Math.sin(heading) * far
        const z = at.z + Math.cos(heading) * far
        return (
          query.tileType(x, z) === SWAMP_TILE &&
          query.walkable(x, z) &&
          Math.abs(query.height(x, z) - query.height(at.x, at.z)) < 128
        )
      })
      if (clear) return { at, heading }
    }
  }
  throw new Error('ARTGUN has no walkable stretch of type 11')
}

test('walking moves the bones, in the sampler and on the mesh alike', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  await beginTurn(page)

  // Sampled IN THE PAGE, every animation frame for a second of held W: a walk
  // cycle is 17 frames at 25 fps, so a second is a pass and a half of it.
  const samples: Pose[] = await page.evaluate(async () => {
    const pow = (
      window as unknown as {
        pow: {
          controller: { press(a: string): void; release(a: string): void }
          debug: { pose(): Pose }
        }
      }
    ).pow
    const out: Pose[] = []
    pow.controller.press('walkForward')
    for (let i = 0; i < 60; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      out.push(pow.debug.pose())
    }
    pow.controller.release('walkForward')
    return out
  })

  const clips = [...new Set(samples.map((one) => one.clip))]
  const elapsed = spread(samples.map((one) => one.elapsed))
  const ankle = samples
    .map((one) => one.foot)
    .filter((one): one is [number, number, number] => one !== null)
  const worn = samples
    .map((one) => one.drawn)
    .filter((one): one is [number, number, number, number] => one !== null)
  const swing = Math.max(...[0, 1, 2].map((axis) => spread(ankle.map((one) => one[axis]))))
  const drawn = Math.max(...[0, 1, 2, 3].map((axis) => spread(worn.map((one) => one[axis]))))
  /** How much bone `index` moved on the mesh over the whole sample. */
  const moved = (index: number): number =>
    Math.max(
      ...[0, 1, 2, 3].map((axis) => spread(samples.map((one) => one.bones[index]?.[axis] ?? 0)))
    )
  const body = moved(1)
  console.log('clips', clips, 'cursor spread', elapsed.toFixed(3))
  console.log('ankle spread', swing.toFixed(1), 'leg drawn', drawn.toFixed(4))
  // EVERY bone, because "that part of the body does not move at all" is a
  // question about which of them are dead.
  console.log(
    'per bone',
    samples[0].bones.map((_, index) => `${index}:${moved(index).toFixed(3)}`).join(' ')
  )

  // The RUN cycle is what a pig walking forward wears (lib/game/locomotion.ts).
  expect(clips, 'the walk asks for the run cycle').toContain(0)
  // The cursor moves. Not a whole second of it — the sample starts while the
  // landing's get-up is still on, and a new clip starts its own count from zero.
  expect(elapsed, 'and its cursor advances').toBeGreaterThan(0.1)
  // The ankle swings through most of a body's width over a stride, so anything
  // near zero is a frozen pose — and the drawn quaternion is the same question
  // asked of the mesh.
  expect(swing, 'the sampler swings the leg').toBeGreaterThan(20)
  expect(drawn, 'and the mesh wears the swing').toBeGreaterThan(0.05)
  // …and the whole BODY rises and falls with the gait: the keyframe head's own
  // offset, which is the one motion the rump has (lib/game/clipPose.ts). 21
  // model units over a stride, halved by `MODEL_SCALE` on the way to the world.
  expect(spread(samples.map((one) => one.lift)), 'the body bobs').toBeGreaterThan(4)
  // The TORSO too, which is the half play was asking about — with EMPTY HANDS.
  // Take something in them and the weapon channel owns bones 0..8 and holds them
  // still, which is the exe's own split and not a fault (lib/game/clipPose.ts).
  expect(body, 'and the body itself, empty-handed').toBeGreaterThan(0.05)

  expect(app.errors()).toEqual([])
})

/** A second of held W from here, every animation frame: what the sampler says
 * the pig wears and what the mesh does about it. */
const walkFrom = async (
  page: Page,
  at: { x: number; z: number },
  heading: number
): Promise<{ clips: (number | null)[]; drawn: number }> => {
  await warp(page, at.x, at.z, heading)
  const samples: Pose[] = await page.evaluate(async () => {
    const pow = (
      window as unknown as {
        pow: {
          controller: { press(a: string): void; release(a: string): void }
          debug: { pose(): Pose }
        }
      }
    ).pow
    const out: Pose[] = []
    pow.controller.press('walkForward')
    // Under the 25 frames at 30 Hz the wedge counter throws a pig out by.
    for (let i = 0; i < 30; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      out.push(pow.debug.pose())
    }
    pow.controller.release('walkForward')
    return out
  })
  const worn = samples
    .map((one) => one.drawn)
    .filter((one): one is [number, number, number, number] => one !== null)
  return {
    clips: [...new Set(samples.map((one) => one.clip))],
    drawn: Math.max(...[0, 1, 2, 3].map((axis) => spread(worn.map((one) => one[axis]))))
  }
}

test('walking up a wall scrambles on CAMP; walking a swamp bank on ARTGUN runs', async ({ app }) => {
  const { page } = app
  await openBattle(page)
  await beginTurn(page)

  // CAMP, the map the old reading said could not show it: tile 43,17 is the wall
  // flag over terrain type 5 (e2e/002/wedge.spec.ts). Uphill is against the
  // gradient the eject takes (exe: walls.md, 0x46ac83 wants the ground ahead higher).
  const camp = new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))
  const wall = campWallPoint(camp)
  const uphill = (camp.downhill(wall.x, wall.z) ?? 0) + Math.PI
  const up = await walkFrom(page, wall, uphill)
  console.log('in a wall', up.clips, 'leg drawn', up.drawn.toFixed(4))
  // exe: movement/clips.md, 0x46c49a — the wall bit makes the run-cycle picker's
  // clip 11.
  expect(up.clips, 'the walk in a wall').toContain(ANIM.SCRAMBLE)
  expect(up.drawn, 'and the mesh wears it').toBeGreaterThan(0.01)

  // ARTGUN's type-11 ground, the old "climbing" tiles, with no wall flag: it is
  // not the ground that scrambles (exe: movement/clips.md, "Not terrain type 11").
  expect(await swapMap(page, 'ARTGUN')).toBe(true)
  await beginTurn(page)
  const artgun = new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'ARTGUN.PMG'))))
  const bank = artgunBankPoint(artgun)
  const onBank = await walkFrom(page, bank.at, bank.heading)
  console.log('on a swamp bank', onBank.clips)
  expect(onBank.clips, 'the run cycle').toContain(ANIM.RUN)
  expect(onBank.clips, 'and no scramble').not.toContain(ANIM.SCRAMBLE)

  expect(await swapMap(page, 'CAMP')).toBe(true)
  expect(app.errors()).toEqual([])
})
