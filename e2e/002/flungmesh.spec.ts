// PHASE 002 (app) — A THROWN PIG IS DRAWN WHERE IT FLIES.
//
// The engine's half of a fling was pinned three ways (unit/fling.spec.ts,
// e2e/002/knockback.spec.ts, e2e/002/tumble.spec.ts) and every one of them
// read the ENGINE — and the bug play spent a session on was in the PAINT:
// three/battle.ts placed only corpses from the snapshot, so a living
// non-acting pig's mesh stood at its spawn while the tumbles carried its
// body 1700 units away. "Он на месте катился" — the bounce clip playing on
// a mesh nobody moved. A debug read is not a paint check (CLAUDE.md), and
// this is the paint check: the DRAWN NODE's position, polled in the live
// scene while the flight runs.

import { expect, test } from '../app'
import { startGame } from '../menu'
import { swapMap } from '../controller'

type Page = import('@playwright/test').Page

interface FlingDebug {
  flingOther(): { pig: number; x: number; z: number } | null
  nodeAt(id: number): { x: number; y: number; z: number } | null
}

const withDebug = (page: Page): { throwOther(): Promise<{ pig: number; x: number; z: number } | null>; drawnTravel(from: { pig: number; x: number; z: number }): Promise<number> } => ({
  throwOther: () =>
    page.evaluate(() => {
      const pow = (window as unknown as { pow?: { debug?: FlingDebug } }).pow
      if (!pow?.debug) throw new Error('no battle scene is up')
      return pow.debug.flingOther()
    }),
  drawnTravel: (from) =>
    page.evaluate((at) => {
      const pow = (window as unknown as { pow?: { debug?: FlingDebug } }).pow
      if (!pow?.debug) throw new Error('no battle scene is up')
      const node = pow.debug.nodeAt(at.pig)
      return node ? Math.hypot(node.x - at.x, node.z - at.z) : -1
    }, from)
})

test('a flung pig MOVES on screen — the mesh follows the flying body', async ({ app }) => {
  test.setTimeout(60_000)
  const { page } = app
  await startGame(page)
  // The training ground fields ONE pig and a fling needs somebody else:
  // LIBERATE fields two full sides.
  expect(await swapMap(page, 'LIBERATE')).toBe(true)

  const pow = withDebug(page)
  const thrown = await pow.throwOther()
  expect(thrown, 'somebody other than the acting pig to throw').not.toBeNull()

  // The DRAWN node, not the engine: past 400 units of screen travel the mesh
  // is provably following the body — a grenade-strength 45° knock flies well
  // over a thousand on open ground (unit/fling.spec.ts). Before the
  // snapshot-placement fix this polled a node that never moved at all.
  await expect
    .poll(() => pow.drawnTravel(thrown!), {
      message: 'the drawn mesh never left the spot the pig was thrown from'
    })
    .toBeGreaterThan(400)

  expect(app.errors()).toEqual([])
})
