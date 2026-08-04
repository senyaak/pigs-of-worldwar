// Locating and remembering the game installation (README, "Game folder").
// Resolution order: --game-dir CLI argument > GAME_DIR in .env > unset.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const GAME_EXE = 'warhogs_.exe'
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

export type SetDirResult = { ok: true; dir: string } | { ok: false; error: string }

let gameDir: string | null = null

export function getGameDir(): string | null {
  return gameDir
}

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

/** Called once at startup; later changes go through setGameDir. */
export function resolveGameDir(): void {
  const cli = cliGameDir()
  // An explicit CLI argument overrides .env entirely — even when invalid,
  // so a bad path fails visibly instead of silently falling back.
  if (cli !== null) {
    gameDir = isGameDir(cli) ? path.resolve(cli) : null
    return
  }
  const env = parseEnvFile()[ENV_KEY]
  gameDir = env && isGameDir(env) ? path.resolve(env) : null
}

export function setGameDir(dir: string): SetDirResult {
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

/**
 * Resolve a renderer-supplied relative path against the game folder,
 * refusing anything that escapes it. The renderer only ever sends paths it
 * got from game:listFiles, but an IPC boundary is still a boundary.
 */
export function insideGameDir(relPath: string): string {
  if (!gameDir) throw new Error('Game folder is not set')
  const full = path.resolve(gameDir, relPath)
  if (!full.startsWith(gameDir + path.sep)) {
    throw new Error(`Path escapes the game folder: ${relPath}`)
  }
  return full
}

export async function walkDir(root: string, rel = ''): Promise<FileEntry[]> {
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
