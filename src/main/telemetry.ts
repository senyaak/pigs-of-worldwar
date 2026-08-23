// A session log a play report can point at. The renderer's battle prints its
// [blast]/[fling] lines to the devtools console, and the console dies with
// the window — play sessions run outside any harness, so the same lines land
// here too, in a file whoever is debugging can read afterwards.
//
// The folder follows the saves' rule (src/main/saves.ts): the CHECKOUT's own
// `_tmp/` in development — the project's scratch space, gitignored — and
// beside the executable in a packaged build. One file, appended, truncated at
// each app start so it is always the LAST session.

import { app } from 'electron'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

let file: string | null = null

function telemetryFile(): string {
  if (file) return file
  const root = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  const dir = path.join(root, '_tmp')
  mkdirSync(dir, { recursive: true })
  file = path.join(dir, 'telemetry.log')
  writeFileSync(file, `# session ${new Date().toISOString()}\n`)
  return file
}

/** Append one line. Sync and fire-and-forget: a telemetry write that fails
 * must never take the battle with it. */
export function logTelemetry(line: string): void {
  try {
    appendFileSync(telemetryFile(), `${new Date().toISOString().slice(11, 19)} ${line}\n`)
  } catch {
    // Nothing — a full disk loses a log line, not a game.
  }
}
