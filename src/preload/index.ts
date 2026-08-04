import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getGameDir: (): Promise<string | null> => ipcRenderer.invoke('game:getDir'),
  selectGameDir: (): Promise<string | null> => ipcRenderer.invoke('game:selectDir'),
  setGameDir: (
    dir: string
  ): Promise<{ ok: true; dir: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('game:setDir', dir),
  listFiles: (): Promise<{ path: string; size: number }[]> =>
    ipcRenderer.invoke('game:listFiles')
})
