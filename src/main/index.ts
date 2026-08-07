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

  // POW_NO_FOCUS: come up out of the way entirely. The e2e suite sets it,
  // because a run launches the app repeatedly and every launch used to take
  // the foreground — over a fullscreen game, in the worst case, which no
  // amount of not-focusing fixes on its own. So the window is shown
  // INACTIVE and parked off the desktop: it still exists and still draws,
  // it is simply nowhere anyone is looking.
  //
  // It has to keep drawing — specs read the canvas back and time the frame
  // loop — and Chromium throttles a window it believes nobody can see, so
  // the throttle goes off with it.
  const noFocus = process.env['POW_NO_FOCUS'] === '1'
  /** Far enough off any real desktop that no arrangement of monitors
   * reaches it, and not so far that a window manager refuses the move. */
  const PARKED: [number, number] = [-4000, -4000]
  const window = new BrowserWindow({
    ...(windowed ? { width: 1100, height: 750 } : { fullscreen: true, frame: false }),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      ...(noFocus ? { backgroundThrottling: false } : {})
    }
  })

  // POW_MUTE / --mute: no sound at all. The e2e suite sets it, because a
  // full phase is a couple of minutes of gunfire and squealing coming out of
  // the machine while nobody is listening. One line here beats a flag
  // threaded through to every bank: Electron mutes the whole window.
  if (process.argv.includes('--mute') || process.env['POW_MUTE'] === '1') {
    window.webContents.setAudioMuted(true)
  }

  window.on('ready-to-show', () => {
    if (!noFocus) {
      window.show()
      return
    }
    // A fullscreen window cannot be moved off the display it fills — the one
    // spec that checks the real fullscreen launch is the one launch that
    // still shows up, and being about fullscreen, it has to.
    if (windowed) window.setPosition(...PARKED)
    window.showInactive()
  })

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
