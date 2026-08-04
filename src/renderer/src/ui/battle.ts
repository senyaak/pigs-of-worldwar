// The battle view (phase 002): New Game lands here — ARCHI with two squads,
// a turn HUD and an End Turn button. Assets come through the same IPCs the
// debug viewers use; the rules live in lib/game.

import { Game } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { ensureScene } from '../three/scene'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
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
  }

  const updateHud = (): void => {
    if (!game) return
    updateHudText()
    scene?.focus(game.currentPig)
  }

  byId<HTMLButtonElement>('battle-end-turn').addEventListener('click', () => {
    game?.endTurn()
    updateHud()
  })

  // Tank controls, original style: W/S walk forward/back, A/D turn on the
  // spot, Space jumps. Active only while the battle view is up.
  const battleEl = byId<HTMLDivElement>('battle')
  const held = new Set<string>()
  const pushIntent = (): void => {
    let walk = 0
    let turn = 0
    if (held.has('KeyW') || held.has('ArrowUp')) walk += 1
    if (held.has('KeyS') || held.has('ArrowDown')) walk -= 1
    if (held.has('KeyA') || held.has('ArrowLeft')) turn -= 1
    if (held.has('KeyD') || held.has('ArrowRight')) turn += 1
    scene?.setIntent(walk, turn)
  }
  window.addEventListener('keydown', (event) => {
    if (battleEl.classList.contains('hidden')) return
    if (event.code === 'Space') {
      if (!event.repeat) scene?.jump()
      return
    }
    held.add(event.code)
    pushIntent()
  })
  window.addEventListener('keyup', (event) => {
    held.delete(event.code)
    pushIntent()
  })

  byId<HTMLButtonElement>('battle-leave').addEventListener('click', () => {
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
