// IPC surface of the main process. Handlers stay thin: path validation via
// gameDir.insideGameDir, loading via assets.ts, errors folded into
// { ok: false } results so the renderer shows them instead of dying.

import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'

import { parseArchive } from '../lib/formats/mad'
import { getGameDir, insideGameDir, setGameDir, walkDir } from './gameDir'
import { deleteSave, listSaves, readSave, savesDir, writeSave } from './saves'
import { logTelemetry } from './telemetry'
import {
  loadArchiveBmps,
  loadClips,
  loadFont,
  loadLanguageImages,
  loadFrontendImages,
  loadGameText,
  loadMapObjects,
  loadModel,
  loadSky,
  loadSound,
  loadSoundBank,
  loadTerrain,
  loadTims
} from './assets'

function fail(context: string, error: unknown): { ok: false; error: string } {
  return { ok: false, error: `${context}: ${error instanceof Error ? error.message : String(error)}` }
}

export function registerIpc(): void {
  // One-way and unvalidated by design: a telemetry line is a string for a
  // human, and dropping a malformed one costs nothing (src/main/telemetry.ts).
  ipcMain.on('telemetry:log', (_event, line: unknown) => {
    if (typeof line === 'string' && line.length <= 512) logTelemetry(line)
  })

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

  ipcMain.handle('model:load', async (_event, relPath: string, base: string, skins?: string) => {
    try {
      return {
        ok: true,
        ...(await loadModel(insideGameDir(relPath), base, skins ? insideGameDir(skins) : undefined))
      }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  // By MOOD, not by path: the archive name is checked against the exe's own
  // list in assets.ts, and the dome itself is always the same file.
  ipcMain.handle('sky:load', async (_event, archive: string) => {
    const gameDir = getGameDir()
    if (!gameDir) return { ok: false, error: 'Game folder is not set' }
    try {
      return { ok: true, sky: await loadSky(gameDir, archive) }
    } catch (error) {
      return fail(archive, error)
    }
  })

  ipcMain.handle('frontend:images', async (_event, entryNames: string[]) => {
    const gameDir = getGameDir()
    if (!gameDir) return { ok: false, error: 'Game folder is not set' }
    try {
      return { ok: true, images: await loadFrontendImages(gameDir, entryNames) }
    } catch (error) {
      return fail(entryNames.join(', '), error)
    }
  })

  ipcMain.handle('debrief:images', async (_event, names: string[]) => {
    const gameDir = getGameDir()
    if (!gameDir) return { ok: false, error: 'Game folder is not set' }
    try {
      // The debrief's overlays are all colour-keyed, so every name punches.
      return { ok: true, images: await loadLanguageImages(gameDir, 'debrief', names, names) }
    } catch (error) {
      return fail(names.join(', '), error)
    }
  })

  ipcMain.handle(
    'language:images',
    async (_event, folder: string, names: string[], keyed: string[]) => {
      const gameDir = getGameDir()
      if (!gameDir) return { ok: false, error: 'Game folder is not set' }
      if (!/^[a-z0-9]+$/i.test(folder)) return { ok: false, error: `Not a Tims folder: ${folder}` }
      try {
        return { ok: true, images: await loadLanguageImages(gameDir, folder, names, keyed) }
      } catch (error) {
        return fail(`${folder}: ${names.join(', ')}`, error)
      }
    }
  )

  ipcMain.handle('frontend:font', async (_event, name: string) => {
    const gameDir = getGameDir()
    if (!gameDir) return { ok: false, error: 'Game folder is not set' }
    try {
      return { ok: true, font: await loadFont(gameDir, name) }
    } catch (error) {
      return fail(name, error)
    }
  })

  ipcMain.handle('tims:load', async (_event, relPath: string) => {
    try {
      return { ok: true, images: await loadTims(insideGameDir(relPath)) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('bmps:load', async (_event, relPath: string) => {
    try {
      return { ok: true, images: await loadArchiveBmps(insideGameDir(relPath)) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('text:load', async (_event, which: string) => {
    const gameDir = getGameDir()
    if (!gameDir) return { ok: false, error: 'Game folder is not set' }
    try {
      return { ok: true, strings: await loadGameText(gameDir, which) }
    } catch (error) {
      return fail(which, error)
    }
  })

  ipcMain.handle('app:quit', () => app.quit())

  ipcMain.handle('terrain:load', async (_event, relPath: string) => {
    try {
      return { ok: true, ...(await loadTerrain(insideGameDir(relPath))) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('mapObjects:load', async (_event, relPath: string) => {
    try {
      return { ok: true, ...(await loadMapObjects(insideGameDir(relPath))) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('sound:bank', async (_event, relPath: string) => {
    try {
      return { ok: true, bank: await loadSoundBank(insideGameDir(relPath)) }
    } catch (error) {
      return fail(relPath, error)
    }
  })

  ipcMain.handle('sound:load', async (_event, relPath: string) => {
    try {
      return { ok: true, data: await loadSound(insideGameDir(relPath)) }
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

  // The saves. Text in, text out — the SHAPE is lib/game/save.ts and the main
  // process deliberately knows nothing about it, so a change to the save's
  // fields never reaches this file.
  ipcMain.handle('save:dir', () => savesDir())

  ipcMain.handle('save:list', async () => {
    try {
      return { ok: true, saves: await listSaves() }
    } catch (error) {
      return fail('saves', error)
    }
  })

  ipcMain.handle('save:read', async (_event, name: string) => {
    try {
      return { ok: true, text: await readSave(name) }
    } catch (error) {
      return fail(name, error)
    }
  })

  ipcMain.handle('save:write', async (_event, name: string, text: string) => {
    try {
      await writeSave(name, text)
      return { ok: true }
    } catch (error) {
      return fail(name, error)
    }
  })

  ipcMain.handle('save:delete', async (_event, name: string) => {
    try {
      await deleteSave(name)
      return { ok: true }
    } catch (error) {
      return fail(name, error)
    }
  })
}
