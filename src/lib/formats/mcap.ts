// MCAP motion-capture reader (docs/formats.md). Pure, like the others.
//
// A clip is a sequence of 272-byte keyframes: a 32-byte HEAD and then per-bone
// rotations for all 15. how-doc calls the rotations quaternions, but on real
// data the fourth float of every bone is exactly 1.0 while the first three
// range over ±π — they are EULER ANGLES in radians plus a constant (found here,
// docs/formats.md).
//
// **The HEAD is two vec3s of int32, and how-doc had it as an u16 plus ten s8
// triples.** The library settles it: its pose builder reads dwords at +0x00,
// +0x04, +0x08 and at +0x10, +0x14, +0x18, interpolates each between the two
// keyframes as an INTEGER and converts with an ftol (`_d3d.dll` 0x1001228f
// onward) — two 16-byte slots with three live components each and the fourth
// padding, which is also why the bones start at +0x20. Read as s8s the same
// bytes come out as (−100, −1, −1) and mean nothing; read as dwords the first
// slot is a clean (0, −100, 2) that MOVES with the gait.
//
// Frames are flattened into one typed array per kind so a clip crosses the IPC
// boundary as two buffers rather than thousands of tiny arrays.

export const KEYFRAME_SIZE = 272
export const BONE_COUNT = 15

export interface McapClip {
  frameCount: number
  /** frameCount × 15 × 3 floats: per-bone euler angles, radians. */
  rotations: Float32Array
  /**
   * frameCount × 3: the keyframe head's FIRST vec3, in model units — the
   * animator's own offset of the whole body, and the only part of the head the
   * shipped clips use.
   *
   * On every clip x is 0 and z is a constant; y is the live one, and in the run
   * cycle it swings 21 units over the stride — the body's BOB. The head's second
   * vec3 (+0x10) is all zeros in every one of the 93 shipped clips, so it is not
   * carried: nothing could be read off it.
   */
  roots: Float32Array
}

export function parseMcapClip(data: Uint8Array): McapClip {
  if (data.byteLength === 0 || data.byteLength % KEYFRAME_SIZE !== 0) {
    throw new Error(`MCAP length ${data.byteLength} not divisible by ${KEYFRAME_SIZE}`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const frameCount = data.byteLength / KEYFRAME_SIZE
  const rotations = new Float32Array(frameCount * BONE_COUNT * 3)
  const roots = new Float32Array(frameCount * 3)

  for (let frame = 0; frame < frameCount; frame++) {
    const base = frame * KEYFRAME_SIZE
    for (let axis = 0; axis < 3; axis++) {
      roots[frame * 3 + axis] = view.getInt32(base + axis * 4, true)
    }
    for (let bone = 0; bone < BONE_COUNT; bone++) {
      // 4 floats per bone in the file; the constant fourth is skipped.
      for (let component = 0; component < 3; component++) {
        rotations[(frame * BONE_COUNT + bone) * 3 + component] = view.getFloat32(
          base + 32 + (bone * 4 + component) * 4,
          true
        )
      }
    }
  }
  return { frameCount, rotations, roots }
}
