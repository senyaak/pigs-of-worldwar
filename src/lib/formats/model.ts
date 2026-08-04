// VTX/NO2/FAC model reader (docs/formats.md). Pure, like mad.ts.
//
// The three entries of an archive share index spaces: a face corner carries a
// vertex index (into VTX) and a normal index (into NO2) that need not match,
// so the geometry is de-indexed here — every corner becomes its own vertex —
// which is also the layout three.js wants for flat typed arrays.

export interface Model {
  /** De-indexed positions, 3 floats per corner, 3 corners per triangle. */
  positions: Float32Array
  /** De-indexed normals, matching `positions` corner for corner. */
  normals: Float32Array
  /** Per-corner bone index (from VTX), for skinning later. */
  boneIndices: Int16Array
  triangleCount: number
  /** Counts as stored in the file, before quads were split. */
  sourceTriangles: number
  sourceQuads: number
  vertexCount: number
}

const VTX_SIZE = 8
const NO2_SIZE = 16
const FAC_HEADER = 16
const FAC_TRI = 32
const FAC_QUAD = 36

export function parseModel(
  vtx: Uint8Array,
  no2: Uint8Array,
  fac: Uint8Array,
  /** Bind-pose bone offsets (hir.ts). Without them, bone-local vertices pile
   * up around the origin. */
  boneOffsets?: Float32Array
): Model {
  if (vtx.byteLength % VTX_SIZE !== 0) throw new Error(`VTX length ${vtx.byteLength} not divisible by ${VTX_SIZE}`)
  if (no2.byteLength % NO2_SIZE !== 0) throw new Error(`NO2 length ${no2.byteLength} not divisible by ${NO2_SIZE}`)
  const vertexCount = vtx.byteLength / VTX_SIZE
  const normalCount = no2.byteLength / NO2_SIZE
  const vtxView = new DataView(vtx.buffer, vtx.byteOffset, vtx.byteLength)
  const no2View = new DataView(no2.buffer, no2.byteOffset, no2.byteLength)
  const facView = new DataView(fac.buffer, fac.byteOffset, fac.byteLength)

  const sourceTriangles = facView.getUint32(FAC_HEADER, true)
  const trianglesEnd = FAC_HEADER + 4 + sourceTriangles * FAC_TRI
  const sourceQuads = facView.getUint32(trianglesEnd, true)
  const expectedEnd = trianglesEnd + 4 + sourceQuads * FAC_QUAD
  if (expectedEnd !== fac.byteLength) {
    throw new Error(`FAC counts (${sourceTriangles} tris, ${sourceQuads} quads) want ${expectedEnd} bytes, file has ${fac.byteLength}`)
  }

  const triangleCount = sourceTriangles + sourceQuads * 2
  const positions = new Float32Array(triangleCount * 9)
  const normals = new Float32Array(triangleCount * 9)
  const boneIndices = new Int16Array(triangleCount * 3)
  let corner = 0

  const emit = (vertexIndex: number, normalIndex: number): void => {
    if (vertexIndex >= vertexCount) throw new Error(`vertex index ${vertexIndex} out of ${vertexCount}`)
    if (normalIndex >= normalCount) throw new Error(`normal index ${normalIndex} out of ${normalCount}`)
    const vo = vertexIndex * VTX_SIZE
    const bone = vtxView.getInt16(vo + 6, true)
    const bx = boneOffsets && bone >= 0 ? boneOffsets[bone * 3] : 0
    const by = boneOffsets && bone >= 0 ? boneOffsets[bone * 3 + 1] : 0
    const bz = boneOffsets && bone >= 0 ? boneOffsets[bone * 3 + 2] : 0
    positions[corner * 3] = vtxView.getInt16(vo, true) + bx
    positions[corner * 3 + 1] = vtxView.getInt16(vo + 2, true) + by
    positions[corner * 3 + 2] = vtxView.getInt16(vo + 4, true) + bz
    boneIndices[corner] = bone
    const no = normalIndex * NO2_SIZE
    normals[corner * 3] = no2View.getFloat32(no, true)
    normals[corner * 3 + 1] = no2View.getFloat32(no + 4, true)
    normals[corner * 3 + 2] = no2View.getFloat32(no + 8, true)
    corner++
  }

  for (let i = 0; i < sourceTriangles; i++) {
    // 6 bytes of UVs, then 3 u16 vertex indices, then 3 u16 normal indices.
    const o = FAC_HEADER + 4 + i * FAC_TRI + 6
    for (let c = 0; c < 3; c++) emit(facView.getUint16(o + c * 2, true), facView.getUint16(o + 6 + c * 2, true))
  }
  for (let i = 0; i < sourceQuads; i++) {
    // 8 bytes of UVs, then 4 u16 vertex indices, then 4 u16 normal indices.
    const o = trianglesEnd + 4 + i * FAC_QUAD + 8
    const v = [0, 1, 2, 3].map((c) => facView.getUint16(o + c * 2, true))
    const n = [0, 1, 2, 3].map((c) => facView.getUint16(o + 8 + c * 2, true))
    // PSX-style quads are strip-ordered: ABCD → triangles ABC and BDC.
    for (const c of [0, 1, 2, 1, 3, 2]) emit(v[c], n[c])
  }

  return { positions, normals, boneIndices, triangleCount, sourceTriangles, sourceQuads, vertexCount }
}
