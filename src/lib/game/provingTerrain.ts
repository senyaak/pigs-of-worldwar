// The proving ground's ground: one flat field through the middle of the map,
// and a little relief off to one side — a pond with a bank to walk out onto,
// a hill to roll things down, and a wall.
//
// The LAYOUT is the remake's own (docs/facts/proving-ground.md). What a tile
// IS is not: every byte below is one a shipped map uses for the same thing,
// measured over CAMP's own tiles on 2026-11-02, and the textures are CAMP's
// (`GROUND_TEXTURES`, lib/game/provingSources.ts).
//
// Pure: the blocks are built by the same builder the unit fixture uses
// (lib/game/terrainBlocks.ts).

import { TILE_STEP, TILE_WATER, TILE_WALL } from '../formats/pmg'
import type { TerrainBlock, TerrainTile } from '../formats/pmg'
import { terrainBlocks } from './terrainBlocks'

/** The field's elevation, PMG height units — the flat everything stands on. */
export const GROUND = 1024

/**
 * CAMP's commonest open ground: texture 2 wears 714 of its 4096 tiles, more
 * than any other, its palette carries no translucent colour (solid art,
 * lib/game/watermask.ts `textureKind` 0), and every one of those 714 tiles
 * has the type byte 0x09.
 */
export const OPEN_TEXTURE = 2
export const OPEN_TYPE = 0x09

/**
 * CAMP's water: all 110 of its water-flagged tiles carry type byte 0x24 —
 * the water bit 0x20 over terrain type 4 — and its open water wears textures
 * 44, 45 and 46, the only three in CAMP.PTG whose whole palette is
 * translucent (water kind 2). A water tile needs BOTH halves: the bit, and
 * the art (docs/facts/water.md).
 */
export const WATER_TEXTURE = 44
export const WATER_TYPE = TILE_WATER | 0x04

/**
 * CAMP's walls: 562 of its 614 wall-flagged tiles wear textures 153..156,
 * and every one of those carries type byte 0x85 — the wall bit 0x80 over
 * terrain type 5 — with the solid-half byte 0, the whole tile (`MapTileSlip`,
 * docs/facts/terrain.md; `WALL_SHAPES` 0 in lib/game/terrain.ts).
 */
export const WALL_TEXTURE = 153
export const WALL_TYPE = TILE_WALL | 0x05
export const WALL_WHOLE = 0

/** A rectangle on the ground, world units, inclusive of its edges. */
export interface Area {
  x0: number
  x1: number
  z0: number
  z1: number
}

/**
 * The strip: the band down the middle of the map the player's pig and the
 * dummies stand along, running +x. Flat for its whole length; the relief is
 * kept well off it.
 */
export const STRIP: Area = { x0: -12288, x1: 12288, z0: -1024, z1: 1024 }

/** The OPEN WATER: every vertex inside is one step below the field, so the
 * tiles inside are water from corner to corner and the ring of tiles round
 * them slopes back up to the field — the bank. */
export const POND: Area = { x0: 1024, x1: 3072, z0: -6144, z1: -4096 }
/** How far the open water lies below the field — 128, the step every
 * shipped map's main water sits at (docs/facts/water.md). */
export const POND_DEPTH = 128

/** The hill: it rises from the field at its edges to a flat top. */
export const HILL: Area = { x0: 4608, x1: 9728, z0: -9216, z1: -3584 }
/** How high its top stands, and over how much ground it gets there — a 1 in
 * 2 grade, which is walked (docs/facts/walls-and-slopes.md). */
export const HILL_RISE = 1024
export const HILL_RUN = 2048

/** The wall: a ridge of vertices raised along x, and every tile touching
 * them is a wall tile. */
export const WALL: Area = { x0: 1024, x1: 3072, z0: -8192, z1: -8192 }
export const WALL_RISE = 768

const inside = (area: Area, x: number, z: number): boolean =>
  x >= area.x0 && x <= area.x1 && z >= area.z0 && z <= area.z1

/** Whether the tile whose low corner is (x, z) has a corner in `area`. */
const touches = (area: Area, x: number, z: number): boolean =>
  x + TILE_STEP >= area.x0 && x <= area.x1 && z + TILE_STEP >= area.z0 && z <= area.z1

/** Whether the tile whose low corner is (x, z) lies wholly in `area`. */
const within = (area: Area, x: number, z: number): boolean =>
  x >= area.x0 && x + TILE_STEP <= area.x1 && z >= area.z0 && z + TILE_STEP <= area.z1

/** The field's elevation at a vertex, PMG height units, up-positive. */
export function provingElevation(x: number, z: number): number {
  if (inside(POND, x, z)) return GROUND - POND_DEPTH
  if (inside(WALL, x, z)) return GROUND + WALL_RISE
  if (inside(HILL, x, z)) {
    const edge = Math.min(x - HILL.x0, HILL.x1 - x, z - HILL.z0, HILL.z1 - z)
    return GROUND + HILL_RISE * Math.min(1, edge / HILL_RUN)
  }
  return GROUND
}

/** What the tile whose low corner is (x, z) is. */
export function provingTile(x: number, z: number): Partial<TerrainTile> {
  if (touches(WALL, x, z)) return { texture: WALL_TEXTURE, type: WALL_TYPE, slip: WALL_WHOLE }
  if (within(POND, x, z)) return { texture: WATER_TEXTURE, type: WATER_TYPE }
  return { texture: OPEN_TEXTURE, type: OPEN_TYPE }
}

/**
 * A vertex's baked brightness: `249·n_y + 5`, the fit of a shipped map's
 * shade to its own vertex normals — a light straight overhead with next to no
 * ambient (ARCHI, R² 0.81; lib/formats/pmg.ts `shades`). Flat ground comes to
 * 254, and the hill and the pond's bank darken with their slope the way a
 * shipped map's do.
 */
export function provingShade(x: number, z: number): number {
  const dx = (provingElevation(x + TILE_STEP, z) - provingElevation(x - TILE_STEP, z)) / (2 * TILE_STEP)
  const dz = (provingElevation(x, z + TILE_STEP) - provingElevation(x, z - TILE_STEP)) / (2 * TILE_STEP)
  const up = 1 / Math.hypot(dx, dz, 1)
  return Math.max(0, Math.min(255, Math.round(249 * up + 5)))
}

/** The whole ground, as the blocks a .PMG would have handed over. */
export const provingGroundBlocks = (): TerrainBlock[] =>
  terrainBlocks(provingElevation, provingTile, provingShade)
