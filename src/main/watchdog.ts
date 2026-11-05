// A WATCHDOG on the renderer's thread, so the next freeze names its loop.
//
// Play, TRENCH, 2026-09-05: "свин врага встал на мину и игра зависла." The
// session log ended on the mine's throw — and the `[fling-end]` line that a
// three-second `setTimeout` in the renderer writes never came, which is the
// one fact that says what kind of hang it was: the renderer's JavaScript
// thread was inside a SYNCHRONOUS loop, not the engine waiting on a state
// that never comes (a wait would have let the timer fire). A blocked thread
// writes nothing about itself, so the process next door has to.
//
// Main pings the page over IPC every `PING_MS`; the preload answers on the
// page's own thread (src/preload/index.ts), so a page that is busy cannot
// answer. `MISSED` unanswered pings in a row and the debugger — attached and
// enabled at start-up, because `Debugger.enable` itself is queued behind the
// busy thread while `Debugger.pause` is one of the few commands Chromium
// delivers by INTERRUPT — pauses the page, the paused event carries the call
// stack, the top of it goes to the session log, and the page is resumed.
// Once: a hung game is still hung, and the log is the deliverable.
//
// Off under `POW_WATCHDOG=0`, and off under the e2e harness (`POW_NO_FOCUS`),
// which drives the same page over CDP itself.
import type { BrowserWindow, WebContents } from 'electron'
import { ipcMain } from 'electron'

import { logTelemetry } from './telemetry'
import { reportFailure } from './failures'

/** How often the page is asked whether it is alive. */
const PING_MS = 2000
/** Unanswered pings in a row before the stack is taken — six seconds, well
 * past any decision the machine has been measured at (docs/todo.md). */
const MISSED = 3
/** How many frames of the stack are worth a log line each. */
const DEPTH = 16

interface CallFrame {
  functionName: string
  url: string
  location: { lineNumber: number; columnNumber?: number }
}

/** Whether this process should run one at all. */
export const watchdogWanted = (): boolean =>
  process.env['POW_WATCHDOG'] !== '0' && process.env['POW_NO_FOCUS'] !== '1'

/** Start watching `window`'s page. Idempotent per window; stops with it. */
export function watchRenderer(window: BrowserWindow): void {
  const contents = window.webContents
  let owed = 0
  let taken = false
  const onPong = (event: Electron.IpcMainEvent): void => {
    if (event.sender === contents) owed = 0
  }
  ipcMain.on('watchdog:pong', onPong)
  arm(contents)
  const timer = setInterval(() => {
    if (contents.isDestroyed()) return
    if (owed >= MISSED) {
      if (!taken) {
        taken = true
        logTelemetry(`[watchdog] renderer silent for ${(owed * PING_MS) / 1000}s — taking its stack`)
        void takeStack(contents)
      }
      return
    }
    owed++
    contents.send('watchdog:ping')
  }, PING_MS)
  window.on('closed', () => {
    clearInterval(timer)
    ipcMain.removeListener('watchdog:pong', onPong)
  })
}

/** Attach and enable the debugger now, while the page can still answer. */
function arm(contents: WebContents): void {
  try {
    contents.debugger.attach('1.3')
    void contents.debugger.sendCommand('Debugger.enable').catch((error: unknown) => {
      reportFailure('the watchdog enabling the debugger', error)
    })
  } catch (error) {
    reportFailure('the watchdog attaching the debugger', error)
  }
}

/** Pause the busy page, log where it is, let it go. */
async function takeStack(contents: WebContents): Promise<void> {
  const dbg = contents.debugger
  if (!dbg.isAttached()) {
    logTelemetry('[watchdog] no debugger attached; nothing to read')
    return
  }
  const paused = new Promise<CallFrame[]>((resolve) => {
    const onMessage = (_event: Electron.Event, method: string, params: unknown): void => {
      if (method !== 'Debugger.paused') return
      dbg.removeListener('message', onMessage)
      resolve((params as { callFrames: CallFrame[] }).callFrames)
    }
    dbg.on('message', onMessage)
  })
  const gaveUp = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000))
  try {
    void dbg.sendCommand('Debugger.pause')
    const frames = await Promise.race([paused, gaveUp])
    if (frames === null) {
      logTelemetry('[watchdog] the page did not pause within 5s')
      return
    }
    for (const frame of frames.slice(0, DEPTH)) {
      const file = frame.url.replace(/^.*[\\/]/, '') || '?'
      logTelemetry(
        `[watchdog]   at ${frame.functionName || '<anonymous>'} (${file}:${frame.location.lineNumber + 1}:${(frame.location.columnNumber ?? 0) + 1})`
      )
    }
    await dbg.sendCommand('Debugger.resume')
  } catch (error) {
    reportFailure('the watchdog reading the stack', error)
  }
}
