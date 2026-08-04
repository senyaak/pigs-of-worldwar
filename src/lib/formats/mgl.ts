// MGL decompressor (frontend images, FEBmps/FEBMP.MAD). Pure, like the
// others. The format was reverse-engineered from the game's own decompressor
// (warhogs_.exe @ 0x97dd0) — full derivation in pigs-disasm/mgl/notes.md;
// grammar table in docs/formats.md. Output is an ordinary 8-bit BMP.

export function decodeMgl(src: Uint8Array): Uint8Array {
  // Worst case the stream is all literals; matches only grow that. Start
  // with a generous guess and grow on demand.
  let out = new Uint8Array(Math.max(src.length * 4, 1 << 16))
  let oi = 0
  let ci = 0

  const ensure = (extra: number): void => {
    if (oi + extra <= out.length) return
    const grown = new Uint8Array(Math.max(out.length * 2, oi + extra))
    grown.set(out)
    out = grown
  }

  while (ci < src.length) {
    const c = src[ci++]
    if (c === 0) break
    if (c < 0x40) {
      ensure(c)
      out.set(src.subarray(ci, ci + c), oi)
      ci += c
      oi += c
    } else if (c < 0x50) {
      const n = (c & 0xf) + 3
      ensure(n)
      const delta = out[oi - 1] - out[oi - 2]
      for (let i = 0; i < n; i++) {
        out[oi] = (out[oi - 1] + delta) & 0xff
        oi++
      }
    } else if (c < 0x60) {
      const n = (c & 0xf) + 2
      ensure(n * 2)
      const delta = (out[oi - 2] | (out[oi - 1] << 8)) - (out[oi - 4] | (out[oi - 3] << 8))
      for (let i = 0; i < n; i++) {
        const value = ((out[oi - 2] | (out[oi - 1] << 8)) + delta) & 0xffff
        out[oi++] = value & 0xff
        out[oi++] = value >> 8
      }
    } else if (c < 0x70) {
      const n = (c & 0xf) + 3
      ensure(n)
      out.fill(out[oi - 1], oi, oi + n)
      oi += n
    } else if (c < 0x80) {
      const n = (c & 0xf) + 2
      ensure(n * 2)
      const lo = out[oi - 2]
      const hi = out[oi - 1]
      for (let i = 0; i < n; i++) {
        out[oi++] = lo
        out[oi++] = hi
      }
    } else {
      let len: number
      let back: number
      if (c < 0xc0) {
        len = 3
        back = (c & 0x3f) + 3
      } else if (c < 0xe0) {
        back = (((c & 3) << 8) | src[ci++]) + 3
        len = ((c >> 2) & 7) + 4
      } else {
        back = (((c & 0x1f) << 8) | src[ci++]) + 3
        len = src[ci++] + 5
      }
      ensure(len)
      // Byte-by-byte so overlapping matches replicate, as in the original.
      for (let i = 0; i < len; i++) {
        out[oi] = out[oi - back]
        oi++
      }
    }
  }
  return out.subarray(0, oi)
}
