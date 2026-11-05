// THE GROUND A DETECTOR SEES ITS MINES IN.
//
// Play: "видят жёлто-чёрные текстуры там где есть мины". The exe's reveal swaps
// the texture of each mine tile in a detector's 3×3 for one more ground texture
// the map loads beside its own, `Language/Tims/Mine.tim` (scanner/visibility.md,
// 0x4767A0, 0x4A6E30, 0x4A55BF). Which tiles those are is the engine's answer
// (lib/game/mines.ts, `revealed`); this only draws it.
//
// The swap keeps the tile's height and its baked shade and takes the art with no
// turn and no flip, whatever the tile's own rotate byte says (0x476B61 pushes
// turn 0; `afAdjustMapTile` stores no height or shade). So each stamped tile is a
// quad on the tile's own corners with the tile's own shades, drawn after the ground
// and pulled towards the eye so the two never fight over a pixel: the ground under
// it is untouched, which is what "the ground goes back" comes to when it is hidden.

import * as THREE from 'three'
import { tileUvs } from '../../../lib/formats/pmg'
import type { TerrainTexture } from '../api'
import { TILE_CORNERS, TILE_TRIANGLES, groundMap } from './terrain'
import type { Terrain } from './terrain'

/** A tile by its place on the map. */
export interface TilePlace {
  col: number
  row: number
}

export interface MineGround {
  /** Stamp exactly these and nothing else. Once a frame. */
  draw(tiles: readonly TilePlace[]): void
  /** The tiles wearing the stamp right now — the scene's own word, read off what
   * is visible rather than what `draw` was last asked for. */
  stamped(): TilePlace[]
  /** Where a tile's four corners are drawn, game space, for a paint check to know
   * where to look. Null off the map. */
  corners(col: number, row: number): { x: number; y: number; z: number }[] | null
  dispose(): void
}

/** The art with no turn and no flip (0x476B61). */
const STAMP_UVS = tileUvs(0, TILE_CORNERS)

/**
 * `art` is `Mine.tim`; null is a battle that failed to load it, which shows plain
 * ground rather than anything standing in for it.
 */
export function createMineGround(
  root: THREE.Object3D,
  terrain: Terrain,
  art: TerrainTexture | null
): MineGround {
  const map = art ? groundMap(art.rgba, art.width, art.height) : null
  const material = map
    ? new THREE.MeshBasicMaterial({
        map,
        side: THREE.DoubleSide,
        vertexColors: true,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      })
    : null
  /** One quad a tile, built the first time it is stamped and kept: a detector
   * walking a field comes back over the same ones. Keyed `row * 64 + col`. */
  const quads = new Map<number, THREE.Mesh>()
  const key = (tile: TilePlace): number => tile.row * 64 + tile.col

  const build = (tile: TilePlace): THREE.Mesh | null => {
    const drawn = terrain.tile(tile.col, tile.row)
    if (!drawn || !material) return null
    const positions: number[] = []
    const uvs: number[] = []
    const colors: number[] = []
    for (const i of TILE_TRIANGLES) {
      positions.push(...drawn.corners[i])
      uvs.push(...STAMP_UVS[i])
      colors.push(drawn.shades[i], drawn.shades[i], drawn.shades[i])
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const quad = new THREE.Mesh(geometry, material)
    // After the ground, or the opaque pass's front-to-back sort can put it first.
    quad.renderOrder = 1
    root.add(quad)
    return quad
  }

  return {
    draw(tiles) {
      const wanted = new Set(tiles.map(key))
      for (const [at, quad] of quads) quad.visible = wanted.has(at)
      for (const tile of tiles) {
        if (quads.has(key(tile))) continue
        const quad = build(tile)
        if (quad) quads.set(key(tile), quad)
      }
    },
    stamped() {
      const out: TilePlace[] = []
      for (const [at, quad] of quads) {
        if (quad.visible) out.push({ col: at % 64, row: Math.floor(at / 64) })
      }
      return out
    },
    corners(col, row) {
      const drawn = terrain.tile(col, row)
      return drawn ? drawn.corners.map(([x, y, z]) => ({ x, y, z })) : null
    },
    dispose() {
      for (const quad of quads.values()) {
        root.remove(quad)
        quad.geometry.dispose()
      }
      quads.clear()
      if (map) map.dispose()
      if (material) material.dispose()
    }
  }
}
