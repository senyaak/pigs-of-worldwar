export interface FileEntry {
  path: string
  size: number
}

export type SetDirResult = { ok: true; dir: string } | { ok: false; error: string }

export interface ArchiveEntry {
  name: string
  offset: number
  size: number
}

export interface Archive {
  kind: 'named' | 'raw'
  entries: ArchiveEntry[]
}

export type ListArchiveResult = { ok: true; archive: Archive } | { ok: false; error: string }

export interface ModelGroup {
  start: number
  count: number
  texture: number
}

export interface Model {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  boneIndices: Int16Array
  groups: ModelGroup[]
  triangleCount: number
  sourceTriangles: number
  sourceQuads: number
  vertexCount: number
}

export interface Texture {
  name: string
  width: number
  height: number
  rgba: Uint8Array
}

export interface Bone {
  parentIndex: number
  x: number
  y: number
  z: number
}

export type LoadModelResult =
  | { ok: true; model: Model; textures: Texture[]; skeleton: Bone[] }
  | { ok: false; error: string }

export interface Clip {
  name: string
  frameCount: number
  /** frameCount × 15 × 3 euler radians. */
  rotations: Float32Array
  /** frameCount × 10 × 3 branch-bone positions. */
  positions: Float32Array
  unknowns: Uint16Array
}

export type LoadClipsResult = { ok: true; clips: Clip[] } | { ok: false; error: string }

export interface TerrainTile {
  texture: number
  rotateFlip: number
  type: number
  slip: number
}

export interface TerrainBlock {
  x: number
  z: number
  heights: Int16Array
  /** Baked vertex brightness, 0..255 (255 unshaded). */
  shades: Uint8Array
  tiles: TerrainTile[]
}

export interface TerrainTexture {
  width: number
  height: number
  rgba: Uint8Array
  /** The raw CLUT and the index of every texel — a colour's top bit is what
   * says water (lib/game/watermask). */
  palette: Uint16Array
  indices: Uint8Array
}

export type LoadTerrainResult =
  | { ok: true; blocks: TerrainBlock[]; textures: TerrainTexture[] }
  | { ok: false; error: string }

export interface MapObject {
  name: string
  id: number
  type: number
  x: number
  /** Elevation, up-positive — like the PMG's heights, and the model's
   * ORIGIN rather than its feet (lib/formats/pog.ts). */
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
  /** Collision shape kind: 0 a box, 1 no collider (every bridge and step
   * piece) — see lib/formats/pog.ts. */
  shape: number
  box: { x: number; y: number; z: number }
  flags: number
  /** What the record hands over when collected — a weapon and a count, or
   * a health pack (weapon null). Null when it carries nothing, which is
   * what tells a crate to collect from a crate to walk round. */
  contents: { weapon: number | null; amount: number } | null
  fields: Int16Array
}

export interface MapProp {
  name: string
  model: Model
}

export type LoadMapObjectsResult =
  | { ok: true; objects: MapObject[]; props: MapProp[]; textures: Texture[] }
  | { ok: false; error: string }

export interface SoundEntry {
  id: number
  path: string
  /** Base name, upper-cased: `FT_GRASS`. */
  name: string
}

export type LoadSoundBankResult =
  | { ok: true; bank: { name: string; entries: SoundEntry[] } }
  | { ok: false; error: string }

export type LoadSoundResult = { ok: true; data: Uint8Array } | { ok: false; error: string }

export interface Api {
  getGameDir(): Promise<string | null>
  selectGameDir(): Promise<string | null>
  setGameDir(dir: string): Promise<SetDirResult>
  listFiles(): Promise<FileEntry[]>
  listArchive(relPath: string): Promise<ListArchiveResult>
  loadModel(relPath: string, base: string): Promise<LoadModelResult>
  loadClips(relPath: string): Promise<LoadClipsResult>
  loadTerrain(relPath: string): Promise<LoadTerrainResult>
  loadMapObjects(relPath: string): Promise<LoadMapObjectsResult>
  loadSoundBank(relPath: string): Promise<LoadSoundBankResult>
  loadSound(relPath: string): Promise<LoadSoundResult>
  loadFrontendImages(entryNames: string[]): Promise<FrontendImagesResult>
  loadFont(name: string): Promise<LoadFontResult>
  loadGameText(which: string): Promise<LoadTextResult>
  loadTims(relPath: string): Promise<LoadTimsResult>
  quit(): Promise<void>
}

/** One TIM out of an archive, ready to blit — colour 0 already transparent. */
export interface TimImage {
  name: string
  width: number
  height: number
  rgba: Uint8Array
}

export type LoadTimsResult = { ok: true; images: TimImage[] } | { ok: false; error: string }

export interface FrontendImage {
  name: string
  width: number
  height: number
  /** RGBA with the magenta key already transparent. */
  rgba: Uint8Array
}

export type FrontendImagesResult =
  | { ok: true; images: FrontendImage[] }
  | { ok: false; error: string }

export interface Glyph {
  x: number
  y: number
  width: number
  height: number
}

export interface GlyphTable {
  glyphs: Glyph[]
  origin: { x: number; y: number }
  height: number
  space: number
}

export interface LoadedFont {
  name: string
  atlas: { width: number; height: number; rgba: Uint8Array }
  table: GlyphTable
}

export type LoadFontResult = { ok: true; font: LoadedFont } | { ok: false; error: string }

export type LoadTextResult = { ok: true; strings: string[] } | { ok: false; error: string }

declare global {
  interface Window {
    api: Api
  }
}
