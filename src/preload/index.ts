import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  getGameDir: (): Promise<string | null> => ipcRenderer.invoke('game:getDir'),
  selectGameDir: (): Promise<string | null> => ipcRenderer.invoke('game:selectDir'),
  listFiles: (): Promise<{ path: string; size: number }[]> =>
    ipcRenderer.invoke('game:listFiles')
})
