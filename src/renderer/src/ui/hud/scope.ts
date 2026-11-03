// THE SCOPE: the rifle's ring, its black surround and its mark over the whole
// screen, under everything else on the dashboard.

import type { DashFrame, HudCore } from './frame'
import { AUTHORED_HEIGHT, LAYOUT } from './layout'

// THE SCOPE, under everything else on the dashboard — the clock and the
// dial sit on top of it, as they do in the original.
//
// `sights` is ONE QUADRANT: 32x32, its outer corner solid rgb(8,8,8)
// and its inside transparent (sampled out of the TIM itself), so four
// mirrored copies cut a round hole and the rest of the screen is the
// same near-black. `target` is the mark in the middle. Which piece is
// which is PLAY's — the archive says nothing about it.
export const drawScope = (core: HudCore, frame: DashFrame): void => {
  const { context, scale, viewWidth, state, art } = frame
  const { scope: SCOPE } = LAYOUT
  if (state.scope) {
    const half = SCOPE.size / 2
    const over = SCOPE.overlap
    const cx = viewWidth / 2
    const cy = AUTHORED_HEIGHT / 2
    context.save()
    context.scale(scale, scale)
    const corner = art.get('sights')
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1]
    ]) {
      context.save()
      context.translate(cx, cy)
      context.scale(sx, sy)
      // Each copy is drawn into its own quadrant with the art's outer
      // corner AT the outer corner, so the arc meets its neighbours — and
      // a pixel PAST the centre lines, so the meeting leaves no seam.
      context.drawImage(corner.image, -half, -half, half + over, half + over)
      context.restore()
    }
    // …and everything past the four of them is that same near-black,
    // started a pixel inside their outer edge for the same reason. The
    // pixel it covers is the art's own solid corner, so nothing is lost.
    context.fillStyle = SCOPE.surround
    context.fillRect(0, 0, viewWidth, cy - half + over)
    context.fillRect(0, cy + half - over, viewWidth, AUTHORED_HEIGHT - (cy + half - over))
    context.fillRect(0, cy - half, cx - half + over, SCOPE.size)
    context.fillRect(cx + half - over, cy - half, viewWidth - (cx + half - over), SCOPE.size)
    // The mark sits in the MIDDLE, because the camera looks along the aim and
    // the tremor is in the aim: the world moves under a still crosshair, which
    // is the only arrangement in which the crosshair tells the truth
    // (lib/game/wobble.ts).
    const mark = art.get('target')
    context.drawImage(mark.image, cx - mark.width / 2, cy - mark.height / 2)
    context.restore()
  }
}
