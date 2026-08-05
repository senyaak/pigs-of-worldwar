// PHASE 002 (domain) — where the ground actually IS, against the exe's own
// index arithmetic rather than against itself.
//
// This is the spec the mirrored map got past for weeks. Everything was
// self-consistent: the mesh and the collision were built from the same
// wrong z, so no assertion about the engine could see it. What catches it
// is arithmetic taken from the disassembly and applied to the shipped maps:
//
//   Map::Load  0x4a5635   block x = (col - 8) * 2048, z = (row - 8) * 2048,
//                         from the block's PLACE in the file — the stored
//                         offsets are overwritten before anything reads them
//   Map::Load  0x4a570c   block (R, C), vertex (r, c) -> cell (4R+r, 4C+c)
//   SampleHeight 0x4a5140 cell = row * 64 + col, and the world coordinate of
//                         a cell is col * 512 - 16384 / row * 512 - 16384
//
// Compose those and a vertex's world position is fixed with no freedom left.
// See ../pigs-disasm/terrain/notes.md.

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

const load = (name: string): TerrainBlock[] =>
  parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', `${name}.PMG`)))

/** The stored height the exe would fetch for a cell, by its own arithmetic. */
function exeHeight(blocks: TerrainBlock[], row: number, col: number): number {
  const block = blocks[Math.floor(row / TILES_PER_SIDE) * BLOCKS_PER_SIDE + Math.floor(col / TILES_PER_SIDE)]
  return block.heights[(row % TILES_PER_SIDE) * VERTS_PER_SIDE + (col % TILES_PER_SIDE)]
}

for (const name of ['CAMP', 'ARCHI', 'DESVAL']) {
  test(`${name}: every vertex sits where the exe's own index arithmetic puts it`, () => {
    const blocks = load(name)
    const query = new TerrainQuery(blocks)
    let checked = 0
    for (let row = 0; row < CELLS; row++) {
      for (let col = 0; col < CELLS; col++) {
        const x = col * TILE_STEP - HALF
        const z = row * TILE_STEP - HALF
        // Ground is Y-DOWN in the engine and the PMG stores elevation, hence
        // the negation — the one conversion this is allowed to make.
        const want = -exeHeight(blocks, row, col) * HEIGHT_SCALE
        const got = query.height(x, z)
        if (got !== want) {
          // Report the first disagreement with its cell, not 4096 of them.
          expect({ row, col, x, z, got }).toEqual({ row, col, x, z, got: want })
        }
        checked++
      }
    }
    expect(checked).toBe(CELLS * CELLS)
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
  // z the same way round as x. It was the opposite for weeks, and that is
  // exactly what a mirrored map looks like from here.
  expect({ minZ: Math.min(...zs), maxZ: Math.max(...zs) }).toEqual({ minZ: -HALF, maxZ: HALF - span })
})

// A third check was tried here and thrown out, which is worth recording: that
// a shaped wall's blocked half stands ABOVE its open half, so mirroring the
// map would invert it. The shipped maps do not carry the evidence — eight of
// them hold 49 shaped wall tiles between them, and the literal shapes win 28
// to 20 against the mirrored ones. That is noise, so nothing is asserted from
// it, and `../pigs-disasm/movement/wall-shapes.js`'s "37% more tiles" should
// not be leaned on either. What settles the shapes is `Map::IsBlocked`
// measuring its fraction along +z, and what settles +z is the spec above.
