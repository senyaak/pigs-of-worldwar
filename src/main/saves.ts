// Where saves live and the four things done to them. The SHAPE is
// `lib/game/save.ts`; this file only knows about bytes and a folder.
//
// **It is the APP's folder, not the platform's** (play, 2026-08-13): `saves/`
// at the root of the checkout in development — gitignored, which is what a
// file in a working tree is for — and beside the executable in a packaged
// build. A save PER CHECKOUT is the point: playing a worktree leaves the
// master's game alone. `POW_SAVE_DIR` overrides both, and the e2e fixture
// points it at `_tmp/` so a test run never touches a real one.
//
// The one thing left to know rather than to argue: a machine-wide install into
// `Program Files` would not be writable. That is where a fallback to
// `userData` would go — one line, if it ever happens. electron-builder
// installs per-user, so it has not.

import { app } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const EXTENSION = '.json'

/** A slot name has to survive being a filename, so it is spelled out. */
const NAME = /^[A-Za-z0-9_-]{1,64}$/

export function savesDir(): string {
  const override = process.env['POW_SAVE_DIR']
  if (override) return path.resolve(override)
  const root = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  return path.join(root, 'saves')
}

function fileFor(name: string): string {
  if (!NAME.test(name)) throw new Error(`Not a save name: ${name}`)
  return path.join(savesDir(), name + EXTENSION)
}

/** Every save there is, newest first — what LOAD GAME lists. */
export async function listSaves(): Promise<{ name: string; text: string }[]> {
  let entries: string[]
  try {
    entries = await fs.readdir(savesDir())
  } catch {
    // No folder yet is no saves, not an error: nobody has played.
    return []
  }
  const saves: { name: string; text: string; at: number }[] = []
  for (const entry of entries) {
    if (!entry.endsWith(EXTENSION)) continue
    const name = entry.slice(0, -EXTENSION.length)
    if (!NAME.test(name)) continue
    const full = path.join(savesDir(), entry)
    try {
      const [text, stat] = await Promise.all([fs.readFile(full, 'utf8'), fs.stat(full)])
      saves.push({ name, text, at: stat.mtimeMs })
    } catch {
      // A file that cannot be read is one the list does without.
    }
  }
  saves.sort((a, b) => b.at - a.at)
  return saves.map(({ name, text }) => ({ name, text }))
}

export async function readSave(name: string): Promise<string | null> {
  try {
    return await fs.readFile(fileFor(name), 'utf8')
  } catch {
    return null
  }
}

/**
 * Write one. The folder is made on the way, and the write goes through a
 * temporary file — an autosave lands at the end of a mission, which is exactly
 * when a player is most likely to close the window on it.
 */
export async function writeSave(name: string, text: string): Promise<void> {
  const file = fileFor(name)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await fs.writeFile(temp, text, 'utf8')
  await fs.rename(temp, file)
}

export async function deleteSave(name: string): Promise<void> {
  try {
    await fs.unlink(fileFor(name))
  } catch {
    // Deleting one that is not there is the state the caller wanted.
  }
}
