// App lifecycle only — game location logic lives in gameDir.ts, the IPC
// surface in ipc.ts, asset loading in assets.ts.

import { app, BrowserWindow } from 'electron'
import path from 'node:path'

import { resolveGameDir } from './gameDir'
import { registerIpc } from './ipc'

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
