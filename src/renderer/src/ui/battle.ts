// The battle view (phase 002): New Game lands here — ARCHI with two squads,
// a turn HUD and an End Turn button. Assets come through the same IPCs the
// debug viewers use; the rules live in lib/game.

import { Game } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildWaterMask } from '../../../lib/game/watermask'
import { ensureScene } from '../three/scene'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
import { controller } from '../input/controller'
import { byId } from './dom'

// The training ground — the first map the original ever shows a player, and
// the friendliest to test on: barely any water, one big usable field.
// `pow.swapMap('ARTGUN')` in the console restarts the battle elsewhere —
// CAMP has no climbing ground at all, so the Scramble only shows on maps
// like ARTGUN or ICEFLOW.
const DEFAULT_MAP = 'CAMP'
const CHAR_ARCHIVE = 'Chars/british.mad'
const SOLDIER = 'pcgru_hi'

/** 'artgun', 'ARTGUN.PMG' and 'Maps/ARTGUN.PMG' all mean ARTGUN. */
const normalizeMap = (name: string): string =>
  name
    .trim()
    .replace(/^maps[\\/]/i, '')
    .replace(/\.pmg$/i, '')
    .toUpperCase()

const SQUADS = [
  { name: 'Tommy’s Trotters', pigNames: ['Tommy', 'Wilson', 'Berry', 'Hogsworth'] },
  { name: 'Kaiser’s Grunters', pigNames: ['Hans', 'Fritz', 'Otto', 'Schweinrich'] }
]

export interface BattleView {
  open(): Promise<boolean>
  close(): void
}

export function initBattle(onLeave: () => void): BattleView {
  const hudEl = byId<HTMLSpanElement>('battle-hud')
  // Separate from the HUD on purpose: this is for reporting a tile that
  // looks wrong, and the HUD's text is asserted verbatim by the e2e suite.
  const tileEl = byId<HTMLSpanElement>('battle-tile')
  const canvasHost = byId<HTMLDivElement>('battle-canvas')

  let game: Game | null = null
  let scene: BattleScene | null = null
  let query: TerrainQuery | null = null
  let map = DEFAULT_MAP

  const updateHudText = (): void => {
    if (!game) return
    const { x, z } = game.currentPig.position
    const swimming = query?.isWater(x, z) ? ', swimming' : ''
    hudEl.textContent =
      `Turn ${game.turn} — ${game.currentPlayer.name}: ${game.currentPig.name} ` +
      `(${game.currentPig.health} hp, ${Math.max(0, Math.ceil(game.timeLeft))}s${swimming})`
    const tile = query?.tileAddress(x, z)
    tileEl.textContent = tile
      ? `tile ${tile.col},${tile.row}  tex ${tile.texture}  byte ${tile.rotateFlip}  type 0x${tile.type.toString(16)}`
      : ''
  }

  const updateHud = (): void => {
    if (!game) return
    updateHudText()
    scene?.focus(game.currentPig)
  }

  // The button is just another way to fire the action.
  byId<HTMLButtonElement>('battle-end-turn').addEventListener('click', () => {
    controller.press('endTurn')
  })

  // Tank controls, original style — but the battle view never touches keys:
  // it listens to the controller, which the keyboard AND the e2e suite drive
  // through the same three methods (input/controller.ts).
  const battleEl = byId<HTMLDivElement>('battle')
  const isBattleUp = (): boolean => !battleEl.classList.contains('hidden')

  const pushIntent = (): void => {
    const walk = (controller.isDown('walkForward') ? 1 : 0) - (controller.isDown('walkBack') ? 1 : 0)
    const turn = (controller.isDown('turnRight') ? 1 : 0) - (controller.isDown('turnLeft') ? 1 : 0)
    scene?.setIntent(walk, turn)
  }
  controller.onChange(pushIntent)
  controller.onAction((action) => {
    if (!isBattleUp()) return
    if (action === 'jump') scene?.jump()
    if (action === 'endTurn') {
      game?.endTurn()
      updateHud()
    }
  })
  controller.bindKeyboard(isBattleUp)

  byId<HTMLButtonElement>('battle-leave').addEventListener('click', () => {
    controller.releaseAll()
    scene?.dispose()
    scene = null
    game = null
    onLeave()
  })

  /** (Re)start the battle on `name` — fresh spawns, fresh turn order. A load
   * failure leaves whatever battle was running untouched. */
  const start = async (name: string): Promise<boolean> => {
    const [terrainResult, objectsResult, modelResult, clipsResult] = await Promise.all([
      window.api.loadTerrain(`Maps/${name}.PMG`),
      window.api.loadMapObjects(`Maps/${name}.POG`),
      window.api.loadModel(CHAR_ARCHIVE, SOLDIER),
      window.api.loadClips(CHAR_ARCHIVE)
    ])
    const failure = !terrainResult.ok ? terrainResult.error : !modelResult.ok ? modelResult.error : null
    if (failure !== null || !terrainResult.ok || !modelResult.ok) {
      // A failed SWAP is a console conversation; a failed OPEN has no scene
      // to keep, so the HUD carries the message.
      if (scene) console.log(`stayed on ${map}: ${failure}`)
      else hudEl.textContent = failure ?? ''
      return false
    }

    if (!objectsResult.ok) console.log(`${name} without its objects: ${objectsResult.error}`)

    query = new TerrainQuery(
      terrainResult.blocks,
      buildWaterMask(terrainResult.blocks, terrainResult.textures)
    )
    const pigCount = SQUADS.reduce((sum, s) => sum + s.pigNames.length, 0)
    game = new Game({ players: SQUADS, spawns: query.pickSpawns(pigCount) })

    scene?.dispose()
    scene = buildBattle(
      ensureScene(canvasHost),
      {
        blocks: terrainResult.blocks,
        terrainTextures: terrainResult.textures,
        model: modelResult.model,
        modelTextures: modelResult.textures,
        skeleton: modelResult.skeleton,
        clips: clipsResult.ok ? clipsResult.clips : [],
        // A map without its props is still playable ground, so a failed POG
        // is reported and stepped over rather than taking the battle down.
        objects: objectsResult.ok ? objectsResult.objects : [],
        props: objectsResult.ok ? objectsResult.props : [],
        propTextures: objectsResult.ok ? objectsResult.textures : []
      },
      game,
      updateHudText
    )
    map = name
    updateHud()
    return true
  }

  // The console IS the map selector — no UI for it, by request. `pow.swapMap()`
  // with no argument lists what ships; with a name it restarts the battle
  // there. The scene rebuild re-merges `pow.debug`, so the spread keeps this.
  window.pow = {
    ...(window.pow ?? { controller }),
    map: () => map,
    swapMap: async (name?: string) => {
      if (!name) {
        const files = await window.api.listFiles()
        const maps = files
          .map((f) => f.path.match(/^Maps[\\/](.+)\.PMG$/i)?.[1])
          .filter((n): n is string => n !== undefined)
          .sort()
        console.log(`usage: pow.swapMap('ARTGUN') — shipping maps: ${maps.join(', ')}`)
        return false
      }
      if (!scene) {
        console.log('no battle is up — start one from the menu first')
        return false
      }
      return start(normalizeMap(name))
    }
  }

  return {
    open: () => start(map),
    close() {
      scene?.dispose()
      scene = null
      game = null
    }
  }
}
