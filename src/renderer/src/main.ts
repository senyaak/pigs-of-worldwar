// Composition root: wires the UI modules together and owns which view is
// visible. No rendering or IPC details live here.

import { byId } from './ui/dom'
import { initWelcome } from './ui/welcome'
import { initMenu } from './ui/menu'
import { initMultiPlayer } from './ui/multiPlayer'
import { initFileBrowser } from './ui/fileBrowser'
import { initArchiveView } from './ui/archiveView'
import { initModelViewer } from './ui/modelViewer'
import { initTerrainViewer } from './ui/terrainViewer'
import { initBattle } from './ui/battle'

type View = 'welcome' | 'menu' | 'multiplayer' | 'battle' | 'browser' | 'archive' | 'viewer'

const panels: Record<View, HTMLElement[]> = {
  welcome: [byId('welcome')],
  menu: [byId('menu')],
  multiplayer: [byId('multiplayer')],
  battle: [byId('battle')],
  browser: [byId('browser'), byId('file-list')],
  archive: [byId('archive-view')],
  viewer: [byId('viewer')]
}

function show(view: View): void {
  for (const [name, elements] of Object.entries(panels)) {
    for (const element of elements) element.classList.toggle('hidden', name !== view)
  }
  // A frontend screen draws and listens only while it is the view — and they
  // share one controller, so the one being left has to stop hearing it.
  if (view === 'menu') menu.enter()
  else menu.leave()
  if (view === 'multiplayer') multiPlayer.enter()
  else multiPlayer.leave()
}

// The viewer panel is shared by models (opened from an archive) and terrain
// (opened from the file list) — Back returns to wherever it was opened from.
let viewerOrigin: View = 'archive'

const browser = initFileBrowser((relPath) => {
  if (/\.pmg$/i.test(relPath)) {
    void terrain.open(relPath).then((ok) => {
      if (ok) {
        viewerOrigin = 'browser'
        show('viewer')
      }
    })
    return
  }
  void archive.open(relPath).then((ok) => ok && show('archive'))
})

const archive = initArchiveView(
  (relPath, base) => {
    void viewer.open(relPath, base).then((ok) => {
      if (ok) {
        viewerOrigin = 'archive'
        show('viewer')
      }
    })
  },
  () => show('browser')
)

const viewer = initModelViewer(() => show(viewerOrigin))
const terrain = initTerrainViewer()

const battle = initBattle(() => show('menu'))

const menu = initMenu({
  onNewGame: () => {
    void battle.open().then((ok) => ok && show('battle'))
  },
  onMultiPlayer: () => {
    show('multiplayer')
    void multiPlayer.load()
  },
  onAssets: () => {
    show('browser')
    void browser.load()
  }
})

const multiPlayer = initMultiPlayer({
  onStart: (map) => {
    void battle.open(map).then((ok) => ok && show('battle'))
  },
  onBack: () => show('menu')
})
byId<HTMLButtonElement>('browser-menu').addEventListener('click', () => show('menu'))

// The frontend is drawn on a canvas, so what a screen says and which bar is
// lit are only readable through here (docs/testing.md) — and where its
// furniture sits is eyework, so the layout is editable from the console the
// same way the dashboard's is.
if (window.pow) {
  window.pow.menu = { selected: menu.selected, labels: menu.labels, values: menu.values }
  window.pow.multiPlayer = {
    selected: multiPlayer.selected,
    labels: multiPlayer.labels,
    values: multiPlayer.values
  }
  window.pow.screen = {
    layout: menu.layout,
    print: () => JSON.parse(JSON.stringify(menu.layout))
  }
}

// A located game lands on the main menu; the asset browsers hang off it.
async function showGame(dir: string): Promise<void> {
  byId<HTMLSpanElement>('game-path').textContent = dir
  show('menu')
  await menu.load()
}

initWelcome((dir) => void showGame(dir))

void (async () => {
  const dir = await window.api.getGameDir()
  if (dir) await showGame(dir)
})()
