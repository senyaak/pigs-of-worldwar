// Which of a model's texture groups are painted ON another group, in its plane.
//
// A map's wall piece is not only its wall. Each end carries a second quad, on the
// same plane as the wall's outer face and overlapping it: the corner stones,
// `ST018`/`ST019` on the house and `BRIC`/`MET` on the other walls, a keyed
// texture whose opaque middle lies over the wall's last 96 units. [measured],
// STW07PWW's quads in CAMP.MAD and every shipped map's models after it
// (docs/facts/wall-art.md).
//
// Nothing here knows those names, because the rule is the geometry's: two faces
// of one model that share a plane and overlap with some area. The later group is
// the one that wins today (a mesh draws its groups in order and the depth test is
// less-or-equal), so the later group is the one on top. Same-group overlaps, a
// doubled leaf quad, are the same texture and have nothing to settle.

import type { Model, ModelGroup } from './model'

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

/**
 * One number per group, in group order: 0 for a group on nothing, and one more
 * than the highest group it is painted on otherwise. Only a group's own model is
 * looked at, so what two placed records do to each other is not in this.
 */
export function paintLayers(model: Model): number[] {
  const faces = model.groups.map((group) => facesOf(model, group))
  const layers = model.groups.map(() => 0)
  for (let upper = 1; upper < faces.length; upper++) {
    for (let lower = 0; lower < upper; lower++) {
      if (layers[lower] < layers[upper]) continue
      const painted = faces[upper].some((one) =>
        faces[lower].some((other) => samePlane(one, other) && overlap(one, other))
      )
      if (painted) layers[upper] = layers[lower] + 1
    }
  }
  return layers
}
