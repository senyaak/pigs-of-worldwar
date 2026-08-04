// MCAP motion-capture reader (docs/formats.md). Pure, like the others.
//
// A clip is a sequence of 272-byte keyframes: an unknown u16, then s8 xyz
// positions for the 10 non-leaf bones, then per-bone rotations for all 15.
// how-doc calls the rotations quaternions, but on real data the fourth float
// of every bone is exactly 1.0 while the first three range over ±π — they are
// EULER ANGLES in radians plus a constant (found here, docs/formats.md).
// Frames are flattened into one typed array per kind so a clip crosses the
// IPC boundary as three buffers, not thousands of tiny arrays.

export const KEYFRAME_SIZE = 272
export const BONE_COUNT = 15
export const BRANCH_BONE_COUNT = 10

export interface McapClip {
  frameCount: number
  /** frameCount × 15 × 3 floats: per-bone euler angles, radians. */
  rotations: Float32Array
  /** frameCount × 10 × 3 signed bytes as floats. */
  positions: Float32Array
  /** One unknown u16 per frame. */
  unknowns: Uint16Array
}

export function parseMcapClip(data: Uint8Array): McapClip {
  if (data.byteLength === 0 || data.byteLength % KEYFRAME_SIZE !== 0) {
    throw new Error(`MCAP length ${data.byteLength} not divisible by ${KEYFRAME_SIZE}`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const frameCount = data.byteLength / KEYFRAME_SIZE
  const rotations = new Float32Array(frameCount * BONE_COUNT * 3)
  const positions = new Float32Array(frameCount * BRANCH_BONE_COUNT * 3)
  const unknowns = new Uint16Array(frameCount)

  for (let frame = 0; frame < frameCount; frame++) {
    const base = frame * KEYFRAME_SIZE
    unknowns[frame] = view.getUint16(base, true)
    for (let bone = 0; bone < BRANCH_BONE_COUNT; bone++) {
      for (let axis = 0; axis < 3; axis++) {
        positions[(frame * BRANCH_BONE_COUNT + bone) * 3 + axis] = view.getInt8(base + 2 + bone * 3 + axis)
      }
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
  return { frameCount, rotations, positions, unknowns }
}
