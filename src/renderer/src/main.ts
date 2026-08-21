// Composition root: wires the UI modules together and owns which view is
// visible. No rendering or IPC details live here.

import { byId } from './ui/dom'
import { controller } from './input/controller'
import type { BarScreenView } from './input/controller'
import { initWelcome } from './ui/welcome'
import { initMenu } from './ui/menu'
import { initOnePlayer } from './ui/onePlayer'
import { initLoadScreen } from './ui/loadScreen'
import { initAskTraining } from './ui/askTraining'
import { initPigMap } from './ui/pigMap'
import { initBriefing } from './ui/briefing'
import { initNewspaper } from './ui/newspaper'
import { initDebrief } from './ui/debrief'
import { initTeamScreen } from './ui/teamScreen'
import { initNameScreen } from './ui/nameScreen'
import { initPlayerScreen } from './ui/playerScreen'
import { initMultiPlayer } from './ui/multiPlayer'
import { initFileBrowser } from './ui/fileBrowser'
import { initArchiveView } from './ui/archiveView'
import { initModelViewer } from './ui/modelViewer'
import { initTerrainViewer } from './ui/terrainViewer'
import { initBattle } from './ui/battle'
import { feText } from './ui/barScreen'
import { installSargeConsole } from './audio/sarge'
import { fall, newSquad, SQUAD_SIZE, standingCount } from '../../lib/game/roster'
import { fieldedAt, mapAt, mapId } from '../../lib/game/missions'
import { nextMap } from '../../lib/game/save'
import { isTrainingGround } from '../../lib/game/tutorial'
import { costOf, promotionsFrom } from '../../lib/game/ranks'
import { promote as promotePig, renamePig, swapPigs } from '../../lib/game/promotion'
import * as campaign from './campaign'
import { bootCampEnemy } from '../../lib/game/nations'

type View =
  | 'welcome'
  | 'menu'
  | 'oneplayer'
  | 'load'
  | 'ask'
  | 'pigmap'
  | 'briefing'
  | 'paper'
  | 'debrief'
  | 'team'
  | 'name'
  | 'player'
  | 'multiplayer'
  | 'battle'
  | 'browser'
  | 'archive'
  | 'viewer'

const panels: Record<View, HTMLElement[]> = {
  welcome: [byId('welcome')],
  menu: [byId('menu')],
  oneplayer: [byId('oneplayer')],
  load: [byId('load')],
  ask: [byId('ask')],
  pigmap: [byId('pigmap')],
  briefing: [byId('briefing')],
  paper: [byId('paper')],
  debrief: [byId('debrief')],
  team: [byId('team')],
  name: [byId('name')],
  player: [byId('player')],
  multiplayer: [byId('multiplayer')],
  battle: [byId('battle')],
  browser: [byId('browser'), byId('file-list')],
  archive: [byId('archive-view')],
  viewer: [byId('viewer')]
}

function show(view: View): void {
  // THE ACTION THAT BROUGHT US HERE IS SPENT. A view change is nearly always
  // something a key did, and every view listens through the one controller
  // gated on being the view that is up — so without this the screen arriving
  // is already "up" while the same action is still being handed down the
  // listener list, and answers it a second time (input/controller.ts).
  controller.stopDispatch()
  for (const [name, elements] of Object.entries(panels)) {
    for (const element of elements) element.classList.toggle('hidden', name !== view)
  }
  // A frontend screen draws and listens only while it is the view — and they
  // share one controller, so the one being left has to stop hearing it.
  for (const [name, screen] of Object.entries(screens)) {
    if (view === name) screen.enter()
    else screen.leave()
  }
  // The two PASSAGES between the squad and a battle are not bar screens, but
  // they hold the controller the same way.
  for (const [name, passage] of Object.entries(passages)) {
    if (view === name) passage.enter()
    else passage.leave()
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

/**
 * WHICH LEVEL a mission opens: the campaign's own, `CAMPAIGN[position]`.
 *
 * This used to be the training ground for every mission of the twenty-six, on
 * the grounds that the levels were not playable. They are: all 53 real maps
 * open, measured one by one, and the only six that refuse are the `GEN*`
 * texture sets, which carry no spawn markers and are not maps. What is still
 * missing is an AI — so a mission is a HOTSEAT, both sides driven from the
 * same keyboard — and a verdict that knows whose side is whose
 * (`docs/todo.md`, section 0A).
 *
 * A battle with no campaign behind it falls back on the training ground.
 */
const NO_CAMPAIGN_MAP = 'CAMP'

/** Whether the battle on screen belongs to the campaign — a MULTI-PLAYER
 * skirmish leaves the way it always has, back to the main menu. */
let campaignBattle = false

/**
 * Which MAP the squad screen's board names while START MISSION is lit. Null
 * once the campaign has run out of missions.
 *
 * **The TRAINING GROUND is skipped, and that is play's ruling over the arm.**
 * The exe names the map the position byte actually points at (`team+0x53`
 * through the order table at 0x4D17F0, 0x428ADF), which at position 0 is BOOT
 * CAMP. Play: "буткэмп это не первая миссия, это своего рода детур — сразу
 * первую показывать надо." So the board names what comes AFTER it while the
 * campaign still stands there. What the action OPENS is unchanged: START
 * MISSION at position 0 still asks about the training ground.
 */
const nextMission = (save: NonNullable<ReturnType<typeof campaign.current>>): string | null => {
  const here = nextMap(save)
  return here && isTrainingGround(here) ? mapAt(save.position + 1) : here
}

/** The squad screen, standing on whatever the campaign now says. */
function toSquad(): void {
  const save = campaign.current()
  if (!save) {
    show('menu')
    return
  }
  playerScreen.show(save.squad, save.name, save.tokens, nextMission(save))
  show('player')
  void playerScreen.load()
}

/**
 * Open the campaign's next mission — through the ORIGINAL's own chain
 * (`pigmap/notes.md`): the world map, the zoom and the region with its flags
 * (position 1 on), then the briefing page, which is the loading screen, and
 * the mission on a key. The training ground (position 0) skips the map and
 * briefs on its own page, the exe's own gate on map id 10.
 */
function startMission(): void {
  const save = campaign.current()
  campaignBattle = true
  if (!save || save.position === 0) {
    toBriefing()
    return
  }
  show('pigmap')
  void pigMap.show(save.position, save.enemies, save.nation)
}

/** The briefing page up, and the battle loading UNDER it. */
function toBriefing(): void {
  const save = campaign.current()
  const position = save?.position ?? 0
  const enemy = save ? (save.enemies[save.position] ?? bootCampEnemy(save.nation)) : null
  show('briefing')
  // …and the same pair dresses the two squads: the player's own nation and
  // whoever this mission is against. The MAP says only where the pigs stand
  // (lib/game/nations.ts, lib/game/spawns.ts).
  const wearing = save && enemy !== null ? [save.nation, enemy] : undefined
  const level = (save && nextMap(save)) || NO_CAMPAIGN_MAP
  // WHO takes the field is the SAVE's: the first `fieldedAt` of the roster,
  // under the team's own name — one pig on the training ground, three at
  // ESTU, five from then on. The roster is packed standing-first by
  // `regroup`, so the front slots are the front line (lib/game/roster.ts).
  const own = save
    ? {
        name: save.name,
        pigs: save.squad
          .slice(0, fieldedAt(position))
          .map((pig) => ({ name: pig.name, pigClass: pig.rank }))
      }
    : undefined
  briefing.show(position, enemy, battle.open(level, wearing, own))
}

// The world map → region → flags sequence, the exe's 0x482C30. Skippable —
// it always ends on the briefing.
const pigMap = initPigMap({
  onDone: () => toBriefing()
})

const briefing = initBriefing({
  onGo: () => show('battle'),
  // A level that will not open is a walk back to the squad, not a hang.
  onFailed: () => toSquad()
})

// How a battle comes back decides where it lands: a walked-out mission goes
// straight to the squad, a decided one goes through the debrief — where a WIN
// is worked out (`campaign.missionWonResult`) and waits to be accepted or
// replayed — nothing of it reaches the disk until CONTINUE does.
//
// **The pause menu's ABORT is not `aborted` — it arrives as a LOSS**, because
// that is what the exe makes it: it writes −2 into the outcome word and falls
// straight into the same debrief call the ordinary end takes, and the page
// asks only `outcome == 0`. There is no MISSION ABORTED screen; gtext 189
// carries those words and has no reader anywhere in the executable. What is
// left calling itself `aborted` is the toolbar's walk-out, which is the
// remake's own button and has no original to be faithful to.
const battle = initBattle((exit, fallen, kills, points) => {
  if (!campaignBattle || !campaign.current()) {
    show('menu')
    return
  }
  if (exit === 'aborted') {
    toSquad()
    return
  }
  const save = campaign.current()
  if (!save) {
    show('menu')
    return
  }
  // The battle's dead land on the ROSTER first, in the order they went down —
  // the original writes `pig+0x2C` on the live team the same way — so the
  // debrief's fates and `missionWonResult`'s losses both read the truth.
  // Never written to disk here: CONTINUE settles it through `acceptMission`,
  // and every other way out stands the squad back up (`discardMission`).
  for (const slot of fallen) fall(save.squad, slot)
  if (exit === 'won') campaign.missionWonResult(kills, points)
  // The debrief reads the save AS THE MISSION FOUND IT — the position still
  // naming the played mission, the squad carrying its fell marks; the settled
  // result waits in `campaign.afterMission()` for CONTINUE to take it.
  debrief.show(exit === 'won', save, points)
  show('debrief')
  void debrief.load()
})

// The keys are the backdrop's own, and each of the four words it paints ends
// up here. A WIN: SPACE is CONTINUE, which takes the settled result — roster,
// position, tokens — writes it, prints the NEWSPAPER (a campaign win only —
// never the training ground, a loss or a retry, the exe's own gates) and
// stands on the squad; ESCAPE is RETRY, which throws the result away and
// takes the field again. A LOSS, and an ABORT with it: SPACE is RETRY (there
// is nothing to take — the manual's "do the level all over again"), ESCAPE is
// EDIT SQUAD, which walks away to the squad with the mission still waiting.
const debrief = initDebrief({
  onContinue: () => {
    const before = campaign.current()
    void campaign.acceptMission().then((after) => {
      if (before && after && before.position > 0 && after.position > before.position) {
        // Of the pigs that actually FOUGHT — one on the training ground,
        // three at ESTU, five from then on — how many came back.
        const survivors = fieldedAt(before.position) - (SQUAD_SIZE - standingCount(before.squad))
        newspaper.show(
          after.nation,
          survivors,
          after.tokens - before.tokens,
          after.position,
          mapId(mapAt(before.position) ?? '')
        )
        show('paper')
        return
      }
      toSquad()
    })
  },
  onRetry: () => {
    campaign.discardMission()
    startMission()
  },
  onEditSquad: () => {
    campaign.discardMission()
    toSquad()
  }
})

const newspaper = initNewspaper({ onDone: () => toSquad() })

// PLAY TRAINING MISSION? — the original's record 39, asked once the campaign
// stands at position 0. YES is the training ground, launched straight; NO
// steps past it (0x42C37E's own move) and launches position 1 through the
// full map chain, exactly the exe's path.
const ask = initAskTraining({
  onYes: () => startMission(),
  onNo: () => {
    void campaign.skipTutorial().then(() => startMission())
  },
  onBack: () => toSquad()
})

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
  onLoadGame: () => {
    show('load')
    void loadScreen.load()
  },
  onBack: () => show('menu')
})

// LOAD GAME: a chosen slot becomes the campaign, and the squad stands up on
// it exactly as it does off a fresh NEW GAME.
const loadScreen = initLoadScreen({
  onLoaded: (entry) => {
    campaign.adopt(entry)
    toSquad()
  },
  onBack: () => show('oneplayer')
})

// The army chosen carries on to PLEASE NAME YOUR TEAM — record 15, the
// original's own next screen (`frontend/notes.md`).
let chosenNation = 0
const teamScreen = initTeamScreen({
  onPick: (nation) => {
    chosenNation = nation
    nameScreen.use('team')
    show('name')
    void nameScreen.load()
  },
  onBack: () => show('oneplayer')
})

/** Which pig RENAME is about, or null while the name entry is the team's. */
let renaming: number | null = null

// The one kind-0 machine names both: the TEAM on the way into a campaign, and
// a PIG off the pig menu — record 13's own max of seven, committed to the
// roster and straight back to the squad, the exe's own path (0x42B118).
const nameScreen = initNameScreen({
  onName: (name) => {
    if (renaming !== null) {
      const slot = renaming
      renaming = null
      void campaign.amend((save) => renamePig(save, slot, name)).then(() => toSquad())
      return
    }
    void startCampaign(name, chosenNation)
  },
  onBack: () => {
    if (renaming !== null) {
      renaming = null
      toSquad()
      return
    }
    show('team')
  }
})

/** An edit went through: the squad screen shows the moved save. */
const refreshSquad = (save: ReturnType<typeof campaign.current>): void => {
  if (save) playerScreen.show(save.squad, save.name, save.tokens, nextMission(save))
}

// …and the squad it raised is the PLAYER screen, record 12: eight pigs, their
// ranks, and START MISSION — which asks about the training ground while the
// campaign stands at position 0, and goes through the MISSION MAP after.
// Choosing a PIG opens the pig menu over it (ui/pigMenu.ts), whose three
// choices land back here: the rules are `lib/game/promotion.ts`, the state is
// the campaign's, and every write autosaves (`campaign.amend`).
const playerScreen = initPlayerScreen({
  onStart: () => {
    const save = campaign.current()
    if (!save) return
    if (save.position === 0) {
      show('ask')
      void ask.load()
      return
    }
    startMission()
  },
  onBack: () => show('name'),
  promote: (slot) => {
    const save = campaign.current()
    const pig = save?.squad[slot]
    if (!save || !pig) return { kind: 'none' }
    const ways = promotionsFrom(pig.rank)
    if (ways.length === 0) return { kind: 'none' }
    if (ways.length > 1) {
      // A GRUNT: the affordability gate runs HERE, the exe's own order —
      // CAREER PATH pays without a second test, all four ways costing one.
      return ways[0].cost > save.tokens ? { kind: 'refused' } : { kind: 'career' }
    }
    const way = ways[0]
    if (way.cost > save.tokens) return { kind: 'refused' }
    void campaign.amend((it) => promotePig(it, slot, way.to)).then(refreshSquad)
    return { kind: 'promoted', cost: way.cost }
  },
  swap: (a, b) => {
    void campaign.amend((it) => swapPigs(it, a, b)).then(refreshSquad)
  },
  rename: (slot) => {
    renaming = slot
    nameScreen.use('pig')
    show('name')
    void nameScreen.load()
  },
  careerPick: (slot, to) => {
    const save = campaign.current()
    const pig = save?.squad[slot]
    if (!save || !pig) return false
    const cost = costOf(pig.rank, to)
    if (cost === null || cost > save.tokens) return false
    void campaign.amend((it) => promotePig(it, slot, to)).then(refreshSquad)
    return true
  }
})

/**
 * Start a campaign: the name the player typed, the army they picked, and the
 * eight pigs that army fields.
 *
 * The squad's names are the nation's own, out of `fetext` — six blocks of ten
 * from 166, the side then its nine pigs (`lib/game/teams.ts`) — and eight is
 * what a squad holds (`lib/game/roster.ts`). The state, the slot and the
 * autosave are `campaign.ts`'s.
 */
async function startCampaign(name: string, nation: number): Promise<void> {
  const pigNames = Array.from({ length: SQUAD_SIZE }, (_, i) => feText(166 + nation * 10 + 1 + i))
  await campaign.begin(name, nation, newSquad(pigNames, []))
  toSquad()
}

const multiPlayer = initMultiPlayer({
  onStart: (map) => {
    campaignBattle = false
    void battle.open(map).then((ok) => ok && show('battle'))
  },
  onBack: () => show('menu')
})

/** The frontend's screens, by the view that shows them. Only one of them may
 * be drawing and hearing the controller at a time. */
const screens = {
  menu,
  oneplayer: onePlayer,
  load: loadScreen,
  ask,
  team: teamScreen,
  name: nameScreen,
  player: playerScreen,
  multiplayer: multiPlayer
}
/**
 * …and the mission chain's four, which have no bars to read. The DEBRIEF
 * belongs here too now: it started life as a bar machine and became the
 * original's own page, whose two keys are painted into the backdrop, so there
 * is no cursor to report and no rows to name.
 */
const passages = { pigmap: pigMap, briefing, paper: newspaper, debrief }
byId<HTMLButtonElement>('browser-menu').addEventListener('click', () => show('menu'))

// The frontend is drawn on a canvas, so what a screen says and which bar is
// lit are only readable through here (docs/testing.md) — and where its
// furniture sits is eyework, so the layout is editable from the console the
// same way the dashboard's is.
/**
 * Where a session's console nudges are kept between runs.
 *
 * **v2 stores the DIFFERENCE from the code, not the whole layout**, and the
 * key moved so the old snapshots die with the old rule. What v1 did was
 * write every number the screens were carrying and lay all of them back over
 * the code on the next run — which means the moment anything was nudged once,
 * that machine stopped seeing changes to ANY layout number for good. Play hit
 * it head on: three numbers moved in the source (the squad name's drop, START
 * MISSION's row and its words) and none of them appeared, because a snapshot
 * taken weeks earlier was painted over them at start-up.
 */
const LAYOUT_KEY = 'pow.screen.layout.v2'
/** v1's key, thrown away on sight — see above. */
const LAYOUT_KEY_V1 = 'pow.screen.layout'

if (window.pow) {
  const view = (screen: (typeof screens)[keyof typeof screens]): BarScreenView => ({
    selected: screen.selected,
    labels: screen.labels,
    values: screen.values,
    flipping: screen.flipping
  })
  // THE SERGEANT, from the app's own start rather than from a battle: which of
  // his 22 categories belongs to which moment is an EAR's question, the lines
  // carry no subtitles anywhere, and browsing them should not need a mission
  // open (audio/sarge.ts). `pow.sarge.list()` says what is known.
  installSargeConsole()
  window.pow.menu = view(menu)
  window.pow.onePlayer = view(onePlayer)
  window.pow.loadScreen = view(loadScreen)
  window.pow.askTraining = view(ask)
  // The map chain is not a bar screen: what a spec needs is which phase the
  // map stands in and whether the briefing would take a key.
  window.pow.pigMap = { phase: pigMap.phase, patches: pigMap.patches, flags: pigMap.flags }
  window.pow.briefing = { ready: briefing.ready }
  window.pow.teamScreen = view(teamScreen)
  window.pow.nameScreen = { ...view(nameScreen), typed: nameScreen.typed, type: nameScreen.type }
  // …and the SQUAD screen carries one more read than the rack does: what its
  // BOARD is saying (ui/playerScreen.ts).
  window.pow.playerScreen = { ...view(playerScreen), board: playerScreen.board }
  // The squad's two overlays read through the same window, plus whether each
  // is up at all.
  window.pow.pigMenu = playerScreen.menu
  window.pow.careerPath = playerScreen.career
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
      ),
    /**
     * Throw the saved nudges away and go back to what the code says.
     *
     * **`keep` is why this used to be a no-op**, and play found it the hard
     * way — "я нечайно поломал лэйаут, и резет не спасает". Clearing the key
     * and reloading fires `beforeunload` on the way out, which wrote the LIVE
     * layout — the broken one, still in memory — straight back into the key
     * that had just been emptied. So the reset is a promise not to save.
     */
    reset: () => {
      keep = false
      localStorage.removeItem(LAYOUT_KEY)
      localStorage.removeItem(LAYOUT_KEY_V1)
      location.reload()
    }
  }
  /** Whether the way out should write anything down (see `reset`). */
  let keep = true

  // **A nudge SURVIVES the window closing.** An evening of moving furniture in
  // the console used to die with the app — the layouts live in the renderer's
  // memory and nothing wrote them anywhere. They are stashed on the way out and
  // laid back over the code's own numbers on the way in, so the only way to
  // lose a session's tuning now is `pow.screen.reset()`.
  const soak = (into: Record<string, unknown>, from: Record<string, unknown>): void => {
    for (const [key, value] of Object.entries(from)) {
      const there = into[key]
      if (Array.isArray(there) && Array.isArray(value)) {
        // An array of GROUPS — the player screen's columns — soaks element by
        // element, so a renamed knob inside one is dropped like any other.
        value.forEach((item, i) => {
          const slot = there[i]
          if (slot && typeof slot === 'object' && item && typeof item === 'object') {
            soak(slot as Record<string, unknown>, item as Record<string, unknown>)
          } else if (typeof slot === typeof item) {
            there[i] = item
          }
        })
      } else if (there && typeof there === 'object' && value && typeof value === 'object') {
        soak(there as Record<string, unknown>, value as Record<string, unknown>)
      } else if (typeof there === typeof value) {
        into[key] = value
      }
    }
  }
  /**
   * What one layout carries that the CODE's own does not — the nudges alone,
   * as a tree of only the leaves that differ. An empty branch is left out
   * entirely, so a screen nobody touched saves nothing at all.
   */
  const nudges = (live: unknown, base: unknown): unknown => {
    if (Array.isArray(live) && Array.isArray(base)) {
      const out: Record<string, unknown> = {}
      live.forEach((item, i) => {
        const diff = nudges(item, base[i])
        if (diff !== undefined) out[String(i)] = diff
      })
      return Object.keys(out).length > 0 ? out : undefined
    }
    if (live && base && typeof live === 'object' && typeof base === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(live as Record<string, unknown>)) {
        const diff = nudges(value, (base as Record<string, unknown>)[key])
        if (diff !== undefined) out[key] = diff
      }
      return Object.keys(out).length > 0 ? out : undefined
    }
    return live === base ? undefined : live
  }

  // The code's own numbers, taken BEFORE anything saved is laid over them:
  // what the diff on the way out is measured against.
  const asCode = JSON.parse(JSON.stringify(window.pow.screen.print()))
  // v1's whole-layout snapshots are not a diff and would smother the code the
  // way they have been doing; the key is simply dropped.
  localStorage.removeItem(LAYOUT_KEY_V1)
  try {
    const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null')
    if (saved) {
      for (const [name, screen] of Object.entries(screens)) {
        if (saved[name]) soak(screen.layout as Record<string, unknown>, saved[name])
      }
      console.info('pow: layout nudges restored — pow.screen.reset() throws them away')
    }
  } catch (error) {
    console.warn(`pow: the saved layout would not load (${String(error)})`)
  }
  window.addEventListener('beforeunload', () => {
    if (!keep) return
    // ONLY what was moved. Everything else follows the source, so a number
    // changed in `ui/*.ts` lands on the next run instead of being painted over
    // by a snapshot of the way things used to be.
    const moved = nudges(window.pow?.screen?.print() ?? {}, asCode)
    if (moved === undefined) localStorage.removeItem(LAYOUT_KEY)
    else localStorage.setItem(LAYOUT_KEY, JSON.stringify(moved))
  })
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
