// The battle view (phase 002): New Game lands here — ARCHI with two squads,
// a turn HUD and an End Turn button. Assets come through the same IPCs the
// debug viewers use; the rules live in lib/game.

import { Game } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { ensureScene } from '../three/scene'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
import { controller } from '../input/controller'
import { byId } from './dom'

// The training ground — the first map the original ever shows a player, and
// the friendliest to test on: barely any water, one big usable field.
const MAP = 'Maps/CAMP.PMG'
const CHAR_ARCHIVE = 'Chars/british.mad'
const SOLDIER = 'pcgru_hi'

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

  return {
    async open() {
      const [terrainResult, modelResult, clipsResult] = await Promise.all([
        window.api.loadTerrain(MAP),
        window.api.loadModel(CHAR_ARCHIVE, SOLDIER),
        window.api.loadClips(CHAR_ARCHIVE)
      ])
      if (!terrainResult.ok) {
        hudEl.textContent = terrainResult.error
        return false
      }
      if (!modelResult.ok) {
        hudEl.textContent = modelResult.error
        return false
      }

      query = new TerrainQuery(terrainResult.blocks)
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
          clips: clipsResult.ok ? clipsResult.clips : []
        },
        game,
        updateHudText
      )
      updateHud()
      return true
    },
    close() {
      scene?.dispose()
      scene = null
      game = null
    }
  }
}
