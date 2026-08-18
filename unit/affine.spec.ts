// PHASE 002 (drawing) — the affine pieces the perspective board is laid with.
//
// Pure geometry, so it runs with no window: `texturedTriangle` only ever calls
// a context, and a recording stand-in is enough to read the matrix it composes.
//
// The subject is a bug play found: white hairlines across the battle map "in
// some places" and not others. The seam-closing offset was radial from the
// triangle's own middle, which closes an edge only as far as its normal
// happens to agree with the radial — square edges yes, the cell's diagonal
// almost not at all.

import { test, expect } from '@playwright/test'

import { MAX_STRETCH, OVERLAP, grow, texturedTriangle } from '../src/renderer/src/ui/affine'

type Point = [number, number]

/** The outward normal of the edge A→B of a triangle whose third corner is C. */
const outward = (a: Point, b: Point, c: Point): Point => {
  const ex = b[0] - a[0]
  const ey = b[1] - a[1]
  const length = Math.hypot(ex, ey)
  const n: Point = [-ey / length, ex / length]
  // Away from the third corner is out.
  const inward = n[0] * (c[0] - a[0]) + n[1] * (c[1] - a[1])
  return inward > 0 ? [-n[0], -n[1]] : n
}

/** How far `point` lies along `normal` from `from` — the signed offset. */
const along = (point: Point, from: Point, normal: Point): number =>
  (point[0] - from[0]) * normal[0] + (point[1] - from[1]) * normal[1]

/** Whether a point is inside a triangle, edges counting as inside. */
const inside = (p: Point, t: readonly Point[]): boolean => {
  const side = (a: Point, b: Point): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  const s = [side(t[0], t[1]), side(t[1], t[2]), side(t[2], t[0])]
  return s.every((v) => v >= -1e-9) || s.every((v) => v <= 1e-9)
}

/** A cell of the board, cut the way `battleMap` cuts it: a square, two ways. */
const CELL: Point[] = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20]
]
const LOWER: Point[] = [CELL[0], CELL[1], CELL[2]]
const UPPER: Point[] = [CELL[0], CELL[2], CELL[3]]

test('growing moves EVERY edge out by the same distance, diagonal included', { tag: '@nodata' }, () => {
  const grown = grow(LOWER, 1)
  for (let i = 0; i < 3; i++) {
    const a = LOWER[i]
    const b = LOWER[(i + 1) % 3]
    const c = LOWER[(i + 2) % 3]
    const n = outward(a, b, c)
    // Both ends of the edge stand exactly one unit out along its own normal —
    // which is what "the edge moved out by one" means, and is the whole point
    // of using the bisector rather than the radial.
    expect(along(grown[i], a, n)).toBeCloseTo(1, 9)
    expect(along(grown[(i + 1) % 3], b, n)).toBeCloseTo(1, 9)
  }
})

test('the radial offset it replaced fell short on the DIAGONAL', { tag: '@nodata' }, () => {
  // The old code pushed each corner half a pixel away from the centroid.
  // Measured against the hypotenuse's own normal that buys 0.158 of a pixel
  // for the half asked — under a third of it — where the right-hand edge gets
  // 0.354 at this end. It does not even move an edge: the two ends of one come
  // out at different offsets, so the edge TILTS.
  const mx = (LOWER[0][0] + LOWER[1][0] + LOWER[2][0]) / 3
  const my = (LOWER[0][1] + LOWER[1][1] + LOWER[2][1]) / 3
  const radial = LOWER.map(([x, y]) => {
    const length = Math.hypot(x - mx, y - my)
    return [x + ((x - mx) / length) * 0.5, y + ((y - my) / length) * 0.5] as Point
  })
  const n = outward(LOWER[1], LOWER[2], LOWER[0])
  const hypotenuse = outward(LOWER[2], LOWER[0], LOWER[1])
  expect(along(radial[1], LOWER[1], n)).toBeCloseTo(0.354, 3)
  expect(along(radial[0], LOWER[0], outward(LOWER[0], LOWER[1], LOWER[2]))).toBeCloseTo(0.224, 3)
  expect(along(radial[2], LOWER[2], hypotenuse)).toBeCloseTo(0.158, 3)
  // The bisector gives the asked-for half a pixel on that same edge.
  expect(along(grow(LOWER, 0.5)[2], LOWER[2], hypotenuse)).toBeCloseTo(0.5, 9)
})

test('the two halves of a cell OVERLAP across the diagonal they share', { tag: '@nodata' }, () => {
  const lower = grow(LOWER)
  const upper = grow(UPPER)
  // A point just the far side of the shared diagonal, perpendicular to it, has
  // to be covered by BOTH — an antialiased clip only reaches full coverage a
  // little way inside its own boundary, and a point covered once at a half is
  // the hairline play saw.
  const step = OVERLAP / 2 / Math.SQRT2
  for (const t of [0.25, 0.5, 0.75]) {
    const on: Point = [20 * t, 20 * t]
    expect(inside([on[0] + step, on[1] - step], upper)).toBe(true)
    expect(inside([on[0] - step, on[1] + step], lower)).toBe(true)
  }
})

test('a sliver is clamped instead of running off to infinity', { tag: '@nodata' }, () => {
  // sin(θ/2) goes to zero as a triangle flattens, and 1/sin(θ/2) with it — the
  // board's outermost cells go near-degenerate at some headings.
  const flat: Point[] = [
    [0, 0],
    [20, 0],
    [10, 1e-7]
  ]
  const ceiling = OVERLAP * MAX_STRETCH
  grow(flat).forEach(([x, y], i) => {
    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(y)).toBe(true)
    // The invariant that matters: no corner ever travels further than the
    // clamp, however thin the triangle it belongs to.
    expect(Math.hypot(x - flat[i][0], y - flat[i][1])).toBeLessThanOrEqual(ceiling + 1e-9)
  })

  // Two corners in the SAME place: those two are left alone (there is no edge
  // to take a normal of), and the third takes the clamp rather than an
  // infinity — sin(θ/2) is zero there and the division would not survive it.
  const pinched: Point[] = [
    [5, 5],
    [5, 5],
    [9, 9]
  ]
  const opened = grow(pinched)
  expect(opened[0]).toEqual([5, 5])
  expect(opened[1]).toEqual([5, 5])
  expect(Math.hypot(opened[2][0] - 9, opened[2][1] - 9)).toBeCloseTo(ceiling, 9)
})

test('the matrix carries the SOURCE corners onto the DESTINATION ones', { tag: '@nodata' }, () => {
  let matrix: number[] = []
  const path: string[] = []
  const context = {
    save: () => path.push('save'),
    restore: () => path.push('restore'),
    beginPath: () => path.push('beginPath'),
    moveTo: () => path.push('moveTo'),
    lineTo: () => path.push('lineTo'),
    closePath: () => path.push('closePath'),
    clip: () => path.push('clip'),
    drawImage: () => path.push('drawImage'),
    transform: (...values: number[]) => {
      matrix = values
      path.push('transform')
    }
  } as unknown as CanvasRenderingContext2D

  const source: Point[] = [
    [0.5, 0.5],
    [0.5, 63.5],
    [63.5, 63.5]
  ]
  const dest: Point[] = [
    [110, 400],
    [180, 372],
    [140, 330]
  ]
  texturedTriangle(context, {} as CanvasImageSource, source, dest)

  const [a, b, c, d, e, f] = matrix
  source.forEach(([x, y], i) => {
    expect(a * x + c * y + e).toBeCloseTo(dest[i][0], 6)
    expect(b * x + d * y + f).toBeCloseTo(dest[i][1], 6)
  })
  // Clipped BEFORE the transform, and the whole thing left inside save/restore
  // — the dashboard has its own scaling on the context and must get it back.
  expect(path).toEqual([
    'save',
    'beginPath',
    'moveTo',
    'lineTo',
    'lineTo',
    'closePath',
    'clip',
    'transform',
    'drawImage',
    'restore'
  ])
})

test('a degenerate source draws NOTHING rather than an infinity', { tag: '@nodata' }, () => {
  const path: string[] = []
  const context = {
    save: () => path.push('save'),
    restore: () => path.push('restore'),
    beginPath: () => path.push('beginPath'),
    moveTo: () => path.push('moveTo'),
    lineTo: () => path.push('lineTo'),
    closePath: () => path.push('closePath'),
    clip: () => path.push('clip'),
    drawImage: () => path.push('drawImage'),
    transform: () => path.push('transform')
  } as unknown as CanvasRenderingContext2D
  const flat: Point[] = [
    [0, 0],
    [1, 1],
    [2, 2]
  ]
  texturedTriangle(context, {} as CanvasImageSource, flat, [
    [0, 0],
    [10, 0],
    [0, 10]
  ])
  expect(path).toEqual([])
})
