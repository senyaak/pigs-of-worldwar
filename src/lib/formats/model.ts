// VTX/NO2/FAC model reader (docs/formats.md). Pure, like mad.ts.
//
// The three entries of an archive share index spaces: a face corner carries a
// vertex index (into VTX) and a normal index (into NO2) that need not match,
// so the geometry is de-indexed here — every corner becomes its own vertex —
// which is also the layout three.js wants for flat typed arrays.
//
// Faces carry a texture index (into the paired .mtd archive, in entry order)
// and per-corner pixel UVs. Triangles are emitted sorted by texture so a
// renderer can bind each texture once over a contiguous range (`groups`).

export interface ModelGroup {
  /** First corner of the range (3 corners per triangle). */
  start: number
  /** Corners in the range. */
  count: number
  /** Index into the paired .mtd's entries. */
  texture: number
}

export interface Model {
  /** De-indexed positions, 3 floats per corner, 3 corners per triangle. */
  positions: Float32Array
  /** De-indexed normals, matching `positions` corner for corner. */
  normals: Float32Array
  /** Per-corner UVs in texture PIXELS (u8 in the file) — normalize against
   * the referenced texture's size. */
  uvs: Float32Array
  /** Per-corner bone index (from VTX), for skinning later. */
  boneIndices: Int16Array
  /** Contiguous same-texture ranges, ascending by texture index. */
  groups: ModelGroup[]
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

interface Corner {
  vertex: number
  normal: number
  u: number
  v: number
}

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

  // Corner orders are empirical (docs/formats.md): faces are stored reversed
  // relative to their NO2 normals (ACB agrees for 516/536 of pcace_hi's lone
  // triangles), and quad corners are PERIMETER-ordered ABCD — the split must
  // share the AC diagonal (ACB + ADC). A strip-style split shares a perimeter
  // edge instead: the halves overlap and leave notch-shaped holes on every
  // curved surface. Windings agree with NO2 in the game's own Y-down space;
  // the viewer mirrors Y and reverses winding again.
  const triangles: { texture: number; corners: Corner[] }[] = []

  for (let i = 0; i < sourceTriangles; i++) {
    const base = FAC_HEADER + 4 + i * FAC_TRI
    const texture = facView.getUint32(base + 20, true)
    const pick = (c: number): Corner => ({
      vertex: facView.getUint16(base + 6 + c * 2, true),
      normal: facView.getUint16(base + 12 + c * 2, true),
      u: fac[base + c * 2],
      v: fac[base + c * 2 + 1]
    })
    triangles.push({ texture, corners: [0, 2, 1].map(pick) })
  }
  for (let i = 0; i < sourceQuads; i++) {
    const base = trianglesEnd + 4 + i * FAC_QUAD
    const texture = facView.getUint32(base + 24, true)
    const pick = (c: number): Corner => ({
      vertex: facView.getUint16(base + 8 + c * 2, true),
      normal: facView.getUint16(base + 16 + c * 2, true),
      u: fac[base + c * 2],
      v: fac[base + c * 2 + 1]
    })
    triangles.push({ texture, corners: [0, 2, 1].map(pick) })
    triangles.push({ texture, corners: [0, 3, 2].map(pick) })
  }

  // Sort by texture (stable) so each texture binds over one contiguous range.
  triangles.sort((a, b) => a.texture - b.texture)

  const triangleCount = triangles.length
  const positions = new Float32Array(triangleCount * 9)
  const normals = new Float32Array(triangleCount * 9)
  const uvs = new Float32Array(triangleCount * 6)
  const boneIndices = new Int16Array(triangleCount * 3)
  const groups: ModelGroup[] = []
  let out = 0

  for (const triangle of triangles) {
    const last = groups[groups.length - 1]
    if (last && last.texture === triangle.texture) last.count += 3
    else groups.push({ start: out, count: 3, texture: triangle.texture })
    for (const { vertex, normal, u, v } of triangle.corners) {
      if (vertex >= vertexCount) throw new Error(`vertex index ${vertex} out of ${vertexCount}`)
      if (normal >= normalCount) throw new Error(`normal index ${normal} out of ${normalCount}`)
      const vo = vertex * VTX_SIZE
      const bone = vtxView.getInt16(vo + 6, true)
      const bx = boneOffsets && bone >= 0 ? boneOffsets[bone * 3] : 0
      const by = boneOffsets && bone >= 0 ? boneOffsets[bone * 3 + 1] : 0
      const bz = boneOffsets && bone >= 0 ? boneOffsets[bone * 3 + 2] : 0
      positions[out * 3] = vtxView.getInt16(vo, true) + bx
      positions[out * 3 + 1] = vtxView.getInt16(vo + 2, true) + by
      positions[out * 3 + 2] = vtxView.getInt16(vo + 4, true) + bz
      boneIndices[out] = bone
      const no = normal * NO2_SIZE
      normals[out * 3] = no2View.getFloat32(no, true)
      normals[out * 3 + 1] = no2View.getFloat32(no + 4, true)
      normals[out * 3 + 2] = no2View.getFloat32(no + 8, true)
      uvs[out * 2] = u
      uvs[out * 2 + 1] = v
      out++
    }
  }

  return { positions, normals, uvs, boneIndices, groups, triangleCount, sourceTriangles, sourceQuads, vertexCount }
}
