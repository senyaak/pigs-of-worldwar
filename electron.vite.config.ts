import { resolve } from 'node:path'

import { defineConfig } from 'electron-vite'

// TWO entries in the main build, not one. `index` is the app's lifecycle;
// `brain` is the AI's own Node process (src/brain/), forked by it — a turn's
// plan floods the whole map and used to do it on the frame the renderer was
// about to draw. electron-vite emits one file per input into `out/main/`, and
// `utilityProcess.fork` wants a path, so `brain.js` lands beside `index.js`.
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          brain: resolve(__dirname, 'src/brain/index.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {}
})
