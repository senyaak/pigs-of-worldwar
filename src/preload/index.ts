import { contextBridge, ipcRenderer } from 'electron'

// The watchdog's heartbeat (src/main/watchdog.ts). It is answered HERE, on
// the page's own thread, so a page stuck in a loop cannot answer — which is
// the whole measurement.
ipcRenderer.on('watchdog:ping', () => {
  ipcRenderer.send('watchdog:pong')
})

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
  loadModel: (relPath: string, base: string, skins?: string): Promise<unknown> =>
    ipcRenderer.invoke('model:load', relPath, base, skins),
  loadSky: (archive: string): Promise<unknown> => ipcRenderer.invoke('sky:load', archive),
  loadClips: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('clips:load', relPath),
  loadTerrain: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('terrain:load', relPath),
  loadMapObjects: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('mapObjects:load', relPath),
  loadProvingGround: (): Promise<unknown> => ipcRenderer.invoke('provingGround:load'),
  loadSoundBank: (relPath: string): Promise<unknown> =>
    ipcRenderer.invoke('sound:bank', relPath),
  loadSound: (relPath: string): Promise<unknown> => ipcRenderer.invoke('sound:load', relPath),
  loadFrontendImages: (entryNames: string[]): Promise<unknown> =>
    ipcRenderer.invoke('frontend:images', entryNames),
  loadDebriefImages: (names: string[], blackKeyed: string[] = []): Promise<unknown> =>
    ipcRenderer.invoke('debrief:images', names, blackKeyed),
  loadLanguageImages: (folder: string, names: string[], keyed: string[]): Promise<unknown> =>
    ipcRenderer.invoke('language:images', folder, names, keyed),
  loadFont: (name: string): Promise<unknown> => ipcRenderer.invoke('frontend:font', name),
  loadTim: (relPath: string): Promise<unknown> => ipcRenderer.invoke('tim:load', relPath),
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
  logTelemetry: (line: string): void => {
    ipcRenderer.send('telemetry:log', line)
  },
  // THE AI'S PROCESS (src/main/brainHost.ts, src/brain/). Both ways are
  // fire-and-forget: the engine's seat asks and picks the answer up on a
  // later step, so there is no promise here to await and nothing on the page
  // thread ever blocks on a thought. The messages themselves are typed on
  // both real ends (lib/game/brainPort.ts); the bridge only carries them.
  brainSend: (message: unknown): void => {
    ipcRenderer.send('brain:send', message)
  },
  onBrainReply: (handler: (message: unknown) => void): (() => void) => {
    const listener = (_event: unknown, message: unknown): void => handler(message)
    ipcRenderer.on('brain:reply', listener)
    return () => {
      ipcRenderer.off('brain:reply', listener)
    }
  },
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit')
})
