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

/** What a record hands over when a pig collects it. */
export interface Contents {
  /**
   * Weapon id, or null on a health crate. The ids run 1..70 across the
   * shipped maps, which is the shape of the weapon list `gtext` holds from
   * index 96 (None, Trotter, Knife, Bayonet, …).
   */
  weapon: number | null
  /** Rounds for a weapon; health points for a health crate (20, 50, 100). */
  amount: number
}

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
  /**
   * Which collision shape the object gets, 0..3 — the exe switches on it
   * through a four-entry jump table at 0x4AAFE0, reading it at 0x4a6236
   * alongside the three extents and passing all four to 0x4AA830.
   *
   * - **0, a BOX.** Each extent is halved (`sar eax,1` ×3 at 0x4aa8d7) into
   *   a half-extent vector and handed to 0x4125C0, then the body's mass
   *   properties are set from the same numbers.
   * - **1, NO box.** Only the mass properties (0x405650). The 94 records
   *   that carry it are every bridge and step piece and nothing else, so
   *   those are not obstacles in the collision world at all.
   * - **2 and 3** exist in the table — 2 sets a single float, the shape of
   *   a radius — and no shipped map uses either.
   */
  shape: number
  /** Collision box, full extents in world units. Stored as three counts of
   * 128 in the order (z, y, x) — measured: over 622 models whose x and z
   * extents differ, that order matches the model's own bounding box 272
   * times against 10 for (x, y, z). It is a COLLIDER, not the art: a tree's
   * is its trunk. An unseparated 90° yaw between model and box space would
   * look the same, since extents are unsigned. */
  box: { x: number; y: number; z: number }
  /**
   * Bitfield, both halves decoded.
   *
   * The HIGH byte is the side, one bit each — 0x100 through 0x2000, six of
   * them for the game's six nations, and how the spawn markers divide into
   * squads (lib/game/spawns.ts).
   *
   * The LOW byte is which games the record exists in. The loader
   * (0x4a58cb) drops the object unless bit 5 is set AND the bit for the
   * player count is: it clamps the count to 4, shifts the byte right by
   * count − 1 and tests bit 0. So bits 0..3 are one-, two-, three- and
   * four-player games — see `existsForPlayers`.
   */
  flags: number
  /**
   * What the record hands over, or null for something that hands over
   * nothing.
   *
   * Field 14 is a KIND tag, not a flag — the exe branches on 0, 1, 7, 13
   * and 19 at 0x4a624a, and CAMP alone uses 0, 19, 20, 21, 22 and 23. The
   * value 19 is the one that means "hands something over": 409 of CRATE1's
   * 411, 127 of CRATE2's 129, and a handful of SIGN and PROPOINT besides.
   * Field 15's HIGH byte is then the weapon, 0xFF on the health crates,
   * and field 16 the count.
   *
   * Field 15's LOW byte is NOT padding and is not decoded: CAMP's crates
   * carry 0, 3, 4, 5, 6 and 7 in it, health crates included. Read it off
   * `fields[15]` if it turns out to matter.
   *
   * Contents are also what tells a crate to collect from a crate to walk
   * round: CRATE4 never carries anything, and nor do two CRATE1s and two
   * CRATE2s.
   */
  contents: Contents | null
  /** All 31 s16 fields exactly as stored, for the ones still undecoded. */
  fields: Int16Array
}

const NAME_SIZE = 16
const FIELD_COUNT = 31
export const POG_RECORD_SIZE = NAME_SIZE * 2 + FIELD_COUNT * 2

/** The collision shape kinds field 11 selects (exe jump table 0x4AAFE0). */
export const SHAPE_BOX = 0
/** Mass properties only — no collider. Every bridge and step piece. */
export const SHAPE_NONE = 1

/** Full circle, in the units the game stores angles in. */
const TURN = 4096
/** Field 14's value on every record that carries something. */
const CARRIES = 19
/** The weapon byte's "no weapon, this is health" value. */
const NO_WEAPON = 0xff

/**
 * The stored yaw as a rotation about the vertical: `−yaw − π/2`.
 *
 * Both halves are measured, not read — the derivation is in
 * `../pigs-disasm/objects/notes.md`, and the short of it is CAMP's bridge
 * (only the negated angle turns its two abutments to face each other
 * across the span instead of away) and CAMP's yaw-0 training dummy (only
 * `−π/2` faces it at the path it is shot from, which is the same quarter
 * turn the pig's own art needs).
 *
 * EVERYTHING that turns an object goes through this: the art in
 * `three/props.ts` and the collision box in `lib/game/obstacles.ts`. They
 * were once two expressions of the same rule, and the box spent a while
 * turned differently from the model it belongs to — which reads in play as
 * an invisible wall a stride away from the gate that owns it.
 */
export const modelRotationY = (yaw: number): number => -yaw - Math.PI / 2

const weaponOf = (packed: number): number | null => {
  const weapon = (packed >> 8) & 0xff
  return weapon === NO_WEAPON ? null : weapon
}
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

/** The flags bit that has to be set for a record to be placed at all. */
const PLACED = 0x20
/** The most players the loader distinguishes; it clamps to this. */
export const MOST_PLAYERS = 4

/**
 * Whether a record is in a game of this many players — the loader's own
 * test at 0x4a58cb, and what makes BOOM's ten markers on one side into
 * five: SN_ME snipers for the one-player campaign, GR_ME grunts for
 * everything else, standing on the very same spots.
 */
export function existsForPlayers(object: MapObject, players: number): boolean {
  const low = object.flags & 0xff
  if ((low & PLACED) === 0) return false
  return (low >> (Math.min(players, MOST_PLAYERS) - 1)) % 2 === 1
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
      shape: fields[11],
      box: { x: fields[10] * BOX_UNIT, y: fields[9] * BOX_UNIT, z: fields[8] * BOX_UNIT },
      flags: fields[13],
      contents: fields[14] === CARRIES ? { weapon: weaponOf(fields[15]), amount: fields[16] } : null,
      fields
    })
  }
  return objects
}
