// PHASE 000 (continued) — the terrain viewer: a map's ground out of
// ARCHI.PMG + ARCHI.PTG, on screen in Three.js.
//
// Same deal as the model viewer: this proves the PMG/PTG pipeline with the
// screen as the assertion, and that is foundation — the meaningful scene
// stays reserved for phase 001. Numbers from docs/formats.md ("Verified"):
// every map is 16×16 blocks = 256, 4×4 tiles each = 4096; ARCHI.PTG holds
// 238 textures.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR, PHASE_ENV, openAssets } from '../launch'
import { expect, test } from '../app'
import { BLOCKS_PER_SIDE, TILE_STEP, VERTS_PER_SIDE, parsePmg, tileUvs } from '../../src/lib/formats/pmg'

test.beforeAll(() => {
  if (!existsSync(PHASE_ENV)) {
    throw new Error('this spec starts from the .env the foundation spec saves — run the whole suite, not this spec alone')
  }
})

test('ARCHI renders: correct counts in the stats, terrain pixels on the canvas', async ({ app }) => {
  const { page } = app
  await openAssets(page)
  await page.locator('#filter').fill('Maps/ARCHI.PMG')
  await page.locator('#file-list .file-row').click()
  await expect(page.locator('#viewer')).toBeVisible()
  await expect(page.locator('#viewer-stats')).toHaveText(
    'Maps/ARCHI.PMG — 256 blocks, 4096 tiles, 238 textures'
  )

  // Same canvas readback as the model viewer: something must actually be
  // on screen, far from the flat background color.
  const foregroundPixels = async (): Promise<number> =>
    page.evaluate(() => {
      const canvas = document.querySelector('#viewer-canvas canvas') as HTMLCanvasElement | null
      if (!canvas) return -1
      const probe = document.createElement('canvas')
      probe.width = canvas.width
      probe.height = canvas.height
      const ctx = probe.getContext('2d')
      if (!ctx) return -1
      ctx.drawImage(canvas, 0, 0)
      const pixels = ctx.getImageData(0, 0, probe.width, probe.height).data
      let count = 0
      for (let i = 0; i < pixels.length; i += 4) {
        if (
          Math.abs(pixels[i] - 0x23) > 32 ||
          Math.abs(pixels[i + 1] - 0x27) > 32 ||
          Math.abs(pixels[i + 2] - 0x1d) > 32
        ) {
          count++
        }
      }
      return count
    })
  await expect.poll(foregroundPixels, { message: 'rendered terrain pixels' }).toBeGreaterThan(5000)

  // Terrain opens from the file list, so Back goes there — not to an archive.
  await page.locator('#viewer-back').click()
  await expect(page.locator('#viewer')).toBeHidden()
  await expect(page.locator('#file-list')).toBeVisible()


  expect(app.errors()).toEqual([])
})

// The ground's roundness is data, not lighting: every PMG vertex stores a
// brightness the original modulates its texture by. Two properties make the
// gradient continuous rather than tile-by-tile, and both are what a wrong
// stride in the parser would break first.
test('ARCHI carries baked vertex shade, and neighbouring blocks agree on it', () => {
  const blocks = parsePmg(new Uint8Array(readFileSync(path.join(GAME_DIR, 'Maps', 'ARCHI.PMG'))))
  const all = blocks.flatMap((block) => [...block.shades])
  expect(all).toHaveLength(BLOCKS_PER_SIDE * BLOCKS_PER_SIDE * VERTS_PER_SIDE * VERTS_PER_SIDE)

  // Shade, not a constant and not noise: bright almost everywhere, darker on
  // the slopes, and never the 0 an off-by-two read would land on.
  expect(Math.max(...all)).toBe(255)
  expect(Math.min(...all)).toBeGreaterThan(0)
  expect(new Set(all).size).toBeGreaterThan(50)
  expect(all.filter((shade) => shade === 255).length / all.length).toBeGreaterThan(0.25)

  // A block's outer ring of vertices is its neighbour's too, and the file
  // stores both copies. They match — so a tile edge is never a seam.
  const seen = new Map<string, number>()
  for (const block of blocks) {
    for (let row = 0; row < VERTS_PER_SIDE; row++) {
      for (let col = 0; col < VERTS_PER_SIDE; col++) {
        const key = `${block.x + col * TILE_STEP},${block.z + row * TILE_STEP}`
        const shade = block.shades[row * VERTS_PER_SIDE + col]
        if (seen.has(key)) expect({ key, shade }).toEqual({ key, shade: seen.get(key) })
        seen.set(key, shade)
      }
    }
  }
  // 16×16 blocks of 5×5 vertices sharing their edges: a 65×65 grid.
  expect(seen.size).toBe((BLOCKS_PER_SIDE * (VERTS_PER_SIDE - 1) + 1) ** 2)
})

// What the tile's rotate/flip byte does is half settled. These are the half
// that is: read out of `_d3d.dll` (../pigs-disasm/terrain/notes.md) and true
// under EVERY one of the eight ring positions the remaining doubt is about.
// A tile's four UVs are a RING, the byte's bits 1-2 are one 0..3 turn count
// around it, and bit 0 mirrors — so two quarter-turns must land every corner
// on its diagonal opposite, whichever position the ring sits in.
const CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1]
]
/** CORNERS index of the corner diagonally across the tile. */
const OPPOSITE = [3, 2, 1, 0]

test('the rotate/flip byte turns the texture the way the library turns it', () => {
  for (let convention = 0; convention < 8; convention++) {
    const seen = new Set<string>()
    for (let byte = 0; byte < 8; byte++) {
      const uvs = tileUvs(byte, CORNERS, convention)
      // A bijection onto the texture's four corners — never a folded tile.
      expect({ convention, byte, distinct: new Set(uvs.map(String)).size }).toEqual({
        convention,
        byte,
        distinct: 4
      })
      seen.add(JSON.stringify(uvs))
    }
    // Eight bytes, eight different orientations.
    expect({ convention, orientations: seen.size }).toEqual({ convention, orientations: 8 })

    // Bits 1-2 are ONE count, not two flags: adding 2 to it (byte | 4) is the
    // half-turn, and a half-turn round a four-corner ring is the diagonal.
    for (const byte of [0, 1, 2, 3]) {
      const straight = tileUvs(byte, CORNERS, convention)
      const halfTurned = tileUvs(byte | 4, CORNERS, convention)
      expect({ convention, byte, uvs: JSON.stringify(halfTurned) }).toEqual({
        convention,
        byte,
        uvs: JSON.stringify(OPPOSITE.map((i) => straight[i]))
      })
    }
  }
})
