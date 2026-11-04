// Where every record and every model on the proving ground comes from.
//
// The proving ground is the remake's own map (docs/facts/proving-ground.md),
// but nothing ON it is invented: each record it places is a COPY of a shipped
// record of the same model, and each model is drawn out of the shipped archive
// that carries it. This file is the measurement, written down once so that the
// builder is pure and reads no file.
//
// Measured 2026-11-02 over the installed game with the repo's own readers
// (`parsePog`, `fielded` at one player, `TerrainQuery.height` under the
// record): every source below exists in a one-player game.
//
// Pure data.

/** The fields of a POG record a copy takes over unchanged — everything but
 * where it stands and what it is called (lib/formats/pog.ts). */
export interface SourceRecord {
  /** The model's name, which is also what pairs it with its art. */
  name: string
  /** The shipped map the record was copied from, and its id there. */
  map: string
  id: number
  /**
   * All 31 fields exactly as that map stores them. Fields 0..3 (x, y, z, id)
   * and 5 (yaw) are overwritten by the proving ground; the rest — type, the
   * collision shape and box, the health field, the flags, the kind tag and
   * its operands — come along.
   */
  fields: readonly number[]
  /**
   * How far the record's stored y stands above the ground under it, in the
   * PMG's own height units: the stored y is the model's CENTRE, not its feet
   * (`objects/notes.md` § y is an elevation). Measured off this very record,
   * so a copy stands on its own ground the way the source stood on its.
   */
  rise: number
}

/** CAMP's record 7 — the training ground's first crate (the bayonet), the
 * one CRATE1 that carries no wait label and so stands from the first frame. */
export const CRATE_SOURCE: SourceRecord = {
  name: 'CRATE1',
  map: 'CAMP',
  id: 7,
  fields: [-4352, 1440, -8448, 7, 0, 1584, 0, 67, 4, 3, 3, 0, 0, 319, 19, 768, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rise: 96
}

/** CAMP's record 54, the SIGN by the training ground's first path. */
export const SIGN_SOURCE: SourceRecord = {
  name: 'SIGN',
  map: 'CAMP',
  id: 54,
  fields: [-5120, 1536, 4096, 54, 0, 0, 0, 382, 4, 8, 1, 0, 255, 319, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  rise: 64
}

/**
 * CAMP's record 3, the training ground's one grunt marker: side bit 0x100,
 * the scripted bit in field 28, and the parachute bit (0x40) in the flags'
 * low byte — which the proving ground takes OUT, because nothing on it drops
 * in (lib/game/provingGround.ts).
 */
export const MARKER_SOURCE: SourceRecord = {
  name: 'GR_ME',
  map: 'CAMP',
  id: 3,
  fields: [-11392, 1510, -5952, 3, 0, 3184, 0, 0, 5, 5, 5, 0, 255, 383, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0],
  rise: 150
}

/**
 * The vehicles and the emplacements. OASIS's records 9..11 and both of
 * SNAKE's CARRYs carry opcode 14 in field 14 (`objects/vehicles.md`), and the
 * three GENMUD records carry opcode 13 (`script/notes.md`, 0x4aa4c8 — a health
 * crate when the thing is wrecked); the copy strips the command, so TANK is
 * taken from OASIS's record 12, which carries none.
 */
export const MOUNT_SOURCES: readonly SourceRecord[] = [
  {
    name: 'TANK',
    map: 'OASIS',
    id: 12,
    fields: [6208, 1344, 9472, 12, 0, 2896, 0, 148, 6, 6, 10, 0, 255, 319, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    rise: 192
  },
  {
    name: 'AM_TANK',
    map: 'GENMUD',
    id: 7,
    fields: [-4480, 1399, 3968, 7, 0, 2368, 0, 134, 6, 6, 11, 0, 25, 319, 13, -246, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0],
    rise: 183
  },
  {
    name: 'CARRY',
    map: 'SNAKE',
    id: 20,
    fields: [-9984, 320, -7296, 20, 0, 2736, 0, 155, 8, 6, 12, 0, 255, 319, 14, 258, 0, 0, 0, 0, 0, 0, 0, 0, 0, -215, 320, 214, 16, 0, 0],
    rise: 192
  },
  {
    name: 'AMLAUNCH',
    map: 'BAY',
    id: 16,
    fields: [8448, 480, 8448, 16, 0, 3008, 0, 136, 6, 6, 12, 0, 255, 319, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    rise: 192
  },
  {
    name: 'PILLBOX',
    map: 'GENMUD',
    id: 5,
    fields: [8832, 1395, 2752, 5, 0, 1600, 0, 72, 14, 7, 14, 0, 25, 319, 13, -246, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0],
    rise: 203
  },
  {
    name: 'BIG_GUN',
    map: 'GENMUD',
    id: 4,
    fields: [6016, 1931, 6784, 4, 0, 448, 0, 75, 15, 16, 17, 0, 25, 319, 13, -246, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0],
    rise: 507
  }
]

/**
 * The fields a record's SCRIPT COMMAND is built from — field 14 the opcode,
 * 15 and 16 its operands, 25 and 27 a tile column and row (`script/notes.md`,
 * the loader at 0x4a6287). A copy that must not bring a command along clears
 * these. Field 26, between the two coordinates, is not read by the loader
 * and has no read meaning, so it is copied like every other unread field.
 */
export const COMMAND_FIELDS = [14, 15, 16, 25, 27] as const

/**
 * Which archive draws which model. Texture indices are PER ARCHIVE — a face
 * group indexes its own archive's `.mtd` (three/modelMesh.ts) — so each model
 * keeps the textures of the archive it was read out of.
 *
 * Measured over every `Maps/*.MAD`: CRATE1 and SIGN are in CAMP's, and so is
 * everything the engine spawns (`SPAWNED_MODELS`, lib/game/ammo.ts); TANK,
 * AM_TANK, PILLBOX and BIG_GUN are in every `GEN*` template, GENMUD's among
 * them; CARRY is in SNAKE's alone and AMLAUNCH in BAY's alone.
 */
export const PROVING_ARCHIVES: readonly { archive: string; models: readonly string[] }[] = [
  { archive: 'Maps/CAMP.MAD', models: ['CRATE1', 'SIGN'] },
  { archive: 'Maps/GENMUD.MAD', models: ['TANK', 'AM_TANK', 'PILLBOX', 'BIG_GUN'] },
  { archive: 'Maps/SNAKE.MAD', models: ['CARRY'] },
  { archive: 'Maps/BAY.MAD', models: ['AMLAUNCH'] }
]

/**
 * The skill icons a signpost wears: the skill menu's own art, one 56×34 BMP per
 * skill, named after it (`skills/notes.md` § "The menu's art", `SKILL_ICON`).
 */
export const SIGN_ICONS = 'Language/Tims/MENUTIMS.MAD'

/**
 * The texture of the SIGN's board, which the icon stands in for. Measured off
 * `Maps/CAMP.MAD`: the model is two face groups, the post and frame in
 * SIGN001.TIM and the board's two big faces in this one.
 */
export const BOARD_TEXTURE = 'SIGN000.TIM'

/** The archive the engine-spawned models (a mine on the ground, a rocket in
 * flight, the boots a death leaves) are drawn out of — CAMP's, like the
 * crates. */
export const SPAWNED_ARCHIVE = 'Maps/CAMP.MAD'

/**
 * The ground's textures, borrowed whole: `Maps/CAMP.PTG`. Measured over CAMP's
 * own tiles (lib/game/provingTerrain.ts names the indices).
 */
export const GROUND_TEXTURES = 'Maps/CAMP.PTG'
