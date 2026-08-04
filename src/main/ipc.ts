// IPC surface of the main process. Handlers stay thin: path validation via
// gameDir.insideGameDir, loading via assets.ts, errors folded into
// { ok: false } results so the renderer shows them instead of dying.

import { BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { parseArchive } from '../lib/formats/mad'
import { getGameDir, insideGameDir, setGameDir, walkDir } from './gameDir'
import { loadClips, loadModel } from './assets'

function fail(context: string, error: unknown): { ok: false; error: string } {
  return { ok: false, error: `${context}: ${error instanceof Error ? error.message : String(error)}` }
}

export function registerIpc(): void {
  ipcMain.handle('game:getDir', () => getGameDir())

  // The dialog below is a native picker no e2e test can drive — this is the
  // test-reachable way to set the folder (docs/testing.md).
  ipcMain.handle('game:setDir', (_event, dir: string) => setGameDir(dir))

  ipcMain.handle('game:selectDir', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return null
    const result = await dialog.showOpenDialog(window, {
      title: 'Select the Hogs of War installation folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const set = setGameDir(result.filePaths[0])
    if (!set.ok) {
      dialog.showErrorBox('Not a Hogs of War folder', set.error)
      return null
    }
    return set.dir
  })

  ipcMain.handle('game:listFiles', async () => {
    const gameDir = getGameDir()
    if (!gameDir) return []
    return walkDir(gameDir)
  })

  ipcMain.handle('archive:list', async (_event, relPath: string) => {
    try {
      const data = await fs.readFile(insideGameDir(relPath))
      return { ok: true, archive: parseArchive(data) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('model:load', async (_event, relPath: string, base: string) => {
    try {
      return { ok: true, ...(await loadModel(insideGameDir(relPath), base)) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('clips:load', async (_event, relPath: string) => {
    try {
      return { ok: true, clips: await loadClips(path.dirname(insideGameDir(relPath))) }
    } catch (error) {
      return fail(relPath, error)
    }
  })
}
