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

export interface Api {
  getGameDir(): Promise<string | null>
  selectGameDir(): Promise<string | null>
  setGameDir(dir: string): Promise<SetDirResult>
  listFiles(): Promise<FileEntry[]>
  listArchive(relPath: string): Promise<ListArchiveResult>
}

declare global {
  interface Window {
    api: Api
  }
}
