// Locating and remembering the game installation (README, "Game folder").
// Resolution order: --game-dir CLI argument > GAME_DIR in .env > unset.

import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'

export const GAME_EXE = 'warhogs_.exe'
const ENV_KEY = 'GAME_DIR'
/**
 * Where the remembered game folder is written.
 *
 * In dev that is the project root, beside the sources, which is what a
 * checkout wants. **A PACKAGED build cannot use it**: `getAppPath` there is
 * inside `app.asar`, which is read-only — the first-launch picker would find
 * the folder and then throw writing it down, and every later start would ask
 * again. So a packaged app keeps it in `userData`, the one place the platform
 * guarantees is writable and survives an upgrade.
 *
 * POW_ENV_FILE redirects it entirely so tests never touch the real .env
 * (docs/testing.md, "Isolation").
 */
const ENV_FILE =
  process.env['POW_ENV_FILE'] ??
  path.join(app.isPackaged ? app.getPath('userData') : app.getAppPath(), '.env')

// Directories that may live inside the game folder but are not game data.
// Naming them one by one stopped working the day either repo got a WORKTREE
// — `pow-net`, `pigs-disasm-net` and whatever comes next are all siblings of
// the game data — so what is skipped is any directory that is a git checkout,
// which every worktree is: it carries a `.git`, a directory in the main clone
// and a file in a worktree.
const IGNORED_DIRS = new Set(['node_modules', '.git'])
const isCheckout = (dirents: Dirent[]): boolean => dirents.some((d) => d.name === '.git')

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
  // A checkout below the root is somebody's source tree, not game data — and
  // the root itself is never one, so the game folder is walked as it always
  // was even when this project sits inside it.
  if (rel && isCheckout(dirents)) return entries
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
