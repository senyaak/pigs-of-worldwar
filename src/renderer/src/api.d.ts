export interface FileEntry {
  path: string
  size: number
}

export interface Api {
  getGameDir(): Promise<string | null>
  selectGameDir(): Promise<string | null>
  listFiles(): Promise<FileEntry[]>
}

declare global {
  interface Window {
    api: Api
  }
}
