// A signpost that wears a board of its own — the proving ground's, each carrying
// the skill of the crate beside it (docs/facts/proving-ground.md). A shipped
// map's SIGN has no boards and goes through none of this.
//
// The icon is on the record's own mesh, so what happens to the mesh happens to
// it: a sign that is shot down takes its icon with it, and a sign that fades
// fades whole.

import * as THREE from 'three'
import type { MapProp, SignBoard } from '../api'
import { buildModelGeometry, textureMaterial } from './modelMesh'

export interface Look {
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
}

/**
 * A look per record for a model's boards, built on its plain `look`.
 *
 * Only the board's material is new. The post's is the model's own, and so is
 * every texture but the icon's.
 */
export function signBoardLooks(prop: MapProp, look: Look): Map<SignBoard['id'], Look> {
  const looks = new Map<SignBoard['id'], Look>()
  if (prop.boards.length === 0) return looks
  const geometry = readableBothWays(prop, prop.boards[0].group)
  for (const board of prop.boards) {
    const materials = [...look.materials]
    materials[board.group] = textureMaterial(board.art, false)
    looks.set(board.id, { geometry, materials })
  }
  return looks
}

/**
 * The model's geometry with the board's +x face un-mirrored.
 *
 * Measured off `Maps/CAMP.MAD`: the board's two faces carry the same U along z,
 * so a picture reads the right way round from the −x side and backwards from the
 * +x side, which the shipped art never shows because a skull and crossbones is
 * symmetrical. An icon is not, so the +x face runs the other way.
 */
function readableBothWays(prop: MapProp, group: SignBoard['group']): THREE.BufferGeometry {
  const geometry = buildModelGeometry(prop.model, prop.textures)
  const { start, count } = prop.model.groups[group]
  const uv = geometry.getAttribute('uv')
  for (let corner = start; corner < start + count; corner++) {
    if (prop.model.positions[corner * 3] > 0) uv.setX(corner, 1 - uv.getX(corner))
  }
  return geometry
}

/** The texture a mesh's material array holds, per face group. */
const mapsOf = (mesh: THREE.Object3D): (THREE.Texture | null)[] => {
  if (!(mesh instanceof THREE.Mesh) || !Array.isArray(mesh.material)) return []
  return mesh.material.map((material: THREE.MeshBasicMaterial) => material.map)
}

/** What a mesh is drawn in right now, by name: a spec's read of the renderer's
 * own node rather than of what was meant to be put on it. */
export const drawnMaps = (mesh: THREE.Object3D): string[] =>
  mapsOf(mesh).map((map) => (map ? map.name : ''))

/** The sum of the colour bytes in the mesh's last face group's texture — which
 * on a SIGN is the board. What lets a spec hold the drawn pixels against the
 * archive's, with no copy of them crossing the bridge. */
export function boardTexels(mesh: THREE.Object3D): number {
  const map = mapsOf(mesh).at(-1)
  if (!map) return 0
  const { data: rgba } = map.image as { data: Uint8Array }
  let sum = 0
  for (let at = 0; at < rgba.length; at += 4) sum += rgba[at] + rgba[at + 1] + rgba[at + 2]
  return sum
}

/**
 * Where a SIGN's board is in the frame, as fractions of the canvas, top left at
 * 0,0: the extent of whichever of its two faces is nearer the camera. The last
 * face group is the board (measured, `lib/game/provingSources.ts`). Null for
 * anything without one.
 */
export function boardOnScreen(
  mesh: THREE.Object3D,
  camera: THREE.Camera
): { left: number; top: number; right: number; bottom: number } | null {
  if (!(mesh instanceof THREE.Mesh)) return null
  const geometry = mesh.geometry as THREE.BufferGeometry
  const group = geometry.groups.at(-1)
  if (!group) return null
  mesh.updateWorldMatrix(true, false)
  const position = geometry.getAttribute('position')
  const faces: THREE.Vector3[][] = [[], []]
  for (let corner = group.start; corner < group.start + group.count; corner++) {
    const local = new THREE.Vector3().fromBufferAttribute(position, corner)
    faces[local.x > 0 ? 0 : 1].push(local.applyMatrix4(mesh.matrixWorld))
  }
  const distance = (face: THREE.Vector3[]): number =>
    Math.min(...face.map((one) => one.distanceTo(camera.position)))
  const near = distance(faces[0]) < distance(faces[1]) ? faces[0] : faces[1]
  const seen = near.map((one) => one.clone().project(camera))
  return {
    left: (Math.min(...seen.map((one) => one.x)) + 1) / 2,
    right: (Math.max(...seen.map((one) => one.x)) + 1) / 2,
    top: (1 - Math.max(...seen.map((one) => one.y))) / 2,
    bottom: (1 - Math.min(...seen.map((one) => one.y))) / 2
  }
}
