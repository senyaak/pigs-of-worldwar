// The main menu — the game's frame (phase 001). Background is the original
// frontend art (pigbkpc1.mgl out of FEBMP.MAD, MGL → BMP → canvas). Items:
// New Game, Asset Viewer (the debug browsers), Exit.

import { byId } from './dom'

export interface Menu {
  /** Decode and paint the background; safe to call once per session. */
  load(): Promise<void>
}

export function initMenu(handlers: {
  onNewGame: () => void
  onAssets: () => void
}): Menu {
  const canvas = byId<HTMLCanvasElement>('menu-bg')
  byId<HTMLButtonElement>('menu-new-game').addEventListener('click', handlers.onNewGame)
  byId<HTMLButtonElement>('menu-assets').addEventListener('click', handlers.onAssets)
  byId<HTMLButtonElement>('menu-exit').addEventListener('click', () => void window.api.quit())

  let loaded = false
  return {
    async load() {
      if (loaded) return
      const result = await window.api.loadFrontendImage('pigbkpc1.mgl')
      if (!result.ok) {
        // A missing FEBMP.MAD (stripped/fake install) is not fatal — the
        // menu just goes without its art. warn, not error: the e2e suite
        // treats console.error as a failed run (docs/testing.md).
        console.warn(result.error)
        return
      }
      const { width, height, rgba } = result.image
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const pixels = new Uint8ClampedArray(rgba.byteLength)
      pixels.set(rgba)
      ctx.putImageData(new ImageData(pixels, width, height), 0, 0)
      loaded = true
    }
  }
}
