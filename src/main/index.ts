// App lifecycle only — game location logic lives in gameDir.ts, the IPC
// surface in ipc.ts, asset loading in assets.ts.

import { app, BrowserWindow } from 'electron'
import path from 'node:path'

import { resolveGameDir } from './gameDir'
import { registerIpc } from './ipc'

function createWindow(): void {
  // The game runs borderless fullscreen. --windowed (or POW_WINDOWED=1, for
  // launchers that swallow argv — electron-vite preview does) keeps a desktop
  // window; dev (HMR) defaults to windowed too, --fullscreen overrides. The
  // e2e suite passes --windowed so a run does not take over the screen
  // (docs/testing.md).
  const windowed =
    !process.argv.includes('--fullscreen') &&
    (process.argv.includes('--windowed') ||
      process.env['POW_WINDOWED'] === '1' ||
      Boolean(process.env['ELECTRON_RENDERER_URL']))

  // POW_NO_FOCUS: come up WITHOUT taking the foreground. The e2e suite sets
  // it, because a run launches the app repeatedly and every launch used to
  // steal the keyboard from whatever the developer was doing. The window
  // still has to draw while it sits behind everything — specs read the
  // canvas back and time the frame loop — and Chromium throttles a window it
  // thinks nobody is looking at, so the throttle goes off with it.
  const noFocus = process.env['POW_NO_FOCUS'] === '1'
  const window = new BrowserWindow({
    ...(windowed ? { width: 1100, height: 750 } : { fullscreen: true, frame: false }),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      ...(noFocus ? { backgroundThrottling: false } : {})
    }
  })

  window.on('ready-to-show', () => (noFocus ? window.showInactive() : window.show()))

  if (process.env['ELECTRON_RENDERER_URL']) {
    void window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  resolveGameDir()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
