// PTG ground-texture reader (docs/formats.md). Pure, like the others.
//
// A u32 count, then that many TIM images of equal size —
// (fileSize - 4) / count bytes each (verified: ARCHI.PTG, 238 × 576 bytes).

import { parseTim } from './tim'
import type { Tim } from './tim'

export function parsePtg(data: Uint8Array): Tim[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const count = view.getUint32(0, true)
  if (count === 0) return []
  const body = data.byteLength - 4
  if (body % count !== 0) {
    throw new Error(`PTG body ${body} not divisible by texture count ${count}`)
  }
  const size = body / count
  const textures: Tim[] = []
  for (let i = 0; i < count; i++) {
    textures.push(parseTim(data.subarray(4 + i * size, 4 + (i + 1) * size)))
  }
  return textures
}
