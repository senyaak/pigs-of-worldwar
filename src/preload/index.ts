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
  loadSky: (archive: string): Promise<unknown> => ipcRenderer.invoke('sky:load', archive),
  loadClips: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('clips:load', relPath),
  loadTerrain: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('terrain:load', relPath),
  loadMapObjects: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('mapObjects:load', relPath),
  loadSoundBank: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('sound:bank', relPath),
  loadSound: (relPath: string): Promise<unknown> => ipcRenderer.invoke('sound:load', relPath),
  loadFrontendImages: (entryNames: string[]): Promise<unknown> =>
    ipcRenderer.invoke('frontend:images', entryNames),
  loadDebriefImages: (names: string[]): Promise<unknown> =>
    ipcRenderer.invoke('debrief:images', names),
  loadLanguageImages: (folder: string, names: string[], keyed: string[]): Promise<unknown> =>
    ipcRenderer.invoke('language:images', folder, names, keyed),
  loadFont: (name: string): Promise<unknown> => ipcRenderer.invoke('frontend:font', name),
  loadTims: (relPath: string): Promise<unknown> => ipcRenderer.invoke('tims:load', relPath),
  loadArchiveBmps: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('bmps:load', relPath),
  loadGameText: (which: string): Promise<unknown> => ipcRenderer.invoke('text:load', which),
  // The saves travel as TEXT: the shape lives in lib/game/save.ts and neither
  // this bridge nor the main process parses it.
  savesDir: (): Promise<string> => ipcRenderer.invoke('save:dir'),
  listSaves: (): Promise<unknown> => ipcRenderer.invoke('save:list'),
  readSave: (name: string): Promise<unknown> => ipcRenderer.invoke('save:read', name),
  writeSave: (name: string, text: string): Promise<unknown> =>
    ipcRenderer.invoke('save:write', name, text),
  deleteSave: (name: string): Promise<unknown> => ipcRenderer.invoke('save:delete', name),
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit')
})
