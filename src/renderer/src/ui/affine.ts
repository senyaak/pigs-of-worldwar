// Drawing a PERSPECTIVE picture with a context that only does AFFINE.
//
// Canvas 2D has no perspective transform, so a quad in perspective is cut into
// cells and each cell laid down affinely — which is what `_d3d.dll` does with
// the scanner's board too, for the same reason and at 2×2. This is the piece
// that lays one triangle down, and the piece that keeps two neighbours from
// leaving a hairline between them.
//
// Pure geometry and one blit: no game, no assets, no state.

/**
 * One triangle of a picture, mapped affinely onto one triangle of the screen:
 * clip to the destination, then compose the transform that carries the three
 * source corners onto the three destination ones.
 *
 * `transform` rather than `setTransform`, because the caller has usually
 * scaled the context to the window already.
 */
export function texturedTriangle(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  source: readonly [number, number][],
  dest: readonly [number, number][]
): void {
  const [[sx0, sy0], [sx1, sy1], [sx2, sy2]] = source
  const [[dx0, dy0], [dx1, dy1], [dx2, dy2]] = dest
  const denom = sx0 * (sy2 - sy1) - sx1 * sy2 + sx2 * sy1 + (sx1 - sx2) * sy0
  if (denom === 0) return
  const a = -(sy0 * (dx2 - dx1) - sy1 * dx2 + sy2 * dx1 + (sy1 - sy2) * dx0) / denom
  const b = (sy1 * dy2 + sy0 * (dy1 - dy2) - sy2 * dy1 + (sy2 - sy1) * dy0) / denom
  const c = (sx0 * (dx2 - dx1) - sx1 * dx2 + sx2 * dx1 + (sx1 - sx2) * dx0) / denom
  const d = -(sx1 * dy2 + sx0 * (dy1 - dy2) - sx2 * dy1 + (sx2 - sx1) * dy0) / denom
  const e =
    (sx0 * (sy2 * dx1 - sy1 * dx2) + sy0 * (sx1 * dx2 - sx2 * dx1) + (sx2 * sy1 - sx1 * sy2) * dx0) / denom
  const f =
    (sx0 * (sy2 * dy1 - sy1 * dy2) + sy0 * (sx1 * dy2 - sx2 * dy1) + (sx2 * sy1 - sx1 * sy2) * dy0) / denom

  context.save()
  context.beginPath()
  context.moveTo(dx0, dy0)
  context.lineTo(dx1, dy1)
  context.lineTo(dx2, dy2)
  context.closePath()
  context.clip()
  context.transform(a, b, c, d, e, f)
  context.drawImage(image, 0, 0)
  context.restore()
}

/**
 * How far a grown triangle's every EDGE stands outside where it was, in
 * pixels, so that two neighbours overlap instead of leaving a hairline.
 *
 * Half a pixel is what the arithmetic asks for: canvas ANTIALIASES a `clip`,
 * so a boundary is a ramp about a pixel wide, and growing both sides by half a
 * pixel puts every point of the true seam under the full end of one ramp or
 * the other. Three quarters is that, plus room for the rounding the browser
 * does at the ends of it. The cost of overlapping is a fraction of a texel of
 * the neighbour's own picture, drawn where the two agree anyway.
 */
export const OVERLAP = 0.75

/**
 * How far a corner may travel, as a multiple of `OVERLAP`. The offset goes as
 * `1 / sin(θ/2)`, so a sliver's corner runs away to infinity; nothing that thin
 * has a seam worth seeing.
 */
export const MAX_STRETCH = 8

/**
 * Grow a triangle so that every EDGE of it stands `OVERLAP` pixels outside
 * where it was — which is what closes a seam, and is NOT the same thing as
 * pushing the corners away from the middle.
 *
 * Pushing them from the middle is what this used to do, and it is why white
 * hairlines showed along one family of lines and not the others: on a square
 * cell's diagonal a corner's outward radial stands 71° off that edge's normal,
 * so half a pixel of travel bought 0.16 of a pixel of cover and two thirds of
 * the seam stayed open — while the cell's two square edges, whose normals the
 * radial nearly agrees with, closed properly.
 *
 * The honest offset is the corner's own BISECTOR: moving it `d / sin(θ/2)`
 * along the outward bisector puts BOTH the edges meeting there exactly `d`
 * out, whatever the angle between them is.
 */
export function grow(
  dest: readonly [number, number][],
  distance: number = OVERLAP
): [number, number][] {
  return dest.map(([ax, ay], i) => {
    const [bx, by] = dest[(i + 1) % 3]
    const [cx, cy] = dest[(i + 2) % 3]
    const toB = Math.hypot(bx - ax, by - ay)
    const toC = Math.hypot(cx - ax, cy - ay)
    if (toB === 0 || toC === 0) return [ax, ay] as [number, number]
    // The two edges as they leave this corner. Both point at another corner,
    // so their sum points INTO the triangle whichever way it is wound — and
    // the corner travels against it.
    const ux = (bx - ax) / toB
    const uy = (by - ay) / toB
    const vx = (cx - ax) / toC
    const vy = (cy - ay) / toC
    const half = Math.sqrt(Math.max(0, (1 - (ux * vx + uy * vy)) / 2))
    const wx = ux + vx
    const wy = uy + vy
    const w = Math.hypot(wx, wy)
    if (w === 0 || half === 0) return [ax, ay] as [number, number]
    const travel = Math.min(distance / half, distance * MAX_STRETCH)
    return [ax - (wx / w) * travel, ay - (wy / w) * travel] as [number, number]
  })
}
