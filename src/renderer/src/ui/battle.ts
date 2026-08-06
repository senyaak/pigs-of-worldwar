// The battle view (phase 002): New Game lands here — ARCHI with two squads,
// a turn HUD and an End Turn button. Assets come through the same IPCs the
// debug viewers use; the rules live in lib/game.

import { Game } from '../../../lib/game/game'
import type { PigSpawn } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildWaterMask } from '../../../lib/game/watermask'
import { playableSides } from '../../../lib/game/spawns'
import { artFor } from '../three/soldiers'
import type { LoadModelResult, MapObject } from '../api'
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

/** 'artgun', 'ARTGUN.PMG' and 'Maps/ARTGUN.PMG' all mean ARTGUN. */
const normalizeMap = (name: string): string =>
  name
    .trim()
    .replace(/^maps[\\/]/i, '')
    .replace(/\.pmg$/i, '')
    .toUpperCase()

// Enough names for the biggest side any shipped map fields; a squad takes
// as many as it has spawn markers.
const SQUADS = [
  {
    name: 'Tommy’s Trotters',
    pigNames: ['Tommy', 'Wilson', 'Berry', 'Hogsworth', 'Bacon', 'Rasher', 'Chops', 'Snout']
  },
  {
    name: 'Kaiser’s Grunters',
    pigNames: ['Hans', 'Fritz', 'Otto', 'Schweinrich', 'Klaus', 'Dieter', 'Wurst', 'Speck']
  }
]

/** Pigs per side when the map names no sides of its own. */
const FALLBACK_SQUAD = 4

export interface BattleView {
  open(): Promise<boolean>
  close(): void
}

interface Squad {
  name: string
  pigNames: string[]
  spawns: PigSpawn[]
}

/**
 * The two squads for a map: its OWN spawn markers where it has them, and
 * ground picked off the terrain where it does not.
 *
 * A skirmish arena fields four sides of five and a campaign map two, each
 * marker naming the class that stands on it — so a squad is as big as the
 * map says and dressed the way the map says. CAMP is the exception the
 * fallback exists for: one marker, because it is the training ground.
 */
function mapSquads(objects: MapObject[], query: TerrainQuery): Squad[] {
  const sides = playableSides(objects, SQUADS.length)
  if (!sides) {
    const spawns = query.pickSpawns(SQUADS.length * FALLBACK_SQUAD)
    return SQUADS.map((squad, index) => ({
      name: squad.name,
      pigNames: squad.pigNames.slice(0, FALLBACK_SQUAD),
      spawns: spawns.slice(index * FALLBACK_SQUAD, (index + 1) * FALLBACK_SQUAD)
    }))
  }
  return SQUADS.map((squad, index) => {
    const side = sides[index].slice(0, squad.pigNames.length)
    return {
      name: squad.name,
      pigNames: squad.pigNames.slice(0, side.length),
      spawns: side.map((at) => ({
        x: at.x,
        z: at.z,
        heading: at.heading,
        pigClass: at.pigClass
      }))
    }
  })
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
    const [terrainResult, objectsResult, clipsResult] = await Promise.all([
      window.api.loadTerrain(`Maps/${name}.PMG`),
      window.api.loadMapObjects(`Maps/${name}.POG`),
      window.api.loadClips(CHAR_ARCHIVE)
    ])
    if (!terrainResult.ok) {
      // A failed SWAP is a console conversation; a failed OPEN has no scene
      // to keep, so the HUD carries the message.
      if (scene) console.log(`stayed on ${map}: ${terrainResult.error}`)
      else hudEl.textContent = terrainResult.error
      return false
    }

    if (!objectsResult.ok) console.log(`${name} without its objects: ${objectsResult.error}`)

    query = new TerrainQuery(
      terrainResult.blocks,
      buildWaterMask(terrainResult.blocks, terrainResult.textures)
    )
    const squads = mapSquads(objectsResult.ok ? objectsResult.objects : [], query)

    // Which models to load is only known once the squads are: a map fields
    // the classes its own markers name.
    const bases = artFor(squads.flatMap((squad) => squad.spawns.map((at) => at.pigClass ?? 0)))
    const loaded = await Promise.all(bases.map((base) => window.api.loadModel(CHAR_ARCHIVE, base)))
    const missing = loaded.findIndex((result) => !result.ok)
    if (missing >= 0) {
      const error = (loaded[missing] as { ok: false; error: string }).error
      if (scene) console.log(`stayed on ${map}: ${error}`)
      else hudEl.textContent = error
      return false
    }
    const soldiers = bases.map((base, index) => {
      const result = loaded[index] as Extract<LoadModelResult, { ok: true }>
      return { base, model: result.model, textures: result.textures }
    })

    game = new Game({
      players: squads.map((squad) => ({ name: squad.name, pigNames: squad.pigNames })),
      spawns: squads.flatMap((squad) => squad.spawns)
    })

    scene?.dispose()
    scene = buildBattle(
      ensureScene(canvasHost),
      {
        blocks: terrainResult.blocks,
        terrainTextures: terrainResult.textures,
        soldiers,
        skeleton: (loaded[0] as Extract<LoadModelResult, { ok: true }>).skeleton,
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
