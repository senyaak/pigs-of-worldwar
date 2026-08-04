// Composition root: wires the UI modules together and owns which view is
// visible. No rendering or IPC details live here.

import { byId } from './ui/dom'
import { initWelcome } from './ui/welcome'
import { initFileBrowser } from './ui/fileBrowser'
import { initArchiveView } from './ui/archiveView'
import { initModelViewer } from './ui/modelViewer'

type View = 'welcome' | 'browser' | 'archive' | 'viewer'

const panels: Record<View, HTMLElement[]> = {
  welcome: [byId('welcome')],
  browser: [byId('browser'), byId('file-list')],
  archive: [byId('archive-view')],
  viewer: [byId('viewer')]
}

function show(view: View): void {
  for (const [name, elements] of Object.entries(panels)) {
    for (const element of elements) element.classList.toggle('hidden', name !== view)
  }
}

const browser = initFileBrowser((relPath) => {
  void archive.open(relPath).then((ok) => ok && show('archive'))
})

const archive = initArchiveView(
  (relPath, base) => {
    void viewer.open(relPath, base).then((ok) => ok && show('viewer'))
  },
  () => show('browser')
)

const viewer = initModelViewer(() => show('archive'))

async function showGame(dir: string): Promise<void> {
  byId<HTMLSpanElement>('game-path').textContent = dir
  show('browser')
  await browser.load()
}

initWelcome((dir) => void showGame(dir))

void (async () => {
  const dir = await window.api.getGameDir()
  if (dir) await showGame(dir)
})()
