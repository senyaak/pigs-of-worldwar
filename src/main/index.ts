import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { parseArchive } from '../lib/formats/mad'
import type { Archive, ArchiveEntry } from '../lib/formats/mad'
import { boneWorldOffsets, parseHir } from '../lib/formats/hir'
import { parseModel } from '../lib/formats/model'
import type { Model } from '../lib/formats/model'

const GAME_EXE = 'warhogs_.exe'
const ENV_KEY = 'GAME_DIR'
// In dev this resolves to the project root. Packaged builds will need a
// writable location instead (app.getPath('userData')) — revisit then.
// POW_ENV_FILE redirects it entirely so tests never touch the real .env
// (docs/testing.md, "Isolation").
const ENV_FILE = process.env['POW_ENV_FILE'] ?? path.join(app.getAppPath(), '.env')

// Directories that may live inside the game folder but are not game data
// (this project itself, disasm notes, VCS/deps).
const IGNORED_DIRS = new Set(['node_modules', '.git', 'pigsOfWorldwar', 'pigs-disasm'])

export interface FileEntry {
  path: string
  size: number
}

let gameDir: string | null = null

function parseEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {}
  const result: Record<string, string> = {}
  for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (match) result[match[1]] = match[2]
  }
  return result
}

function writeEnvGameDir(dir: string): void {
  const env = parseEnvFile()
  env[ENV_KEY] = dir
  const content = Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
  writeFileSync(ENV_FILE, content + '\n', 'utf8')
}

function cliGameDir(): string | null {
  for (let i = 0; i < process.argv.length; i++) {
    const arg = process.argv[i]
    if (arg.startsWith('--game-dir=')) return arg.slice('--game-dir='.length)
    if (arg === '--game-dir' && process.argv[i + 1]) return process.argv[i + 1]
  }
  return null
}

function isGameDir(dir: string): boolean {
  return existsSync(path.join(dir, GAME_EXE))
}

function resolveGameDir(): string | null {
  const cli = cliGameDir()
  // An explicit CLI argument overrides .env entirely — even when invalid,
  // so a bad path fails visibly instead of silently falling back.
  if (cli !== null) return isGameDir(cli) ? path.resolve(cli) : null
  const env = parseEnvFile()[ENV_KEY]
  if (env && isGameDir(env)) return path.resolve(env)
  return null
}

async function walkDir(root: string, rel = ''): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  const dirents = await fs.readdir(path.join(root, rel), { withFileTypes: true })
  for (const dirent of dirents) {
    const relPath = rel ? `${rel}/${dirent.name}` : dirent.name
    if (dirent.isDirectory()) {
      if (IGNORED_DIRS.has(dirent.name)) continue
      entries.push(...(await walkDir(root, relPath)))
    } else if (dirent.isFile()) {
      const stat = await fs.stat(path.join(root, relPath))
      entries.push({ path: relPath, size: stat.size })
    }
  }
  return entries
}

type SetDirResult = { ok: true; dir: string } | { ok: false; error: string }

function setGameDir(dir: string): SetDirResult {
  const trimmed = dir.trim()
  if (!trimmed) return { ok: false, error: 'Path is empty' }
  if (!existsSync(trimmed)) return { ok: false, error: `Folder does not exist: ${trimmed}` }
  if (!isGameDir(trimmed)) {
    return { ok: false, error: `${GAME_EXE} not found in: ${trimmed}` }
  }
  gameDir = path.resolve(trimmed)
  writeEnvGameDir(gameDir)
  return { ok: true, dir: gameDir }
}

function registerIpc(): void {
  ipcMain.handle('game:getDir', () => gameDir)

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
    if (!gameDir) return []
    return walkDir(gameDir)
  })

  ipcMain.handle(
    'model:load',
    async (
      _event,
      relPath: string,
      base: string
    ): Promise<{ ok: true; model: Model } | { ok: false; error: string }> => {
      if (!gameDir) return { ok: false, error: 'Game folder is not set' }
      const full = path.resolve(gameDir, relPath)
      if (!full.startsWith(gameDir + path.sep)) {
        return { ok: false, error: `Path escapes the game folder: ${relPath}` }
      }
      try {
        const data = await fs.readFile(full)
        const { entries } = parseArchive(data)
        const slice = (ext: string): Uint8Array => {
          const wanted = `${base}${ext}`.toLowerCase()
          const entry: ArchiveEntry | undefined = entries.find((e) => e.name.toLowerCase() === wanted)
          if (!entry) throw new Error(`no ${base}${ext} in ${relPath}`)
          return data.subarray(entry.offset, entry.offset + entry.size)
        }
        // A .HIR next to the archive is the skeleton its models bind to
        // (Chars/pig.HIR) — vertices are bone-local without it.
        let boneOffsets: Float32Array | undefined
        const siblings = await fs.readdir(path.dirname(full))
        const hirName = siblings.find((name) => name.toLowerCase().endsWith('.hir'))
        if (hirName) {
          boneOffsets = boneWorldOffsets(parseHir(await fs.readFile(path.join(path.dirname(full), hirName))))
        }
        return { ok: true, model: parseModel(slice('.VTX'), slice('.NO2'), slice('.FAC'), boneOffsets) }
      } catch (error) {
        return { ok: false, error: `${relPath}: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
  )

  ipcMain.handle(
    'archive:list',
    async (_event, relPath: string): Promise<{ ok: true; archive: Archive } | { ok: false; error: string }> => {
      if (!gameDir) return { ok: false, error: 'Game folder is not set' }
      const full = path.resolve(gameDir, relPath)
      // The renderer only ever sends paths it got from game:listFiles, but an
      // IPC boundary is still a boundary — keep reads inside the game folder.
      if (!full.startsWith(gameDir + path.sep)) {
        return { ok: false, error: `Path escapes the game folder: ${relPath}` }
      }
      try {
        const data = await fs.readFile(full)
        return { ok: true, archive: parseArchive(data) }
      } catch (error) {
        return { ok: false, error: `${relPath}: ${error instanceof Error ? error.message : String(error)}` }
      }
    }
  )
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 750,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js')
    }
  })

  window.on('ready-to-show', () => window.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  gameDir = resolveGameDir()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
