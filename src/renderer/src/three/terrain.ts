// Building a map's ground mesh from parsed PMG blocks + PTG textures.
//
// Like pig.ts, everything stays in the game's Y-down space and the returned
// group carries the 180° X-rotation to Y-up. Tiles are grouped by texture so
// each of the ~240 map textures binds once. The rotate/flip byte is applied
// the way the original applies it — read out of the library that draws the
// ground, not guessed (`../pigs-disasm/terrain/notes.md`).
//
// The ground is NOT lit by the scene. Every PMG vertex carries its own baked
// brightness and the original just modulates the texture by it, Gouraud
// across the tile — which is what makes its hills look rounded instead of
// faceted. Lighting these polygons a second time would fight that, so the
// material is unlit and the shade rides in as vertex colour.

import * as THREE from 'three'
import type { TerrainBlock, TerrainTexture } from '../api'
import { HEIGHT_SCALE } from '../../../lib/game/terrain'
import { tileUvs } from '../../../lib/formats/pmg'

const TILE_STEP = 512
const TILES = 4
const VERTS = 5

/** The tile's corners in the order this file builds them, as (a, b). */
const TILE_CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1]
]

/**
 * Shade byte → linear-space multiplier.
 *
 * The original scales the texel in display space; three's vertex colours are
 * in the linear working space, so the sRGB transfer function goes in here or
 * every slope comes out washed out (0.7 display is 0.45 linear).
 */
const SHADE_TO_LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const s = i / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
})

export interface Terrain {
  /** Add THIS to the scene; already converted to Y-up. */
  group: THREE.Group
  tileCount: number
  dispose(): void
}

interface TileRef {
  block: TerrainBlock
  row: number
  col: number
  texture: number
  rotateFlip: number
}

export function buildTerrain(blocks: TerrainBlock[], textures: TerrainTexture[]): Terrain {
  // Collect every tile, then sort by texture for contiguous material groups.
  const tiles: TileRef[] = []
  for (const block of blocks) {
    for (let row = 0; row < TILES; row++) {
      for (let col = 0; col < TILES; col++) {
        const tile = block.tiles[row * TILES + col]
        tiles.push({ block, row, col, texture: tile.texture, rotateFlip: tile.rotateFlip })
      }
    }
  }
  tiles.sort((a, b) => a.texture - b.texture)

  const positions = new Float32Array(tiles.length * 6 * 3)
  const uvs = new Float32Array(tiles.length * 6 * 2)
  const colors = new Float32Array(tiles.length * 6 * 3)
  const geometry = new THREE.BufferGeometry()
  const materials: THREE.Material[] = []
  const fallback = new THREE.MeshBasicMaterial({
    color: 0x777777,
    side: THREE.DoubleSide,
    vertexColors: true
  })

  let corner = 0
  let groupStart = 0
  let groupTexture = -1

  const flushGroup = (): void => {
    if (corner === groupStart) return
    const texture = textures[groupTexture]
    if (texture) {
      const map = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat)
      map.flipY = false
      map.magFilter = THREE.NearestFilter
      map.minFilter = THREE.LinearFilter
      map.colorSpace = THREE.SRGBColorSpace
      map.needsUpdate = true
      materials.push(new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, vertexColors: true }))
    } else {
      materials.push(fallback)
    }
    geometry.addGroup(groupStart, corner - groupStart, materials.length - 1)
    groupStart = corner
  }

  for (const tile of tiles) {
    if (tile.texture !== groupTexture) {
      flushGroup()
      groupTexture = tile.texture
    }
    const { block, row, col } = tile
    // Tile corners from the block's 5×5 height grid; world XZ from the
    // block offset. Rows advance -Z (block offsets step that way too).
    const corners = [
      [col, row],
      [col + 1, row],
      [col, row + 1],
      [col + 1, row + 1]
    ].map(([c, r]) => [
      block.x + c * TILE_STEP,
      // PMG heights are elevation (up-positive — verified: water sits at
      // the small values); the game's Y axis points down. The doubling is
      // the game's own: see HEIGHT_SCALE.
      -block.heights[r * VERTS + c] * HEIGHT_SCALE,
      block.z - r * TILE_STEP
    ])
    // The same 5×5 grid carries the baked brightness. Blocks agree on the
    // vertices they share, so a tile edge is a shade the neighbour repeats
    // and the gradient runs on across the whole map.
    const shades = [
      [col, row],
      [col + 1, row],
      [col, row + 1],
      [col + 1, row + 1]
    ].map(([c, r]) => SHADE_TO_LINEAR[block.shades[r * VERTS + c]])
    const uv = tileUvs(tile.rotateFlip, TILE_CORNERS)
    // Two triangles: ACB + BCD — counter-clockwise when seen from up
    // (-Y in the game's Y-down space), matching the models' convention.
    for (const i of [0, 2, 1, 1, 2, 3]) {
      positions.set(corners[i], corner * 3)
      uvs.set(uv[i], corner * 2)
      colors.set([shades[i], shades[i], shades[i]], corner * 3)
      corner++
    }
  }
  flushGroup()

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // No normals: an unlit material never reads them, and the per-face ones
  // computeVertexNormals gave these split vertices are exactly the faceting
  // the baked shade replaces.

  const mesh = new THREE.Mesh(geometry, materials)
  const group = new THREE.Group()
  group.rotation.x = Math.PI
  group.add(mesh)

  return {
    group,
    tileCount: tiles.length,
    dispose() {
      geometry.dispose()
      for (const material of materials) {
        ;(material as THREE.MeshStandardMaterial).map?.dispose()
        material.dispose()
      }
    }
  }
}
