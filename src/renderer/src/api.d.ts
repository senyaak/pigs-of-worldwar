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

export interface Model {
  positions: Float32Array
  normals: Float32Array
  boneIndices: Int16Array
  triangleCount: number
  sourceTriangles: number
  sourceQuads: number
  vertexCount: number
}

export type LoadModelResult = { ok: true; model: Model } | { ok: false; error: string }

export interface Api {
  getGameDir(): Promise<string | null>
  selectGameDir(): Promise<string | null>
  setGameDir(dir: string): Promise<SetDirResult>
  listFiles(): Promise<FileEntry[]>
  listArchive(relPath: string): Promise<ListArchiveResult>
  loadModel(relPath: string, base: string): Promise<LoadModelResult>
}

declare global {
  interface Window {
    api: Api
  }
}
