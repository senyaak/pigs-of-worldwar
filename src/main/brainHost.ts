// WHERE THE AI'S PROCESS IS KEPT — main forks it, and carries messages
// between it and the window.
//
// The brain itself is `src/brain/index.ts` and knows nothing about Electron.
// This file is the only place that does: it starts the process, hands it the
// game directory (a path is the host's business, never the renderer's), and
// relays two channels.
//
// **Why the relay rather than a direct port.** Electron can transfer a
// `MessagePort` from a utility process to the window and cut main out of the
// path. It is not worth it here: the seat asks once a second at most and the
// answer is one order, so the two extra hops cost microseconds against a
// thought that costs hundreds of milliseconds — and a relay is code anybody
// can read, where a port handed through `contextBridge` is not.
//
// It is LAZY on purpose. The process is forked on the first message a battle
// sends, so the menus, the campaign map and a hotseat game never start one.

import { utilityProcess } from 'electron'
import type { BrowserWindow, UtilityProcess } from 'electron'
import path from 'node:path'

import { getGameDir } from './gameDir'
import { logTelemetry } from './telemetry'

/** Renderer → brain. Fire-and-forget: an ask is not a question main answers. */
export const BRAIN_SEND = 'brain:send'
/** …and brain → renderer, the same way. */
export const BRAIN_REPLY = 'brain:reply'

let child: UtilityProcess | null = null

/** The window replies go to. One window, and it is the only one there is. */
let listener: BrowserWindow | null = null

function fork(): UtilityProcess | null {
  const dir = getGameDir()
  if (dir === null) {
    logTelemetry('[brain] no game directory: the machine will think in the renderer')
    return null
  }
  // Beside `index.js` in the same build (electron.vite.config.ts names both).
  const script = path.join(__dirname, 'brain.js')
  const forked = utilityProcess.fork(script, [dir], { serviceName: 'pow-brain' })
  forked.on('message', (reply: unknown) => {
    if (listener !== null && !listener.isDestroyed()) listener.webContents.send(BRAIN_REPLY, reply)
  })
  forked.on('exit', (code) => {
    logTelemetry(`[brain] the AI process exited (${code})`)
    child = null
  })
  return forked
}

/**
 * Hand one message to the brain, starting it if this is the first.
 *
 * A failure to start is not a failure to play: the message is dropped, the
 * seat's patience runs out (lib/game/brainPort.ts, `BRAIN_PATIENCE`) and the
 * machine mulls again. What that costs is a machine that does nothing, which
 * the turn clock still ends — the same shape the seat has always had for a
 * brain that stalls.
 */
export function sendToBrain(window: BrowserWindow, message: unknown): void {
  listener = window
  if (child === null) child = fork()
  child?.postMessage(message)
}

/** Shut it down — the app is closing, or the window that was using it went. */
export function stopBrain(): void {
  child?.kill()
  child = null
  listener = null
}
