export interface FileEntry {
  path: string
  size: number
}

export type SetDirResult = { ok: true; dir: string } | { ok: false; error: string }

export interface Api {
  getGameDir(): Promise<string | null>
  selectGameDir(): Promise<string | null>
  setGameDir(dir: string): Promise<SetDirResult>
  listFiles(): Promise<FileEntry[]>
}

declare global {
  interface Window {
    api: Api
  }
}
