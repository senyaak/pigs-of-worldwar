// The battle view (phase 002): New Game lands here, on the map's OWN
// squads — a turn HUD and an End Turn button over them. Assets come through
// the same IPCs the debug viewers use; the rules live in lib/game.

import { Game } from '../../../lib/game/game'
import type { PigSpawn } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildWaterMask } from '../../../lib/game/watermask'
import { battleSides } from '../../../lib/game/spawns'
import { nations } from '../../../lib/game/teams'
import type { Team } from '../../../lib/game/teams'
import { artFor } from '../three/soldiers'
import { existsForPlayers } from '../../../lib/formats/pog'
import type { LoadModelResult, MapObject } from '../api'
import { ensureScene } from '../three/scene'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
import { controller } from '../input/controller'
import { createHud } from './hud'
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

/**
 * How many sides a battle fields. The markers name up to six (FINAL uses
 * all of them), but there is no AI for the rest, so the first two the map
 * carries are the ones that play — and WHICH two is the map's own business:
 * a marker's side bit is the nation (lib/game/teams.ts).
 */
const SIDES_FIELDED = 2

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
 * The squads for a map, and ONLY what the map has: one side per set of
 * spawn markers, each pig standing on the marker that named its class.
 *
 * A skirmish arena fields four sides of five and a campaign map two, of
 * which the first two are taken. CAMP fields one side of one pig, because
 * the training ground is one pig — there is no filling in, and a map that
 * carries no markers cannot be played.
 */
function mapSquads(objects: MapObject[], teams: Team[]): Squad[] {
  return battleSides(objects, SIDES_FIELDED).map((side, index) => {
    // The side bit the map set IS the nation; a map with a bit no nation
    // answers to falls back on the order it was found in.
    const team = teams[side[0]?.team] ?? teams[index]
    const pigs = side.slice(0, team.pigNames.length)
    return {
      name: team.name,
      pigNames: team.pigNames.slice(0, pigs.length),
      spawns: pigs.map((at) => ({
        x: at.x,
        z: at.z,
        heading: at.heading,
        pigClass: at.pigClass
      }))
    }
  })
}

export function initBattle(onLeave: () => void): BattleView {
  const canvasHost = byId<HTMLDivElement>('battle-canvas')
  const hudCanvas = byId<HTMLCanvasElement>('battle-hud')
  const hud = createHud(hudCanvas)
  // Nothing to do with the dashboard: this is the debug readout for
  // reporting a tile that looks wrong in play.
  const tileEl = byId<HTMLSpanElement>('battle-tile')

  let game: Game | null = null
  let scene: BattleScene | null = null
  let query: TerrainQuery | null = null
  let map = DEFAULT_MAP

  const updateTileText = (): void => {
    if (!game) return
    const { x, z } = game.currentPig.position
    const tile = query?.tileAddress(x, z)
    tileEl.textContent = tile
      ? `tile ${tile.col},${tile.row}  tex ${tile.texture}  byte ${tile.rotateFlip}  type 0x${tile.type.toString(16)}`
      : ''
  }

  const updateHud = (): void => {
    if (!game) return
    updateTileText()
    scene?.focus(game.currentPig)
  }

  // The dashboard is drawn over the 3D view, on its own canvas, for as long
  // as the battle is the view.
  let frame = 0
  const paint = (): void => {
    frame = requestAnimationFrame(paint)
    if (!game || !scene) return
    const width = hudCanvas.clientWidth
    const height = hudCanvas.clientHeight
    hud.draw({ seconds: game.timeLeft, pigs: scene.plates(width, height) })
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
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    hud.clear()
    onLeave()
  })

  /** (Re)start the battle on `name` — fresh spawns, fresh turn order. A load
   * failure leaves whatever battle was running untouched. */
  const start = async (name: string): Promise<boolean> => {
    // A battle that cannot load stays unopened and says so in the console —
    // the same place a refused swapMap answers. The view never appears, so
    // there is nowhere on screen to put it.
    const refuse = (error: string): false => {
      console.log(scene ? `stayed on ${map}: ${error}` : `could not open ${name}: ${error}`)
      return false
    }
    const [terrainResult, objectsResult, clipsResult, textResult] = await Promise.all([
      window.api.loadTerrain(`Maps/${name}.PMG`),
      window.api.loadMapObjects(`Maps/${name}.POG`),
      window.api.loadClips(CHAR_ARCHIVE),
      window.api.loadGameText('fetext'),
      hud.load()
    ])
    if (!terrainResult.ok) return refuse(terrainResult.error)
    if (!textResult.ok) return refuse(textResult.error)
    const teams = nations(textResult.strings)
    if (teams.length === 0) return refuse('the install names no teams')

    if (!objectsResult.ok) console.log(`${name} without its objects: ${objectsResult.error}`)

    // A map does not place the same things in every game: the low byte of a
    // record's flags says which player counts it exists in, and the battle
    // fields as many sides as there are squads to name. BOOM is the map
    // that shows it — one-player snipers and multiplayer grunts on the very
    // same spots (lib/formats/pog.ts).
    const objects = (objectsResult.ok ? objectsResult.objects : []).filter((object) =>
      existsForPlayers(object, SIDES_FIELDED)
    )

    query = new TerrainQuery(
      terrainResult.blocks,
      buildWaterMask(terrainResult.blocks, terrainResult.textures)
    )
    const squads = mapSquads(objects, teams)
    if (squads.length === 0) return refuse(`${name} carries no spawn markers — nothing to field`)

    // Which models to load is only known once the squads are: a map fields
    // the classes its own markers name.
    const bases = artFor(squads.flatMap((squad) => squad.spawns.map((at) => at.pigClass ?? 0)))
    const loaded = await Promise.all(bases.map((base) => window.api.loadModel(CHAR_ARCHIVE, base)))
    const missing = loaded.findIndex((result) => !result.ok)
    if (missing >= 0) return refuse((loaded[missing] as { ok: false; error: string }).error)
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
        objects,
        props: objectsResult.ok ? objectsResult.props : [],
        propTextures: objectsResult.ok ? objectsResult.textures : []
      },
      game,
      updateTileText
    )
    map = name
    updateHud()
    if (frame === 0) frame = requestAnimationFrame(paint)
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
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      hud.clear()
    }
  }
}
