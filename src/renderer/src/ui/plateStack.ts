// Where the name plates go so that none sits on another.
//
// Pure arithmetic over screen rectangles — the HUD measures the text and
// draws; this only decides the `top` of each block. Kept apart from the HUD
// because it holds a loop, and a loop that can spin is not something to bury
// in a 1000-line draw: the 2026-09-05 freeze on TRENCH (docs/history/turns.md)
// was a renderer thread that never came back, and a plate whose screen
// position was NaN — every comparison false, so never "apart" — is exactly
// the kind of input that made the old in-place loop run for ever.

export interface PlateBlock {
  /** Screen x of the anchor, the plate's centre line. */
  x: number
  top: number
  left: number
  width: number
  height: number
}

/**
 * Stack `blocks` so that no two overlap, moving a later block UP over any
 * earlier one it lands on; `gap` is the breathing room between them.
 *
 * Blocks are taken top-to-bottom, so a pig lower on the screen climbs over
 * the plates above it and never the other way. Every move is upward, so
 * each block needs at most one move per block already placed — the loop is
 * bounded by that, and anything that is not finite is left out rather than
 * argued with: a plate off the number line has nowhere to be drawn anyway.
 */
export function stackPlates<T extends PlateBlock>(blocks: T[], gap: number): T[] {
  const sane = blocks.filter(
    (block) =>
      Number.isFinite(block.top) &&
      Number.isFinite(block.left) &&
      Number.isFinite(block.width) &&
      Number.isFinite(block.height)
  )
  sane.sort((a, b) => a.top - b.top)
  const placed: T[] = []
  for (const block of sane) {
    let moves = 0
    let bumped = true
    while (bumped && moves <= placed.length) {
      bumped = false
      for (const other of placed) {
        const apart =
          block.left >= other.left + other.width ||
          other.left >= block.left + block.width ||
          block.top >= other.top + other.height + gap ||
          other.top >= block.top + block.height + gap
        if (!apart) {
          block.top = other.top - block.height - gap
          bumped = true
          moves++
        }
      }
    }
    placed.push(block)
  }
  return placed
}
