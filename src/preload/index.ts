import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getGameDir: (): Promise<string | null> => ipcRenderer.invoke('game:getDir'),
  selectGameDir: (): Promise<string | null> => ipcRenderer.invoke('game:selectDir'),
  setGameDir: (
    dir: string
  ): Promise<{ ok: true; dir: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('game:setDir', dir),
  listFiles: (): Promise<{ path: string; size: number }[]> =>
    ipcRenderer.invoke('game:listFiles'),
  listArchive: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('archive:list', relPath),
  loadModel: (relPath: string, base: string): Promise<unknown> =>
    ipcRenderer.invoke('model:load', relPath, base),
  loadClips: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('clips:load', relPath),
  loadTerrain: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('terrain:load', relPath),
  loadMapObjects: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('mapObjects:load', relPath),
  loadSoundBank: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('sound:bank', relPath),
  loadSound: (relPath: string): Promise<unknown> => ipcRenderer.invoke('sound:load', relPath),
  loadFrontendImage: (entryName: string): Promise<unknown> =>
    ipcRenderer.invoke('frontend:image', entryName),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit')
})
