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
// the pig's own travel is out of it, and `drawn` is that bone's quaternion on the
// skinned mesh.

import { expect, test } from '../app'
import { beginTurn } from '../controller'
import { startGame } from '../menu'

type Pose = {
  clip: number | null
  elapsed: number
  torso: [number, number, number, number] | null
  foot: [number, number, number] | null
  drawn: [number, number, number, number] | null
}

const spread = (values: number[]): number => Math.max(...values) - Math.min(...values)

test('walking moves the bones, in the sampler and on the mesh alike', async ({ app }) => {
  const { page } = app
  await startGame(page)
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
  const spine = samples
    .map((one) => one.torso)
    .filter((one): one is [number, number, number, number] => one !== null)
  const swing = Math.max(...[0, 1, 2].map((axis) => spread(ankle.map((one) => one[axis]))))
  const drawn = Math.max(...[0, 1, 2, 3].map((axis) => spread(worn.map((one) => one[axis]))))
  const body = Math.max(...[0, 1, 2, 3].map((axis) => spread(spine.map((one) => one[axis]))))
  console.log('clips', clips, 'cursor spread', elapsed.toFixed(3))
  console.log('ankle spread', swing.toFixed(1), 'leg drawn', drawn.toFixed(4), 'torso drawn', body.toFixed(4))

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
  // The TORSO too, which is the half play was asking about — with EMPTY HANDS.
  // Take something in them and the weapon channel owns bones 0..8 and holds them
  // still, which is the exe's own split and not a fault (lib/game/clipPose.ts).
  expect(body, 'and the body itself, empty-handed').toBeGreaterThan(0.05)

  expect(app.errors()).toEqual([])
})
