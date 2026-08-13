// Composition root: wires the UI modules together and owns which view is
// visible. No rendering or IPC details live here.

import { byId } from './ui/dom'
import type { BarScreenView } from './input/controller'
import { initWelcome } from './ui/welcome'
import { initMenu } from './ui/menu'
import { initOnePlayer } from './ui/onePlayer'
import { initTeamScreen } from './ui/teamScreen'
import { initNameScreen } from './ui/nameScreen'
import { initMultiPlayer } from './ui/multiPlayer'
import { initFileBrowser } from './ui/fileBrowser'
import { initArchiveView } from './ui/archiveView'
import { initModelViewer } from './ui/modelViewer'
import { initTerrainViewer } from './ui/terrainViewer'
import { initBattle } from './ui/battle'
import { feText } from './ui/barScreen'
import { newSquad, SQUAD_SIZE } from '../../lib/game/roster'
import { newGame, serialise } from '../../lib/game/save'

type View =
  | 'welcome'
  | 'menu'
  | 'oneplayer'
  | 'team'
  | 'name'
  | 'multiplayer'
  | 'battle'
  | 'browser'
  | 'archive'
  | 'viewer'

const panels: Record<View, HTMLElement[]> = {
  welcome: [byId('welcome')],
  menu: [byId('menu')],
  oneplayer: [byId('oneplayer')],
  team: [byId('team')],
  name: [byId('name')],
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
  for (const [name, screen] of Object.entries(screens)) {
    if (view === name) screen.enter()
    else screen.leave()
  }
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
    show('oneplayer')
    void onePlayer.load()
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

const onePlayer = initOnePlayer({
  onNewGame: () => {
    show('team')
    void teamScreen.load()
  },
  onBack: () => show('menu')
})

// The army chosen carries on to PLEASE NAME YOUR TEAM — record 15, the
// original's own next screen (`frontend/notes.md`).
let chosenNation = 0
const teamScreen = initTeamScreen({
  onPick: (nation) => {
    chosenNation = nation
    show('name')
    void nameScreen.load()
  },
  onBack: () => show('oneplayer')
})

// And the name closes the last gap in front of `newGame`: a campaign has a
// team, a nation and a squad of eight. Starting the battle is still the
// training ground until there is a briefing to go through.
const nameScreen = initNameScreen({
  onName: (name) => {
    void startCampaign(name, chosenNation)
  },
  onBack: () => show('team')
})

/**
 * Start a campaign: the name the player typed, the army they picked, and the
 * eight pigs that army fields.
 *
 * The squad's names are the nation's own, out of `fetext` — six blocks of ten
 * from 166, the side then its nine pigs (`lib/game/teams.ts`) — and eight is
 * what a squad holds (`lib/game/roster.ts`). The slot is the original's own
 * `savearmy0`; ours is JSON beside it in the checkout's `saves/`, never in the
 * game folder (`src/main/saves.ts`).
 *
 * A save that will not write does NOT stop the battle: the player asked to
 * play, and losing the file is worth a warning rather than a dead button.
 */
const SLOT = 'savearmy0'

async function startCampaign(name: string, nation: number): Promise<void> {
  const pigNames = Array.from({ length: SQUAD_SIZE }, (_, i) => feText(166 + nation * 10 + 1 + i))
  const squad = newSquad(pigNames, [])
  const save = newGame(name, nation, squad, new Date().toISOString())
  const written = await window.api.writeSave(SLOT, serialise(save))
  if (!written.ok) console.warn(`the campaign was not saved: ${written.error}`)
  const ok = await battle.open()
  if (ok) show('battle')
}

const multiPlayer = initMultiPlayer({
  onStart: (map) => {
    void battle.open(map).then((ok) => ok && show('battle'))
  },
  onBack: () => show('menu')
})

/** The frontend's screens, by the view that shows them. Only one of them may
 * be drawing and hearing the controller at a time. */
const screens = {
  menu,
  oneplayer: onePlayer,
  team: teamScreen,
  name: nameScreen,
  multiplayer: multiPlayer
}
byId<HTMLButtonElement>('browser-menu').addEventListener('click', () => show('menu'))

// The frontend is drawn on a canvas, so what a screen says and which bar is
// lit are only readable through here (docs/testing.md) — and where its
// furniture sits is eyework, so the layout is editable from the console the
// same way the dashboard's is.
if (window.pow) {
  const view = (screen: (typeof screens)[keyof typeof screens]): BarScreenView => ({
    selected: screen.selected,
    labels: screen.labels,
    values: screen.values,
    flipping: screen.flipping
  })
  window.pow.menu = view(menu)
  window.pow.onePlayer = view(onePlayer)
  window.pow.teamScreen = view(teamScreen)
  window.pow.nameScreen = { ...view(nameScreen), typed: nameScreen.typed, type: nameScreen.type }
  window.pow.multiPlayer = view(multiPlayer)
  // Each screen carries its OWN layout, so a nudge in the console moves the
  // screen being looked at rather than all of them.
  window.pow.screen = {
    layout: Object.fromEntries(
      Object.entries(screens).map(([name, screen]) => [name, screen.layout])
    ),
    print: () =>
      JSON.parse(
        JSON.stringify(
          Object.fromEntries(Object.entries(screens).map(([n, s]) => [n, s.layout]))
        )
      )
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
