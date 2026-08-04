// Building a map's ground mesh from parsed PMG blocks + PTG textures.
//
// Like pig.ts, everything stays in the game's Y-down space and the returned
// group carries the 180° X-rotation to Y-up. Tiles are grouped by texture so
// each of the ~240 map textures binds once. Tile UVs honor the rotate/flip
// byte; the rotation direction is a visual best-fit (docs/formats.md).

import * as THREE from 'three'
import type { TerrainBlock, TerrainTexture } from '../api'
import { HEIGHT_SCALE } from '../../../lib/game/terrain'

const TILE_STEP = 512
const TILES = 4
const VERTS = 5
const FLIP_X = 1
const ROTATE_90 = 2
const ROTATE_180 = 4

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

/** Unit-square UV corners for a tile, transformed by the rotate/flip byte. */
function tileUvs(rotateFlip: number): number[][] {
  // Corners in vertex-grid order: (0,0) (1,0) (0,1) (1,1); V follows +row.
  let corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1]
  ]
  const rotate = (times: number): void => {
    for (let i = 0; i < times; i++) {
      corners = corners.map(([u, v]) => [v, 1 - u])
    }
  }
  if (rotateFlip & ROTATE_90) rotate(1)
  if (rotateFlip & ROTATE_180) rotate(2)
  if (rotateFlip & FLIP_X) corners = corners.map(([u, v]) => [1 - u, v])
  // Texture rows are top-down (TIM): flip V at the end.
  return corners.map(([u, v]) => [u, 1 - v])
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
  const geometry = new THREE.BufferGeometry()
  const materials: THREE.Material[] = []
  const fallback = new THREE.MeshStandardMaterial({ color: 0x777777, side: THREE.DoubleSide })

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
      materials.push(new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }))
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
    const uv = tileUvs(tile.rotateFlip)
    // Two triangles: ACB + BCD — counter-clockwise when seen from up
    // (-Y in the game's Y-down space), matching the models' convention.
    for (const i of [0, 2, 1, 1, 2, 3]) {
      positions.set(corners[i], corner * 3)
      uvs.set(uv[i], corner * 2)
      corner++
    }
  }
  flushGroup()

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geometry.computeVertexNormals()

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
