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

  const updateHudText = (): void => {
    if (!game) return
    hudEl.textContent =
      `Turn ${game.turn} — ${game.currentPlayer.name}: ${game.currentPig.name} ` +
      `(${game.currentPig.health} hp, move ${Math.round(game.remainingMove)})`
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

  // WASD / arrows drive the acting pig while the battle view is up.
  const battleEl = byId<HTMLDivElement>('battle')
  const held = new Set<string>()
  const pushIntent = (): void => {
    let x = 0
    let z = 0
    if (held.has('KeyA') || held.has('ArrowLeft')) x -= 1
    if (held.has('KeyD') || held.has('ArrowRight')) x += 1
    if (held.has('KeyW') || held.has('ArrowUp')) z += 1
    if (held.has('KeyS') || held.has('ArrowDown')) z -= 1
    scene?.setIntent(x, z)
  }
  window.addEventListener('keydown', (event) => {
    if (battleEl.classList.contains('hidden')) return
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

      const query = new TerrainQuery(terrainResult.blocks)
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
