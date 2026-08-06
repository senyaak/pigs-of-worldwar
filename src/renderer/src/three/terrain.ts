// Building a map's ground mesh from parsed PMG blocks + PTG textures.
//
// Like pig.ts, everything stays in the game's Y-down space and the returned
// group carries the 180° X-rotation to Y-up. Tiles are grouped by texture so
// each of the ~240 map textures binds once. Tile UVs honor the rotate/flip
// byte; the rotation direction is a visual best-fit (docs/formats.md).
//
// The ground is NOT lit by the scene. Every PMG vertex carries its own baked
// brightness and the original just modulates the texture by it, Gouraud
// across the tile — which is what makes its hills look rounded instead of
// faceted. Lighting these polygons a second time would fight that, so the
// material is unlit and the shade rides in as vertex colour.

import * as THREE from 'three'
import type { TerrainBlock, TerrainTexture } from '../api'
import { HEIGHT_SCALE, openWaterMask, waterLevelGrid } from '../../../lib/game/terrain'
import { waterColourSet } from '../../../lib/game/watermask'
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
  // Water, the original's shape: each water REGION carries its own fitted
  // level ("Fitting water." flood-fills them, exe 0x451b20); ground
  // vertices below their region's level are RAISED to it ("Flattening
  // water level: ", 0x451d0c) so no seabed pokes through; the shore tiles'
  // art is a MASK over the water surface — their watery texels are
  // see-through — and the surface itself is a PLAIN sheet of the map's
  // water colour just under the level, per region, smooth as the shipped
  // game's own water. Collision stays unflattened; gameplay reads the
  // same texel mask through lib/game/watermask.
  const waterLevels = waterLevelGrid(blocks)
  const openTiles = openWaterMask(blocks)
  const minX = Math.min(...blocks.map((b) => b.x))
  const minZ = Math.min(...blocks.map((b) => b.z))
  const side = openTiles.length
  /** Global cells carrying the water flag — where the sheet must reach. */
  const bitTiles: boolean[][] = Array.from({ length: side }, () => Array(side).fill(false))
  /** Texture ids worn by any water-flagged tile — the only mask candidates:
   * a dry-land texture that happens to share a colour stays untouched. */
  const waterWorn = new Set<number>()
  // Collect EVERY tile — the mask decides what survives, not geometry: a
  // fully watery texture ends up fully punched and simply never covers a
  // fragment, which is the original's fully-watery skip falling out free.
  const tiles: TileRef[] = []
  for (const block of blocks) {
    for (let row = 0; row < TILES; row++) {
      for (let col = 0; col < TILES; col++) {
        const tile = block.tiles[row * TILES + col]
        const gRow = Math.round((block.z - minZ) / TILE_STEP) + row
        const gCol = Math.round((block.x - minX) / TILE_STEP) + col
        if ((tile.type & 0x20) !== 0) {
          bitTiles[gRow][gCol] = true
          waterWorn.add(tile.texture)
        }
        tiles.push({ block, row, col, texture: tile.texture, rotateFlip: tile.rotateFlip })
      }
    }
  }
  tiles.sort((a, b) => a.texture - b.texture)
  // One shared verdict with the gameplay mask: the water colours are the
  // pure-water art's texels (lib/game/watermask), and everything those
  // colours touch — shore masking here, swimming there — agrees.
  const waterColours = waterColourSet(blocks, textures)
  const tint = { r: 0, g: 0, b: 0, n: 0 }
  for (const packed of waterColours) {
    tint.r += (packed >> 16) & 0xff
    tint.g += (packed >> 8) & 0xff
    tint.b += packed & 0xff
    tint.n++
  }
  const waterColor =
    tint.n > 0 ? { r: tint.r / tint.n, g: tint.g / tint.n, b: tint.b / tint.n } : null
  /** The art with its watery texels punched through, or null if none are. */
  const maskedArt = (texture: TerrainTexture): Uint8Array | null => {
    if (waterColours.size === 0) return null
    let punched = false
    const rgba = new Uint8Array(texture.rgba)
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] === 0) continue
      if (waterColours.has((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2])) {
        rgba[i + 3] = 0
        punched = true
      }
    }
    return punched ? rgba : null
  }

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
      // A texture worn by water gets its watery texels punched through —
      // the shore art becomes the MASK the original makes of it, and the
      // water surface below shows in the holes. Cutout alpha, as the
      // original's 1-bit transparency: no blend-sorting to go wrong.
      const punched = waterWorn.has(groupTexture) ? maskedArt(texture) : null
      const map = new THREE.DataTexture(
        punched ?? texture.rgba,
        texture.width,
        texture.height,
        THREE.RGBAFormat
      )
      map.flipY = false
      map.magFilter = THREE.NearestFilter
      map.minFilter = THREE.LinearFilter
      map.colorSpace = THREE.SRGBColorSpace
      map.needsUpdate = true
      materials.push(
        new THREE.MeshBasicMaterial({
          map,
          side: THREE.DoubleSide,
          vertexColors: true,
          ...(punched ? { alphaTest: 0.5 } : {})
        })
      )
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
    // block's place in the world. Rows advance +Z, columns +X — the exe
    // derives both from the block's index (lib/formats/pmg.ts).
    const cellLevel =
      waterLevels[Math.round((block.z - minZ) / TILE_STEP) + row]?.[
        Math.round((block.x - minX) / TILE_STEP) + col
      ] ?? null
    const corners = [
      [col, row],
      [col + 1, row],
      [col, row + 1],
      [col + 1, row + 1]
    ].map(([c, r]) => [
      block.x + c * TILE_STEP,
      // PMG heights are elevation (up-positive — verified: water sits at
      // the small values); the game's Y axis points down. The doubling is
      // the game's own: see HEIGHT_SCALE. Nothing renders below the LOCAL
      // region's water level — the exe's flattening, see above.
      -Math.max(block.heights[r * VERTS + c] * HEIGHT_SCALE, cellLevel ?? -Infinity),
      block.z + r * TILE_STEP
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
  // ONE inner group carries everything game-space, so callers that
  // re-parent the converted content (the battle scene takes children[0])
  // carry the water sheet along with the ground.
  const inner = new THREE.Group()
  inner.add(mesh)
  const group = new THREE.Group()
  group.rotation.x = Math.PI
  group.add(inner)

  // The water surface: ONE plain, opaque sheet of the map's water colour
  // where the ground is not — smooth, as the shipped game's water plays
  // (its footage shows no pattern on the surface). Nothing to sort, and a
  // swimming pig sinks visibly into it. It spans every water-flagged cell
  // and one ring beyond, so the shore masks always have water to reveal.
  let sheet: THREE.Mesh | null = null
  // A cell's own region level, or the nearest neighbouring region's — the
  // one-ring skirt under the shore masks takes the level of the water it
  // borders.
  const levelNear = (row: number, col: number): number | null => {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const level = waterLevels[row + dr]?.[col + dc] ?? null
        if (level !== null) return level
      }
    }
    return null
  }
  const quadsOver = (mask: (row: number, col: number) => boolean): THREE.BufferGeometry | null => {
    const cells: number[] = []
    for (let row = 0; row < side; row++) {
      for (let col = 0; col < side; col++) {
        if (mask(row, col)) cells.push(row * side + col)
      }
    }
    if (cells.length === 0) return null
    const positions = new Float32Array(cells.length * 6 * 3)
    let vertex = 0
    for (const cell of cells) {
      const row = Math.floor(cell / side)
      const colIdx = cell % side
      const x0 = minX + colIdx * TILE_STEP
      const z0 = minZ + row * TILE_STEP
      // Each cell floats a hair under ITS region's level, so the flattened
      // shore tiles sit above it.
      const y = -(levelNear(row, colIdx) ?? 0) + 1
      const corner = (dx: number, dz: number): void => {
        positions.set([x0 + dx, y, z0 + dz], vertex * 3)
        vertex++
      }
      corner(0, 0)
      corner(0, TILE_STEP)
      corner(TILE_STEP, 0)
      corner(TILE_STEP, 0)
      corner(0, TILE_STEP)
      corner(TILE_STEP, TILE_STEP)
    }
    const quads = new THREE.BufferGeometry()
    quads.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return quads
  }
  if (waterColor) {
    const near = (row: number, col: number): boolean => {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (bitTiles[row + dr]?.[col + dc] || openTiles[row + dr]?.[col + dc]) return true
        }
      }
      return false
    }
    const quads = quadsOver(near)
    if (quads) {
      sheet = new THREE.Mesh(
        quads,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(
            waterColor.r / 255,
            waterColor.g / 255,
            waterColor.b / 255
          ).convertSRGBToLinear(),
          side: THREE.DoubleSide
        })
      )
      inner.add(sheet)
    }
  }

  return {
    group,
    tileCount: blocks.length * TILES * TILES,
    dispose() {
      geometry.dispose()
      for (const material of materials) {
        ;(material as THREE.MeshStandardMaterial).map?.dispose()
        material.dispose()
      }
      if (sheet) {
        sheet.geometry.dispose()
        ;(sheet.material as THREE.Material).dispose()
      }
    }
  }
}
