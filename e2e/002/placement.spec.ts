// PHASE 002 (domain) — where the ground actually IS, against the exe's own
// index arithmetic rather than against itself.
//
// This is the spec the mirrored map got past for weeks. Everything was
// self-consistent: the mesh and the collision were built from the same
// wrong z, so no assertion about the engine could see it. What catches it
// is arithmetic taken from the disassembly and applied to the shipped maps:
//
//   Map::Load  0x4a570c   block (R, C), vertex (r, c) -> cell (4R+r, 4C+c)
//   SampleHeight 0x4a5140 col = (x + 0x4000) >> 9 and row = (-z + 0x4000) >> 9
//                         — NOTE the negation: cell row r sits at
//                         z = 16384 - 512*r, so a file row runs -z
//
// Compose those and a vertex's world position is fixed with no freedom left.
// The heights below are pulled out of the PMG's bytes rather than out of
// `parsePmg`, so this asks nothing of the reader it is checking.
// See terrain/notes.md and its `mirror.js`.

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { test, expect } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { HEIGHT_SCALE, TerrainQuery } from '../../src/lib/game/terrain'
import {
  BLOCKS_PER_SIDE,
  TILES_PER_SIDE,
  TILE_STEP,
  VERTS_PER_SIDE,
  parsePmg
} from '../../src/lib/formats/pmg'
import type { TerrainBlock } from '../../src/lib/formats/pmg'

const CELLS = BLOCKS_PER_SIDE * TILES_PER_SIDE
/** Half the world: the exe's coordinates run -16384 .. +16384 on both axes. */
const HALF = (CELLS * TILE_STEP) / 2

const BLOCK_BYTES = 368
const bytes = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(path.join(GAME_DIR, 'Maps', `${name}.PMG`)))
const load = (name: string): TerrainBlock[] => parsePmg(bytes(name))

/** The stored height the exe would fetch for a cell, straight out of the
 * file's bytes: block (row/4, col/4), vertex (row%4, col%4). */
function exeHeight(pmg: Uint8Array, row: number, col: number): number {
  const view = new DataView(pmg.buffer, pmg.byteOffset, pmg.byteLength)
  const block =
    Math.floor(row / TILES_PER_SIDE) * BLOCKS_PER_SIDE + Math.floor(col / TILES_PER_SIDE)
  const vertex = (row % TILES_PER_SIDE) * VERTS_PER_SIDE + (col % TILES_PER_SIDE)
  return view.getInt16(block * BLOCK_BYTES + 8 + vertex * 4, true)
}

for (const name of ['CAMP', 'ARCHI', 'DESVAL']) {
  test(`${name}: every vertex sits where the exe's own index arithmetic puts it`, () => {
    const pmg = bytes(name)
    const query = new TerrainQuery(load(name))
    let checked = 0
    // Row 0 sits at z = +16384, the far EDGE: a block anchors its minimum
    // corner, so nothing owns that line, and `SampleHeight` clamps its own
    // input to ±0x3dff and never asks for it either. Rows 1..63 are the
    // whole of the map the sampler can be asked about.
    for (let row = 1; row < CELLS; row++) {
      for (let col = 0; col < CELLS; col++) {
        const x = col * TILE_STEP - HALF
        // row = (-z + 0x4000) >> 9, turned round: the negation is the whole
        // point of this spec, and running z the other way is what a mirrored
        // map looks like from here.
        const z = HALF - row * TILE_STEP
        // Ground is Y-DOWN in the engine and the PMG stores elevation, hence
        // the negation — the one conversion this is allowed to make.
        const want = -exeHeight(pmg, row, col) * HEIGHT_SCALE
        const got = query.height(x, z)
        if (got !== want) {
          // Report the first disagreement with its cell, not 4096 of them.
          expect({ row, col, x, z, got }).toEqual({ row, col, x, z, got: want })
        }
        checked++
      }
    }
    expect(checked).toBe((CELLS - 1) * CELLS)
  })
}

test('the map fills the exe world exactly, and squarely', () => {
  const blocks = load('CAMP')
  const xs = blocks.map((b) => b.x)
  const zs = blocks.map((b) => b.z)
  // A block anchors its OWN minimum corner, so the last block starts one
  // block-span short of the far edge.
  const span = TILES_PER_SIDE * TILE_STEP
  expect({ minX: Math.min(...xs), maxX: Math.max(...xs) }).toEqual({ minX: -HALF, maxX: HALF - span })
  // The grid spans the same range on z, though the FILE's rows are laid into
  // it backwards (`parsePmg`): the world is square either way round, which is
  // exactly why this pair of assertions could never catch the mirror and the
  // one above it had to.
  expect({ minZ: Math.min(...zs), maxZ: Math.max(...zs) }).toEqual({ minZ: -HALF, maxZ: HALF - span })
})

// A third check was tried here and thrown out, which is worth recording: that
// a shaped wall's blocked half stands ABOVE its open half, so mirroring the
// map would invert it. The shipped maps do not carry the evidence — eight of
// them hold 49 shaped wall tiles between them, and the literal shapes win 28
// to 20 against the mirrored ones. That is noise, so nothing is asserted from
// it, and `movement/wall-shapes.js`'s "37% more tiles" should
// not be leaned on either. What settles the shapes is `Map::IsBlocked`
// (0x4a710c) taking both its fractions along the POSITIVE axis, which makes
// its nine branches the literal table in `lib/game/terrain.ts`; what settles
// the tile they are applied to is the spec above.
