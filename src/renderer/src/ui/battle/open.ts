// OPENING A BATTLE and putting it away: the map's files and the art its squads
// wear loaded, the game mustered, the bus and its listeners, the scene built.

import { bodyExtent } from '../../../../lib/game/body'
import { buildQuery } from '../../../../lib/game/engine'
import { createBus } from '../../../../lib/game/events'
import { mapRaster } from '../../../../lib/game/mapRaster'
import { fielded, mapSquads, musterGame } from '../../../../lib/game/muster'
import type { OwnSquad } from '../../../../lib/game/muster'
import {
  HAT_ARCHIVE,
  HAT_CLASSES,
  SKIN_ARCHIVES,
  SKIN_HATS,
  skinOf
} from '../../../../lib/game/nations'
import { skyArchiveFor, weatherFor } from '../../../../lib/game/sky'
import { nations } from '../../../../lib/game/teams'
import { isTrainingGround } from '../../../../lib/game/tutorial'
import type { LoadModelResult, Model, Texture } from '../../api'
import { createBattleSound } from '../../audio/battleSound'
import { controller } from '../../input/controller'
import { buildBattle } from '../../three/battle'
import { ensureScene } from '../../three/scene'
import { artFor, classArt } from '../../three/soldiers'
import { loadMapData } from '../mapData'
import { missionTitle } from '../titleCard'
import { collected, listenBar } from './bar'
import type { UiCore } from './core'
import { paint, updateHud, updateTileText } from './paint'
import { isRunning } from './pause'
import { listenRecord } from './record'
import { listenTelemetry } from './telemetry'
import { listenTutorial } from './tutorial'

// The training ground — the first map the original ever shows a player, and
// the friendliest to test on: barely any water, one big usable field.
// `pow.swapMap('ARTGUN')` in the console restarts the battle elsewhere.
export const DEFAULT_MAP = 'CAMP'
export const CHAR_ARCHIVE = 'Chars/british.mad'
/** Where the canopy lives: `WE_PARA`, the archive's 24th model, which is the
 * one `Pig::StartParachuting` hangs off a pig (three/parachute.ts). */
export const WEAPON_ARCHIVE = 'Chars/WEAPONS.MAD'
export const CANOPY_MODEL = 'WE_PARA'

/** 'artgun', 'ARTGUN.PMG' and 'Maps/ARTGUN.PMG' all mean ARTGUN. */
export const normalizeMap = (name: string): string =>
  name
    .trim()
    .replace(/^maps[\\/]/i, '')
    .replace(/\.pmg$/i, '')
    .toUpperCase()

/** (Re)start the battle on `name` — fresh spawns, fresh turn order. A load
 * failure leaves whatever battle was running untouched. `drop` is whether the
 * squads come down under canopies or stand on their markers at once. */
export const start = async (
  core: UiCore,
  name: string,
  drop: boolean,
  wearing: readonly number[] = [],
  own?: OwnSquad
): Promise<boolean> => {
  const { canvasHost, hud, speech, input, state } = core
  // A battle that cannot load stays unopened and says so in the console —
  // the same place a refused swapMap answers. The view never appears, so
  // there is nowhere on screen to put it.
  const refuse = (error: string): false => {
    console.log(state.scene ? `stayed on ${state.map}: ${error}` : `could not open ${name}: ${error}`)
    return false
  }
  const [[terrainResult, objectsResult], clipsResult, textResult, battleTextResult] =
    await Promise.all([
      // A shipped map's own files — or the proving ground, which is built.
      loadMapData(name),
      window.api.loadClips(CHAR_ARCHIVE),
      window.api.loadGameText('fetext'),
      // The battle's own strings: the mission titles and, next, everything
      // the tutorial says.
      window.api.loadGameText('gtext'),
      hud.load()
    ])
  if (!terrainResult.ok) return refuse(terrainResult.error)
  if (!textResult.ok) return refuse(textResult.error)
  // An install with no gtext simply gets no card; it is not worth a battle.
  state.battleText = battleTextResult.ok ? battleTextResult.strings : []
  state.title = missionTitle(state.battleText, name)
  // A restart is a fresh level: the sergeant stops mid-word and says his
  // opening again.
  speech.stop()
  state.cued = new Set()
  state.step = 0
  state.verdict = null
  state.fallen = []
  state.kills = []
  state.points = []
  // A fresh level is the tutorial's first rung again, whoever asked for it —
  // the menu, `pow.swapMap`, or a step BACK, which sets its own want on the
  // far side of this.
  state.trainingStep = 0
  // Disarmed, the way the game object is BUILT (0x48F073): nothing is said
  // about mines until a crate sends the pig into a minefield.
  state.mineLineArmed = false
  const teams = nations(textResult.strings)
  if (teams.length === 0) return refuse('the install names no teams')

  if (!objectsResult.ok) console.log(`${name} without its objects: ${objectsResult.error}`)

  // Only the records this many players get: a map does not place the same
  // things in every game (lib/game/muster.ts).
  const objects = fielded(objectsResult.ok ? objectsResult.objects : [])

  // The map as the rules see it, built ONCE and handed to the scene, which
  // hands it to the engine — the water mask walks every texel of the ground
  // and there was a second copy of it here (lib/game/engine.ts).
  state.query = buildQuery(terrainResult.blocks, terrainResult.textures)
  const squads = mapSquads(objects, teams, wearing, own)
  if (squads.length === 0) return refuse(`${name} carries no spawn markers — nothing to field`)

  // Who is fighting where, at the top of every battle's telemetry — the
  // fifth AI session had to be identified by matching raw spawn
  // coordinates against the fourth's, because nothing in the log named
  // the map or the sides.
  window.api.logTelemetry(
    `[battle] ${name}${state.title ? ` "${state.title}"` : ''} — ` +
      squads
        .map((squad) => `${squad.name}(${teams[squad.nation]?.name ?? squad.nation}): ${squad.pigNames.join(', ')}`)
        .join(' vs ')
  )

  // Which models to load is only known once the squads are: a map fields
  // the classes its own markers name — and now one set PER NATION fielded,
  // since two sides in different uniforms share the same geometry and must
  // not share the same `SoldierArt` (three/squad.ts).
  const bases = artFor(squads.flatMap((squad) => squad.spawns.map((at) => at.pigClass ?? 0)))
  const dressed = [...new Set(squads.map((squad) => squad.nation))]
  const wanted = dressed.flatMap((nation) => bases.map((base) => ({ base, nation })))
  const loaded = await Promise.all(
    wanted.map(({ base, nation }) =>
      // Skin 0 is British and its archive is the one paired with the model,
      // so it is asked for by omission — the same call the frontend makes.
      window.api.loadModel(CHAR_ARCHIVE, base, skinOf(nation) === 0 ? undefined : SKIN_ARCHIVES[skinOf(nation)])
    )
  )
  const missing = loaded.findIndex((result) => !result.ok)
  if (missing >= 0) return refuse((loaded[missing] as { ok: false; error: string }).error)
  const soldiers = wanted.map(({ base, nation }, index) => {
    const result = loaded[index] as Extract<LoadModelResult, { ok: true }>
    return { base, nation, model: result.model, textures: result.textures }
  })

  // The nation HATS, one per side that fields a class which wears one. Their
  // textures are shared (`FHATS.MTD`), so the archive is asked plainly; a hat
  // that will not load leaves that side bare-headed rather than refusing the
  // battle, since the same load fails for every map.
  const hats = new Map<number, { model: Model; textures: Texture[] }>()
  if (squads.some((squad) => squad.spawns.some((at) => HAT_CLASSES.has(at.pigClass ?? 0)))) {
    for (const nation of dressed) {
      const wear = await window.api.loadModel(HAT_ARCHIVE, SKIN_HATS[skinOf(nation)] ?? '')
      if (wear.ok) hats.set(nation, { model: wear.model, textures: wear.textures })
      else console.warn(`${SKIN_HATS[skinOf(nation)]}: ${wear.error}`)
    }
  }

  // The canopy the level opens under. A squad that drops in without it
  // would be hanging from nothing, so a failed load stands them on their
  // markers instead of taking the battle down with it.
  const canopyResult = await window.api.loadModel(WEAPON_ARCHIVE, CANOPY_MODEL)
  if (!canopyResult.ok) console.log(`${name} without canopies: ${canopyResult.error}`)
  const canopy = canopyResult.ok
    ? { model: canopyResult.model, textures: canopyResult.textures }
    : null

  // …and the faces a pig's head swaps to on the way down (three/faces.ts).
  // Failing it costs only the expression: everyone keeps the resting face.
  const facesResult = await window.api.loadTims('Chars/FACES.MTD')
  if (!facesResult.ok) console.log(`${name} without face art: ${facesResult.error}`)
  const faces = facesResult.ok ? facesResult.images : []

  // …and the sky the map stands under, which the exe picks by MAP out of its
  // mission records (lib/game/sky.ts). Failing it costs the dome and nothing
  // else, so it is reported and stepped over like the props.
  const skyResult = await window.api.loadSky(skyArchiveFor(name))
  if (!skyResult.ok) console.log(`${name} without a sky: ${skyResult.error}`)

  // …and what falls out of it, on the two moods that draw any: the ten cold
  // maps snow and the five ominous ones rain (lib/game/sky.ts). Ordinary TIM
  // archives, so no loader of their own.
  const falling = weatherFor(name)
  const weatherResult = falling
    ? await window.api.loadTims(`Language/Tims/${falling}.mtd`)
    : null
  if (weatherResult && !weatherResult.ok) {
    console.log(`${name} without its ${falling}: ${weatherResult.error}`)
  }
  const weather =
    falling && weatherResult?.ok ? { kind: falling, images: weatherResult.images } : null

  // The squads, standing (lib/game/muster.ts). All the renderer supplies is
  // the MEASUREMENT — how big a pig of this class is, off its own art
  // (lib/game/body.ts), which used to be the mesh's alone and is what made
  // every blow ask the renderer where a pig was.
  state.game = musterGame({
    squads,
    map: name,
    ground: state.query,
    bodyOf: (pigClass) =>
      bodyExtent((soldiers.find((one) => one.base === classArt(pigClass)) ?? soldiers[0]).model.positions)
  })

  state.scene?.dispose()
  // The poll rides the scene's frame, ahead of the game's step — a Set, so
  // asking for it again on every map swap registers it once.
  const host = ensureScene(canvasHost)
  host.onInput.add(input.poll)
  // THE COMPOSITION. One bus, and the domains hung off it: the engine
  // announces, sound listens, the scene listens and draws. Built here rather
  // than inside any of them, because the moment one builds another they stop
  // being separable — which is what `npm run boundaries` checks.
  state.sound?.dispose()
  const bus = createBus()
  // The sides' NATIONS ride along for the music and the voices — a turn's
  // theme and a pig's tongue are its own side's (audio/music.ts,
  // audio/pigVoice.ts) — and the training ground says so, because its end
  // of mission is the sergeant's rather than the closing track.
  state.sound = createBattleSound(bus, {
    nations: squads.map((squad) => squad.nation),
    training: isTrainingGround(name)
  })
  // The instructor is a listener like any other. A crate the SCRIPT has just
  // put on the map is the half of the tutorial that says where to go next,
  // and it comes straight off the bus rather than through the scene — the
  // collected line goes the long way round only because it shares the
  // briefing bar's wording with the pickup message.
  listenRecord(core, bus)
  listenBar(core, bus)
  listenTutorial(core, bus)
  listenTelemetry(core, bus)
  state.scene = buildBattle({
    host,
    query: state.query,
    assets: {
      blocks: terrainResult.blocks,
      terrainTextures: terrainResult.textures,
      soldiers,
      nations: squads.map((squad) => squad.nation),
      hats,
      skeleton: (loaded[0] as Extract<LoadModelResult, { ok: true }>).skeleton,
      clips: clipsResult.ok ? clipsResult.clips : [],
      // A map without its props is still playable ground, so a failed POG
      // is reported and stepped over rather than taking the battle down.
      objects,
      props: objectsResult.ok ? objectsResult.props : [],
      strings: state.battleText,
      canopy,
      faces,
      sky: skyResult.ok ? skyResult.sky : null,
      weather
    },
    game: state.game,
    onGameChanged: () => updateTileText(core),
    map: name,
    drop,
    onCollected: (one) => collected(core, one),
    bus,
    sound: state.sound,
    running: () => isRunning(core),
    paused: () => state.paused
  })
  // The dashboard's map, built once off the same ground the mesh came from
  // — one pixel a tile, the whole world (lib/game/mapRaster.ts). Not
  // awaited: it is a picture appearing on a widget that is still sliding
  // in, and a battle should not wait on it.
  void hud.ground(mapRaster(terrainResult.blocks))
  state.map = name
  updateHud(core)
  if (state.frame === 0) state.frame = requestAnimationFrame((now) => paint(core, now))
  return true
}

/** Put the battle away: the LEAVE button, and the end of a mission. */
export const leave = (core: UiCore): void => {
  const { hud, speech, onLeave, state } = core
  controller.releaseAll()
  state.scene?.dispose()
  state.scene = null
  state.game = null
  if (state.frame !== 0) cancelAnimationFrame(state.frame)
  state.frame = 0
  state.painted = 0
  speech.stop()
  hud.clear()
  onLeave(state.verdict ?? 'aborted', state.fallen, state.kills, state.points)
}
