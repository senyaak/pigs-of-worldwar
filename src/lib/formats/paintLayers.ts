// Which of a model's texture groups are painted ON another group, in its plane.
//
// A map's wall piece is not only its wall. Each end carries a second quad, on the
// same plane as the wall's outer face and overlapping it: the corner stones,
// `ST018`/`ST019` on the house and `BRIC`/`MET` on the other walls, a keyed
// texture whose opaque middle lies over the wall's last 96 units. [measured],
// STW07PWW's quads in CAMP.MAD and every shipped map's models after it
// (docs/facts/wall-art.md).
//
// Nothing here knows those names, because the rule is the art's and the geometry's:
// a group of KEYED texture, lying in a plane with an opaque group of its model and
// overlapping it. A hole in a texture is there to show what is under it, so that pair
// means one thing only: the keyed group is on top, wherever the model lists it, and
// SEPIA1's `M1W05PPP` lists its stones before their wall.
//
// Nothing else is settled by the art, so nothing else gets a layer. Of two opaque
// groups (`TANK`, `BIG_GUN`, `SWILL2`) or two keyed ones (the trees, `BUSH2`), which
// one the player sees is not known, and the group list does not say: a bias on the
// later one changes the TANK's picture. They stay as they were (#170). Same-group
// overlaps, a doubled leaf quad, are one texture and have nothing to settle.

import type { Model, ModelGroup } from './model'
import type { Tim } from './tim'

type Vector = readonly [number, number, number]

interface Face {
  corners: readonly [Vector, Vector, Vector]
  normal: Vector
}

const minus = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vector, b: Vector): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]

/** A group's triangles. Zero-area ones have no plane to share and are dropped. */
function facesOf(model: Model, group: ModelGroup): Face[] {
  const corner = (index: number): Vector => [
    model.positions[index * 3],
    model.positions[index * 3 + 1],
    model.positions[index * 3 + 2]
  ]
  const faces: Face[] = []
  for (let at = group.start; at < group.start + group.count; at += 3) {
    const corners = [corner(at), corner(at + 1), corner(at + 2)] as const
    const normal = cross(minus(corners[1], corners[0]), minus(corners[2], corners[0]))
    if (normal[0] !== 0 || normal[1] !== 0 || normal[2] !== 0) faces.push({ corners, normal })
  }
  return faces
}

/** Exact, on purpose: a prop's corners are the VTX's own integers. */
const samePlane = (a: Face, b: Face): boolean =>
  b.corners.every((corner) => dot(a.normal, minus(corner, a.corners[0])) === 0)

/** Whether one triangle's edges keep the other wholly to their far side. */
function separated(a: Face, b: Face, across: number, along: number): boolean {
  for (let edge = 0; edge < 3; edge++) {
    const from = a.corners[edge]
    const to = a.corners[(edge + 1) % 3]
    const nx = to[along] - from[along]
    const ny = from[across] - to[across]
    const reach = (face: Face): number[] =>
      face.corners.map((corner) => corner[across] * nx + corner[along] * ny)
    const own = reach(a)
    const other = reach(b)
    if (Math.max(...own) <= Math.min(...other) || Math.max(...other) <= Math.min(...own)) return true
  }
  return false
}

/** Two triangles of one plane overlap with AREA: touching along an edge, as the
 * halves of a quad and two abutting wall sections do, is not overlapping. */
function overlap(a: Face, b: Face): boolean {
  // Flat on the plane's own steepest axis, where the triangle keeps its shape.
  const sizes = a.normal.map(Math.abs)
  const flat = sizes.indexOf(Math.max(...sizes))
  const across = flat === 0 ? 1 : 0
  const along = flat === 2 ? 1 : 2
  return !separated(a, b, across, along) && !separated(b, a, across, along)
}

/** Whether a texture has key holes: a TIM's fully transparent colour (lib/formats/tim.ts). */
function hasHoles(texture: Pick<Tim, 'rgba'>): boolean {
  for (let alpha = 3; alpha < texture.rgba.length; alpha += 4) {
    if (texture.rgba[alpha] === 0) return true
  }
  return false
}

/**
 * One number per group, in group order: 1 for a keyed group painted on an opaque one
 * of its model, 0 for any other. `textures` is what a group's `texture` indexes, and a
 * group whose texture is missing is drawn opaque. Only a group's own model is looked
 * at, so what two placed records do to each other is not in this.
 */
export function paintLayers(model: Model, textures: readonly Pick<Tim, 'rgba'>[]): number[] {
  const keyed = model.groups.map((group) => {
    const texture = textures[group.texture]
    return texture !== undefined && hasHoles(texture)
  })
  const faces = model.groups.map((group) => facesOf(model, group))
  return model.groups.map((_, upper) => {
    if (!keyed[upper]) return 0
    const painted = faces.some(
      (under, lower) =>
        !keyed[lower] &&
        faces[upper].some((one) => under.some((other) => samePlane(one, other) && overlap(one, other)))
    )
    return painted ? 1 : 0
  })
}
