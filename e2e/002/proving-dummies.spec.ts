// PHASE 002 (app) — THE PROVING GROUND'S DUMMIES SKIP THEIR TURNS.
//
// `[play]`, 2026-11-02: "real enemy pigs that skip their turns"
// (docs/facts/proving-ground.md). The rule itself is pinned headless
// (000/proving-ground-headless.spec.ts); this is what the player sees: the
// dummy's card comes up, the turn comes back, and every dummy's DRAWN NODE is
// where it stood — the renderer's own word (docs/testing.md).

import { existsSync } from 'node:fs'

import { PHASE_ENV } from '../launch'
import { expect, test } from '../app'
import { beginTurn, chooseSkill, debugState, hold, hud, press, release, skipTurn, warp } from '../controller'
import type { HudState } from '../controller'
import { openBattle } from '../load'
import { DUMMIES_AT, PROVING_GROUND } from '../../src/lib/game/provingGround'
import { SKILL } from '../../src/lib/game/skills'
import { PLATE_DELAY } from '../../src/renderer/src/ui/hud/layout'

type Page = import('@playwright/test').Page

interface Node3 {
  x: number
  y: number
  z: number
}

interface DummiesDebug {
  nodeAt(id: number): Node3 | null
  hud(): HudState
  brain(): { remote: boolean; asked: number }
}

/** The player's pig is 0, the side carrying the scripted bit comes first
 * (lib/game/provingGround.ts); the four dummies follow. */
const DUMMY_IDS = [1, 2, 3, 4]

const nodesOf = (page: Page): Promise<Node3[]> =>
  page.evaluate((ids) => {
    const debug = (window as unknown as { pow: { debug: DummiesDebug } }).pow.debug
    return ids.map((id) => {
      const node = debug.nodeAt(id)
      if (node === null) throw new Error(`pig ${id} has no drawn node`)
      return node
    })
  }, DUMMY_IDS)

/** What one whole turn of the other side looked like, sampled in the page every
 * frame: a poll from the test would miss most of it. */
interface OtherTurn {
  /** Whether its card was up: the side changed and the turn had not begun. */
  card: boolean
  /** The furthest any dummy's drawn node got from where it stood. */
  drift: number
}

const watchOtherTurn = (page: Page, ours: string): Promise<OtherTurn> =>
  page.evaluate(
    ({ ids, side, limit }) => {
      const debug = (window as unknown as { pow: { debug: DummiesDebug } }).pow.debug
      const stood = ids.map((id) => debug.nodeAt(id))
      const away = (): number =>
        ids.reduce((far, id, index) => {
          const at = debug.nodeAt(id)
          const from = stood[index]
          if (at === null || from === null) throw new Error(`pig ${id} has no drawn node`)
          return Math.max(far, Math.hypot(at.x - from.x, at.y - from.y, at.z - from.z))
        }, 0)
      return new Promise<OtherTurn>((resolve, reject) => {
        const deadline = performance.now() + limit
        const seen: OtherTurn = { card: false, drift: 0 }
        const sample = (): void => {
          const now = debug.hud()
          if (now.side === side) {
            resolve(seen)
            return
          }
          if (now.starting) seen.card = true
          try {
            seen.drift = Math.max(seen.drift, away())
          } catch (error) {
            reject(error)
            return
          }
          if (performance.now() >= deadline) reject(new Error('the turn never came back'))
          else requestAnimationFrame(sample)
        }
        sample()
      })
    },
    { ids: DUMMY_IDS, side: ours, limit: 20_000 }
  )

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('phase 002 starts from the .env phase 000 saves — run the whole suite, not this spec alone')
  }
})

test("the dummy's card comes up and the turn comes back: every dummy where it stood, the keys muted, the brain not asked", async ({
  app
}) => {
  test.setTimeout(60_000)
  const { page } = app
  await openBattle(page, PROVING_GROUND)

  const ours = await hud(page)
  // These ids are the dummies: their nodes stand at the map's own marks.
  const before = await nodesOf(page)
  expect(before.map((node) => node.x).sort((a, b) => a - b)).toEqual(DUMMIES_AT.map((at) => at.x))

  // The player's pass, the way the keys make it, with the beat cut.
  await skipTurn(page)
  const handed = await hud(page)
  expect(handed.side, "it is the dummies' turn").not.toBe(ours.side)
  expect(handed.starting, 'on the card').toBe(true)

  // The walk key held through the whole of it: muted (input/battleInput.ts), so
  // it moves nobody.
  const watching = watchOtherTurn(page, ours.side)
  await press(page, 'walkForward')
  const turn = await watching
  await release(page, 'walkForward')

  expect(turn.card, "the dummy's card was up").toBe(true)
  expect(turn.drift, 'no dummy left its spot').toBeLessThan(1)
  expect(await nodesOf(page)).toEqual(before)
  const brain = await page.evaluate(() => (window as unknown as { pow: { debug: DummiesDebug } }).pow.debug.brain())
  expect(brain, 'the brain process was never asked').toMatchObject({ remote: true, asked: 0 })

  // It is the player's again, and the keys are live again.
  expect((await hud(page)).side).toBe(ours.side)
  await beginTurn(page)
  const start = await debugState(page)
  await hold(page, 'walkForward', 400)
  const walked = await debugState(page)
  expect(Math.hypot(walked.x - start.x, walked.z - start.z)).toBeGreaterThan(100)

  expect(app.errors()).toEqual([])
})

// A DUMMY THAT WAS KILLED IS BACK ON THE SCREEN — `[play]`, 2026-11-02, "stand up
// at full health at the start of a turn" (docs/facts/proving-ground.md). The rule
// is pinned headless; what only this can see is the renderer, whose `squad.bury`
// used to be for good. A debug read is not a paint check (docs/testing.md), so the
// spot is read off the CANVAS: standing, then empty, then standing, from one view.

/** The first dummy down the strip, in plain view of the pig at its head. */
const DUMMY = DUMMY_IDS[0]
const DUMMY_SPOT = DUMMIES_AT[0]
/** Which way a pig faces down the strip, +x (lib/game/provingGround.ts). */
const DOWN_THE_STRIP = Math.PI / 2
/** A grunt has fifty, and five bayonet swings take them (lib/game/health.ts,
 * `exe`: the class table at 0x4d02e0, `damage/notes.md`). */
const GRUNT_HEALTH = 50
const BAYONET_POINTS = 10
/** How far a colour channel has to be off to count as a different picture. */
const CHANNEL = 40
/** The view is the one it was, within this much of a game unit. */
const SAME_VIEW = 3
/** A body at this range is hundreds of pixels; the shimmer of one view is not. */
const A_BODY = 100
/** A plate's letters and heart are thousands of pixels (e2e/002/hud.spec.ts). */
const A_PLATE = 100

/** A piece of the screen, as fractions of it, so that it reads on either canvas. */
interface Patch {
  x: number
  y: number
  w: number
  h: number
}

const dummyName = (page: Page): Promise<string> =>
  page.evaluate((id) => {
    return window.pow!.debug!.squads()[1].pigs[id - 1].name
  }, DUMMY)

/** The dummy's plate as the squad hands it to the dashboard, or null with none:
 * with no lift its place is the crown, as fractions of the screen. */
const plateOf = (page: Page, name: string): Promise<{ x: number; y: number; health: number } | null> =>
  page.evaluate((wanted) => {
    const plate = window.pow!.debug!.plates(1, 1).find((one) => one.name === wanted)
    return plate ? { x: plate.x, y: plate.y, health: plate.health } : null
  }, name)

/** The scene's own pixels in a patch, off its WebGL canvas
 * (preserveDrawingBuffer, three/scene.ts). */
const grabScene = (page: Page, patch: Patch): Promise<number[]> =>
  page.evaluate((at) => {
    const scene = document.querySelector('#battle-canvas canvas:not(#battle-hud)') as HTMLCanvasElement
    const probe = document.createElement('canvas')
    probe.width = scene.width
    probe.height = scene.height
    const context = probe.getContext('2d')
    if (!context) throw new Error('no 2d context to read the scene with')
    context.drawImage(scene, 0, 0)
    const { data } = context.getImageData(
      Math.round(at.x * scene.width),
      Math.round(at.y * scene.height),
      Math.round(at.w * scene.width),
      Math.round(at.h * scene.height)
    )
    return Array.from(data)
  }, patch)

/** How many pixels of two grabs of one patch are a different picture. */
const differing = (a: number[], b: number[]): number => {
  let count = 0
  for (let i = 0; i < a.length; i += 4) {
    const off = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
    if (off > CHANNEL) count++
  }
  return count
}

/** How much of a patch of the dashboard is painted. */
const dashboardPainted = (page: Page, patch: Patch): Promise<number> =>
  page.evaluate((at) => {
    const hud = document.getElementById('battle-hud') as HTMLCanvasElement
    const context = hud.getContext('2d')
    if (!context) throw new Error('the dashboard has no 2d context')
    const { data } = context.getImageData(
      Math.round(at.x * hud.width),
      Math.round(at.y * hud.height),
      Math.round(at.w * hud.width),
      Math.round(at.h * hud.height)
    )
    let opaque = 0
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) opaque++
    return opaque
  }, patch)

/** How far the camera is from where it stood. */
const offView = (page: Page, view: Node3): Promise<number> =>
  page.evaluate((at) => {
    const eye = window.pow!.debug!.camera()
    return Math.hypot(eye.x - at.x, eye.y - at.y, eye.z - at.z)
  }, view)

test('a killed dummy leaves the screen, is back on it at the next turn with its plate, and can be hit again', async ({
  app
}) => {
  test.setTimeout(120_000)
  const { page } = app
  await openBattle(page, PROVING_GROUND)
  const ours = await hud(page)
  const name = await dummyName(page)
  const eye = (): Promise<Node3> => page.evaluate(() => window.pow!.debug!.camera())
  const node = (): Promise<Node3 | null> => page.evaluate((id) => window.pow!.debug!.nodeAt(id), DUMMY)

  // The view at the head of the strip, the camera settled on it.
  let view = await eye()
  await expect
    .poll(async () => {
      const now = await eye()
      const moved = Math.hypot(now.x - view.x, now.y - view.y, now.z - view.z)
      view = now
      return moved
    }, { message: 'the camera settles behind the pig' })
    .toBeLessThan(0.5)
  const stoodAt = await node()
  expect(stoodAt, 'it is drawn').not.toBeNull()

  // Standing: where it is on the screen, its plate painted over it. The patch is
  // the body, under the crown: as wide as tall, in a screen's own proportion.
  await expect.poll(async () => (await hud(page)).still, { message: 'the pig has stood still' }).toBeGreaterThan(PLATE_DELAY)
  const crown = await plateOf(page, name)
  expect(crown, 'it carries a plate').not.toBeNull()
  expect(crown!.health).toBe(GRUNT_HEALTH)
  const body: Patch = { x: crown!.x - 0.04, y: crown!.y, w: 0.08, h: 0.12 }
  const plateBand: Patch = { x: crown!.x - 0.08, y: crown!.y - 0.1, w: 0.16, h: 0.1 }
  await expect.poll(() => dashboardPainted(page, plateBand), { message: 'its plate is painted' }).toBeGreaterThan(A_PLATE)
  const standing = await grabScene(page, body)

  // Down: nobody's blow, so the turn is not spent and the camera comes home to
  // the same view, with the spot empty.
  await page.evaluate((id) => window.pow!.debug!.fell(id), DUMMY)
  await expect.poll(() => page.evaluate(() => window.pow!.debug!.remains()), { timeout: 15_000, message: 'its death plays out' }).toBe(1)
  expect(await node(), 'off the drawn pigs').toBeNull()
  expect(await plateOf(page, name), 'its plate gone with it').toBeNull()
  await expect
    .poll(() => page.evaluate(() => window.pow!.debug!.aftermath()), { timeout: 15_000, message: 'the beat after it ends' })
    .toBe(false)
  await expect.poll(() => offView(page, view), { timeout: 15_000, message: 'the view is back' }).toBeLessThan(SAME_VIEW)
  await expect.poll(() => dashboardPainted(page, plateBand), { message: 'no plate over the spot' }).toBeLessThan(A_PLATE)
  const empty = await grabScene(page, body)
  const gone = differing(standing, empty)
  expect(gone, 'the body is off the canvas').toBeGreaterThan(A_BODY)

  // The turn is handed over: it is up for the dummy's turn already.
  await skipTurn(page)
  const handed = await hud(page)
  expect(handed.side, "it is the dummies' turn").not.toBe(ours.side)
  expect(await node(), 'back among the drawn pigs, on its own spot').toEqual(stoodAt)
  await watchOtherTurn(page, ours.side)
  expect((await plateOf(page, name))?.health, 'at the full health of its class').toBe(GRUNT_HEALTH)

  // And our turn again, the same view: the canvas shows it standing, and the
  // dashboard its plate. Only its boots at its feet differ from the first look.
  await beginTurn(page)
  await expect.poll(() => offView(page, view), { timeout: 15_000, message: 'the view is back' }).toBeLessThan(SAME_VIEW)
  await expect
    .poll(async () => differing(standing, await grabScene(page, body)), {
      timeout: 15_000,
      message: 'the canvas shows it standing where it stood'
    })
    .toBeLessThan(gone / 3)
  await expect.poll(async () => (await hud(page)).still, { message: 'the pig has stood still' }).toBeGreaterThan(PLATE_DELAY)
  await expect.poll(() => dashboardPainted(page, plateBand), { message: 'its plate is painted again' }).toBeGreaterThan(A_PLATE)

  // It can be hit again: the bayonet, the way a player swings it.
  expect(await chooseSkill(page, SKILL.BAYONET)).toBe(true)
  await warp(page, DUMMY_SPOT.x - 220, DUMMY_SPOT.z, DOWN_THE_STRIP)
  await press(page, 'fire')
  await release(page, 'fire')
  await expect
    .poll(() => page.evaluate((who) => window.pow!.debug!.health().find((one) => one.name === who)?.health, name), {
      timeout: 15_000,
      message: 'the blade lands'
    })
    .toBe(GRUNT_HEALTH - BAYONET_POINTS)

  expect(app.errors()).toEqual([])
})
