// WHICH ROW the pointer is over, on any screen that draws its own canvas.
//
// The mouse is the remake's own convenience — the original is keyboard and pad
// and even ships `nomouse.com` — and it behaves the same way everywhere it is
// offered: hovering LIGHTS a row, clicking chooses the lit one. The lighting
// is not a jump. A screen walks its selection toward `hovered()` one row a
// tick, so the cog, the needle and the lamp all animate exactly as they do
// under the keyboard; dragging down a column reads as several turns rather
// than as one snap.
//
// This is the geometry half, and it is here because three screens needed the
// same twenty lines: the un-letterboxing (a canvas laid out with
// `object-fit: contain` is centred inside a box of another shape, so a client
// coordinate is not a canvas one) and the hit test over whatever rectangles
// the screen hands in. A screen that wants the mouse writes its rows — from
// the layout it is already drawing with, offsets and all — and nothing else.
//
// The rectangles are asked for FRESH on every event, because they move: every
// one of these screens rides an entrance, and a click during it has to hit the
// row the player is looking at rather than the one at rest.

/** One row's box, in the canvas's own authored pixels. */
export interface RowBox {
  x: number
  y: number
  width: number
  height: number
}

export interface MouseRows {
  /** The row the pointer rests on, or −1 — what a screen walks its light
   * toward. */
  hovered(): number
  /** Forget it: the light has caught up, or the screen has left. */
  clear(): void
}

/**
 * Watch `canvas` for a pointer over any of `rows`, and call `onClick` with the
 * row a click landed on (−1 for a click on none of them, which a screen is
 * free to ignore).
 */
export function trackRows(
  canvas: HTMLCanvasElement,
  rows: () => readonly RowBox[],
  onClick: (row: number) => void
): MouseRows {
  let hovered = -1

  const rowUnder = (event: MouseEvent): number => {
    const box = canvas.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return -1
    // `object-fit: contain` scales the canvas to fit and centres what is left
    // over, so both bars have to come off before the scale does.
    const scale = Math.min(box.width / canvas.width, box.height / canvas.height)
    const x = (event.clientX - box.left - (box.width - canvas.width * scale) / 2) / scale
    const y = (event.clientY - box.top - (box.height - canvas.height * scale) / 2) / scale
    const boxes = rows()
    for (let i = 0; i < boxes.length; i++) {
      const row = boxes[i]
      if (x >= row.x && x < row.x + row.width && y >= row.y && y < row.y + row.height) return i
    }
    return -1
  }

  canvas.addEventListener('mousemove', (event) => {
    hovered = rowUnder(event)
  })
  canvas.addEventListener('mouseleave', () => {
    hovered = -1
  })
  canvas.addEventListener('click', (event) => {
    onClick(rowUnder(event))
  })

  return {
    hovered: () => hovered,
    clear() {
      hovered = -1
    }
  }
}
