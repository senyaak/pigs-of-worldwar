// POG object placement reader (docs/formats.md). Pure, like the rest of
// src/lib/formats: it takes bytes.
//
// A map's `<NAME>.POG` lists everything standing ON the ground — trees,
// crates, bridges, pillboxes, the training ground's dummies — plus the pig
// spawn markers. Layout, verified across all 61 shipped files: a u16 count,
// `count` records of 94 bytes, then a trailing u16 that is 0 everywhere
// (GENMUD alone carries a 1 and six bytes of an unused second section).
//
// A record is two 16-byte NUL-padded names followed by 31 s16 fields. The
// first name is the model's base name in the map's own `<NAME>.MAD`, so a
// record and its geometry are paired by NAME rather than by any index. The
// second name is "NULL" in all 6322 shipped records.
//
// The `*_ME` names are the exception that proves the pairing: they are the
// only ones with no model in the map archive (631 GR_ME, 62 HV_ME, …), and
// their `type` runs 0..16 — the pig CLASS list. They are spawn markers, and
// the pig model comes from Chars/ as it always did.

/** A placed object, one POG record. */
export interface MapObject {
  /** Base name of the model in the map's .MAD (no extension). */
  name: string
  /** The record's own 1-based place in the file. */
  id: number
  /** Object type. On a `*_ME` spawn marker this is the pig class. */
  type: number
  /** World x, the game's own convention. */
  x: number
  /** ELEVATION, up-positive — the same space the PMG's heights are in, so
   * an engine working in the game's Y-down world negates it. It is the
   * model's ORIGIN, not its feet: every type sits a fixed amount above the
   * ground (a TREEG by 352, a CRATE1 by 96), which is that model's own
   * centre. */
  y: number
  /** World z, already NEGATED out of the file's convention — POG counts z
   * down where the game counts it up, exactly like the PMG's block offsets
   * (docs/formats.md). Measured, not read: of the eight sign-and-swap
   * combinations this is the one that puts objects on the ground. */
  z: number
  /** Yaw about the vertical, radians, from the file's 4096ths of a turn. */
  yaw: number
  /** The other two stored angles, radians. Both are ~0 on every shipped
   * object — pitch is 0 or 4095 (a 4096th short of a full turn) and roll is
   * 0 everywhere — so nothing yet says which axis is which. */
  pitch: number
  roll: number
  /** Collision box, full extents in world units. Stored as three counts of
   * 128 in the order (z, y, x) — measured: over 622 models whose x and z
   * extents differ, that order matches the model's own bounding box 272
   * times against 10 for (x, y, z). It is a COLLIDER, not the art: a tree's
   * is its trunk. An unseparated 90° yaw between model and box space would
   * look the same, since extents are unsigned. */
  box: { x: number; y: number; z: number }
  /** Bitfield, low 6 bits always set. Undecoded. */
  flags: number
  /** All 31 s16 fields exactly as stored, for the ones still undecoded. */
  fields: Int16Array
}

const NAME_SIZE = 16
const FIELD_COUNT = 31
export const POG_RECORD_SIZE = NAME_SIZE * 2 + FIELD_COUNT * 2

/** Full circle, in the units the game stores angles in. */
const TURN = 4096
/** Collision box extents are counts of this. */
const BOX_UNIT = 128

const readName = (data: Uint8Array, offset: number): string => {
  let name = ''
  for (let i = 0; i < NAME_SIZE; i++) {
    const byte = data[offset + i]
    if (byte === 0) break
    name += String.fromCharCode(byte)
  }
  return name
}

export function parsePog(data: Uint8Array): MapObject[] {
  if (data.byteLength < 2) throw new Error(`POG is ${data.byteLength} bytes, too short for a count`)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const count = view.getUint16(0, true)
  const end = 2 + count * POG_RECORD_SIZE
  if (end > data.byteLength) {
    throw new Error(`POG says ${count} objects (${end} bytes), file has ${data.byteLength}`)
  }

  const objects: MapObject[] = []
  for (let i = 0; i < count; i++) {
    const base = 2 + i * POG_RECORD_SIZE
    const fields = new Int16Array(FIELD_COUNT)
    for (let f = 0; f < FIELD_COUNT; f++) fields[f] = view.getInt16(base + NAME_SIZE * 2 + f * 2, true)
    const angle = (units: number): number => (units / TURN) * Math.PI * 2
    objects.push({
      name: readName(data, base),
      id: fields[3],
      type: fields[7],
      x: fields[0],
      y: fields[1],
      z: -fields[2],
      pitch: angle(fields[4]),
      yaw: angle(fields[5]),
      roll: angle(fields[6]),
      box: { x: fields[10] * BOX_UNIT, y: fields[9] * BOX_UNIT, z: fields[8] * BOX_UNIT },
      flags: fields[13],
      fields
    })
  }
  return objects
}
