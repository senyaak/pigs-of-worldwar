// HIR skeleton reader (docs/formats.md). Pure, like the others.
//
// VTX vertex positions are bone-local: without the skeleton every body part
// piles up around the origin. The bind pose is vertex + accumulated bone
// offset, which is what boneWorldOffsets computes.

export interface Bone {
  parentIndex: number
  x: number
  y: number
  z: number
}

const BONE_SIZE = 20

export function parseHir(data: Uint8Array): Bone[] {
  if (data.byteLength % BONE_SIZE !== 0) {
    throw new Error(`HIR length ${data.byteLength} not divisible by ${BONE_SIZE}`)
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const bones: Bone[] = []
  for (let i = 0; i < data.byteLength / BONE_SIZE; i++) {
    const o = i * BONE_SIZE
    bones.push({
      parentIndex: view.getInt32(o, true),
      x: view.getInt16(o + 4, true),
      y: view.getInt16(o + 6, true),
      z: view.getInt16(o + 8, true)
    })
  }
  return bones
}

/** Accumulated offset of every bone, 3 floats each. Parents come before
 * children in the file (verified: pig.HIR), and the root points at itself. */
export function boneWorldOffsets(bones: Bone[]): Float32Array {
  const offsets = new Float32Array(bones.length * 3)
  bones.forEach((bone, i) => {
    const p = bone.parentIndex * 3
    offsets[i * 3] = bone.x + (i === 0 ? 0 : offsets[p])
    offsets[i * 3 + 1] = bone.y + (i === 0 ? 0 : offsets[p + 1])
    offsets[i * 3 + 2] = bone.z + (i === 0 ? 0 : offsets[p + 2])
  })
  return offsets
}
