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
  const window = new BrowserWindow({
    ...(windowed ? { width: 1100, height: 750 } : { fullscreen: true, frame: false }),
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
