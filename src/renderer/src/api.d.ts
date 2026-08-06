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

export interface Api {
  getGameDir(): Promise<string | null>
  selectGameDir(): Promise<string | null>
  setGameDir(dir: string): Promise<SetDirResult>
  listFiles(): Promise<FileEntry[]>
  listArchive(relPath: string): Promise<ListArchiveResult>
  loadModel(relPath: string, base: string): Promise<LoadModelResult>
  loadClips(relPath: string): Promise<LoadClipsResult>
  loadTerrain(relPath: string): Promise<LoadTerrainResult>
  loadFrontendImage(entryName: string): Promise<FrontendImageResult>
  quit(): Promise<void>
}

export interface FrontendImage {
  width: number
  height: number
  rgba: Uint8Array
}

export type FrontendImageResult =
  | { ok: true; image: FrontendImage }
  | { ok: false; error: string }

declare global {
  interface Window {
    api: Api
  }
}
