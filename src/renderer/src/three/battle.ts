// The battle scene, assembled: a real map, the map's own squads standing on
// it, and one frame loop that drives them.
//
// Everything game-space (Y-down) under the usual 180°-X group. What this
// file owns is the WIRING and the frame's order of events; the pieces each
// live next door — `squad.ts` the pigs, `chase.ts` the camera, `dropIn.ts`
// the level's opening, `marker.ts` the pointer, `debug.ts` the window the
// e2e suite looks through. The rules themselves are pure and live in
// `lib/game`; this scene feeds them intents and draws what they say.
//
// The parts it wires live in `battle/`, sharing one core (`battle/core.ts`).

import type { Battle } from '../../../lib/game/battle'
import { createEngine } from '../../../lib/game/engine'
import type { BattleBus } from '../../../lib/game/events'
import type { Game, Pig } from '../../../lib/game/game'
import type { Blip, Eye } from '../../../lib/game/scanner'
import type { Collected } from '../../../lib/game/scenery'
import { skyFogFor } from '../../../lib/game/sky'
import type { TerrainQuery } from '../../../lib/game/terrain'
import type {
  Bone,
  Clip,
  MapObject,
  MapProp,
  Model,
  Sky,
  TerrainBlock,
  TerrainTexture,
  Texture,
  TimImage
} from '../api'
import type { FloatingNumber, PigPlate } from '../contracts/overlay'
import type { SceneSound } from '../contracts/sound'
import { createAirDropArt } from './airDrop'
import { createBrainLink, remoteBrainFor } from './battle/brainLink'
import type { SceneCore } from './battle/core'
import { exposeDebug } from './battle/debugSurface'
import { drawnAt, marks, stanceNow } from './battle/drawn'
import { focus, trainingStep } from './battle/jumps'
import { listen } from './battle/listeners'
import { blips, eye } from './battle/mapReadout'
import { buildBlockers, fadeBlockers } from './battle/seeThrough'
import { show } from './battle/show'
import { createSceneState } from './battle/state'
import { createSubject } from './battle/subject'
import { survey } from './battle/survey'
import { createChase } from './chase'
import { projectDamage } from './damageNumbers'
import { createDecoyArt } from './decoyArt'
import { createDropInArt } from './dropIn'
import { createEffectArt } from './effects'
import { createFaces } from './faces'
import { createGrenadeArt } from './grenades'
import { createHeldWeapons } from './heldWeapon'
import { buildMarker } from './marker'
import { createMineArt } from './mineArt'
import { createMineGround } from './mineGround'
import { buildMapProps } from './props'
import { createRemainsArt } from './remains'
import type { SceneHost } from './scene'
import { createBulletArt } from './shots'
import { buildSky } from './sky'
import { fieldSquad } from './squad'
import type { SoldierArt } from './squad'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { createTween } from './tween'
import { createWear } from './wear'
import { buildWeather } from './weather'
import * as THREE from 'three'

export type { SoldierArt } from './squad'

export interface BattleAssets {
  blocks: TerrainBlock[]
  terrainTextures: TerrainTexture[]
  /** `Mine.tim`, what a detector's mines show as (three/mineGround.ts). Null is
   * fine: a battle plays with its mines showing as plain ground. */
  mineGround: TerrainTexture | null
  /** Every model the squads need — one per class group on the map, per NATION
   * fielded. The first is the fallback for a class nothing loaded art for. */
  soldiers: SoldierArt[]
  skeleton: Bone[]
  /** Which nation each side wears, by side index (lib/game/nations.ts). */
  nations: readonly number[]
  /** The nation hats out of `Chars/FHATS.MAD`, by nation — only the
   * heavy-gunner family wears one (three/squad.ts). */
  hats: ReadonlyMap<number, { model: Model; textures: Texture[] }>
  clips: Clip[]
  /** The map's .POG records and the geometry they name. Empty is fine — a
   * map whose objects failed to load still plays. */
  objects: MapObject[]
  props: MapProp[]
  /** `gtext`, the battle's own strings — the skill names among them
   * (lib/game/skills.ts). Empty is fine: a battle plays without them. */
  strings: string[]
  /** `WE_PARA` out of `Chars/WEAPONS.MAD` — the canopy the drop-in hangs
   * under. Null is fine: a map whose squad parachutes simply stands instead
   * of dropping under nothing (three/dropIn.ts). */
  canopy: { model: Model; textures: Texture[] } | null
  /** `Chars/FACES.MTD` — the alternate eyes and mouths a pig's face swaps to
   * (three/faces.ts). Empty is fine: every pig keeps its resting face. */
  faces: TimImage[]
  /** The dome the map stands under, already skinned with its own mood
   * (lib/game/sky.ts). Null is fine: the battle falls back on the flat clear
   * colour it had before there was a sky at all. */
  sky: Sky | null
  /** `Snow0..3` or `Rain0..3`, and which of the two — null on the forty-odd
   * maps whose mood draws no weather at all (lib/game/sky.ts). */
  weather: { kind: 'snow' | 'rain'; images: Texture[] } | null
}

export interface BattleScene {
  /**
   * The battle this scene is drawing.
   *
   * Handed out rather than proxied: INPUT drives the engine directly
   * (input/battleInput.ts), and every accessor this fasade used to mirror —
   * `setIntent`, `situation`, `charging` — was the same method one level down.
   */
  readonly battle: Battle
  /** Point the camera at the active pig and park the marker over it. */
  focus(pig: Pig): void
  /** Whether the level's opening drop is still going: what the dashboard
   * shows the mission's title card over. */
  dropping(): boolean
  /** Where each living pig's name hangs, in a view this big — the camera
   * lives here, so the dashboard asks rather than guesses. `lift` is the
   * dashboard's own clearance over the pig's crown; the scene projects and
   * does not decide it (contracts/overlay.ts). */
  plates(width: number, height: number, lift: number): PigPlate[]
  /** Seconds the acting pig has stood still: the names come back with it. */
  still(): number
  /** Where the camera stands and which way it looks, GAME space — what the
   * dashboard's map is centred on and turned by (lib/game/scanner.ts). The
   * camera lives here, so the dashboard asks rather than guesses, exactly as
   * it does for the plates. */
  eye(): Eye
  /** Everything the map draws a marker for. Built here because it takes both
   * halves — the squads out of the game and the crates out of the map's art,
   * which is the only place that knows one has been taken. */
  blips(): Blip[]
  /** The damage numbers floating over the battle, projected into a view this
   * big — the dashboard draws them in the game's own letters. */
  numbers(width: number, height: number): FloatingNumber[]
  /** How full the power gauge is, 0..1 — or null when nothing is charging,
   * which is what the dashboard hides it on. */
  charging(): number | null
  /** Whether the view is actually down the barrel — held AND holding a gun,
   * which is what the scope's ring is drawn over (ui/hud.ts). */
  scoped(): boolean
  /** Where the weapon in hand points, in the game's own angle units, or null
   * when the pig is holding nothing that aims (lib/game/aim.ts). */
  aim(): number | null
  /**
   * Run the training ground's script to one of its steps and stand the pig on
   * the crate that step hands over (lib/game/training.ts). False on any map that
   * is not the training ground, which has no such script.
   *
   * Only FORWARD — a broken dummy does not stand back up, so a step behind the
   * one the battle is on is a battle starting over (ui/battle.ts).
   */
  trainingStep(step: number): boolean
  dispose(): void
}

/**
 * What the scene needs that is not art.
 *
 * `sound` is passed IN rather than built here: sound is its own domain and this
 * file may not import it at all (`npm run boundaries`). The scene asks it for
 * two things only — the pig's own footfalls, which ride the locomotion state,
 * and the canopy poll — and everything else it plays comes off the bus.
 */
export interface BattleSceneParts {
  host: SceneHost
  assets: BattleAssets
  /** The map as the rules see it. Built by whoever mustered the squads, since
   * a pig's starting height comes off the same ground (lib/game/muster.ts). */
  query: TerrainQuery
  game: Game
  /** Called whenever the game state changed this frame (HUD refresh). */
  onGameChanged: () => void
  /** Which map this is — the training ground hands out its crates on its own
   * terms (lib/game/pickups.ts). */
  map: string
  /** Whether the squads come down under canopies, as a level opens. False
   * stands them on their markers at once — a spec that is not about the
   * drop starts from the ground (`pow.open`). */
  drop: boolean
  /** Called once per crate the acting pig walks into. */
  onCollected: (collected: Collected) => void
  /** The battle's own bus, already carrying whatever else listens. */
  bus: BattleBus
  sound: SceneSound
  /**
   * Whether the battle is the view yet. The scene is BUILT before it is
   * shown — that is exactly what the briefing's loading bar waits on — so
   * without this the world starts stepping under the loading screen and the
   * drop-in, five seconds of descent, is over before the player presses a
   * key. Play saw the mission open with the squad already down.
   */
  running: () => boolean
  /**
   * Whether the game is PAUSED, as opposed to merely not on screen.
   *
   * The two are not the same thing and the camera is the reason: a battle that
   * has not been shown yet is not drawn at all, while a PAUSED one hands the
   * camera to the exe's mode 7 and tours the field (lib/game/mapView.ts). So
   * `running` stops the world and this one says what to do instead.
   */
  paused: () => boolean
}

export function buildBattle(parts: BattleSceneParts): BattleScene {
  const {
    host,
    assets,
    query,
    game,
    onGameChanged,
    map,
    drop,
    onCollected,
    bus,
    sound: sounds,
    running,
    paused
  } = parts
  const root = new THREE.Group()
  root.rotation.x = Math.PI

  // The sky goes in FIRST so it is the scene's first child, though what
  // actually keeps it behind everything is its own render order (three/sky.ts).
  // The mood's HAZE rides with it: same record, same failure — a map whose dome
  // will not load gets neither, which is the one case where the two are tied.
  const sky = assets.sky
    ? buildSky({ root, scene: host.scene, sky: assets.sky, fog: skyFogFor(map) })
    : null
  // …and what falls out of it. NOT under `root`: the weather is a SCREEN
  // effect and lives on the camera's own plane, so the game-space flip has
  // nothing to say about it (three/weather.ts).
  const weather = assets.weather
    ? buildWeather({ scene: host.scene, camera: host.camera, ...assets.weather })
    : null

  const terrain: Terrain = buildTerrain(assets.blocks, assets.terrainTextures)
  // buildTerrain wraps in its own converted group; unwrap into ours. Its
  // one child is the inner game-space group — ground and water together.
  root.add(terrain.group.children[0])

  // Whatever the map stands on its ground: trees, crates, bridges, and on
  // the training map the dummies and the gate.
  const props = buildMapProps(assets.objects, assets.props)
  root.add(props.group)
  // What could stand between the camera and the pig (`battle/seeThrough.ts`).
  const blockers = buildBlockers(assets)
  const squad = fieldSquad(assets, game.players.map((player) => player.pigs), query, root)
  // The level opens with whoever the map's markers say drops in. Built after
  // the squad because it LIFTS them off it.
  const dropInArt = createDropInArt(squad, assets.canopy)
  /** …and the face a pig wears on the way down (three/faces.ts). */
  const faces = createFaces(squad, assets.faces)
  /** The canopy art a descent wears, and the record it lifts (three/airDrop). */
  const airDropArt = createAirDropArt(props, assets.canopy)
  const marker = buildMarker(root)
  const chase = createChase(host.camera, query, (x, y, z) => {
    // What the projectile camera swings around: the map's boxes, and the
    // ground itself where it stands above the line. `surface` rather than
    // `height` so a water sheet does not read as a wall (lib/game/terrain.ts).
    if (obstacles.solid(x, y, z)) return true
    // Y-DOWN, so underground is a LARGER y — and with a margin, because a
    // grenade lying still sits exactly on the surface and must not read as
    // buried in it.
    return y - query.surface(x, z) > 100
  })
  const subject = createSubject()

  /**
   * The SCENE's subscription: everything the engine announces that has to be
   * SHOWN, and nothing that has to be remembered.
   *
   * Hung BEFORE the engine is built, because the engine announces while it is
   * still building — a record the map's script holds back is announced hidden
   * inside `createScenery`, and a canopy opens inside `createDropIn`. A
   * listener hung afterwards misses both, and the map comes up with the eight
   * dummies standing on it that the script has not placed yet.
   */
  listen({
    bus,
    props,
    dropInArt,
    faces,
    squad,
    chase,
    airDropArt,
    onCollected,
    subject,
    remainsArt: () => remainsArt
  })
  /**
   * The battle itself, assembled: the terrain, the map's script, the
   * projectiles, the effects, the drop-in and the frame's own order of events —
   * every rule in it, and none of them here (lib/game/engine.ts).
   *
   * What this file does below is feed it art and READ what it did.
   */
  const link = createBrainLink()
  const brain = remoteBrainFor(link, map, assets.objects)
  const engine = createEngine({
    world: {
      game,
      blocks: assets.blocks,
      terrainArt: assets.terrainTextures,
      objects: assets.objects,
      clips: assets.clips,
      skeleton: assets.skeleton,
      map,
      // A map with no canopy art stands its squad on the markers instead: a pig
      // hanging from nothing is worse than one that starts where it was going
      // to end up (three/dropIn.ts).
      parachutes: drop && assets.canopy !== null
    },
    query,
    onChanged: onGameChanged,
    bus,
    // The MACHINE plays everyone but side 0 — the campaign's own, which the
    // spawn order puts first (lib/game/muster.ts). Today its brain only
    // passes (lib/game/ai.ts); multiplayer will rewire this seam. The battle
    // latches the answer at each turn's start, so `pow.hotseat()` above
    // lands on the NEXT handover (play's call: "достаточно только на начале
    // хода").
    computer: (side) => side > 0 && !link.hotseat,
    brain
  })
  const { battle, scenery, obstacles, anim, swings, heals, shots, grenades, mines, effects, numbers, airDrops, dropIn } =
    engine
  link.field = obstacles
  /** The mixers, brought into line once a frame with what the engine says each
   * pig is wearing (three/wear.ts). */
  const wear = createWear(squad, assets.clips)
  // Up they go, before the first frame is drawn: the engine has already lifted
  // them, and a squad standing on its markers for one frame reads as a stutter.
  dropInArt.draw(engine.snapshot().pigs.filter((one) => one.arriving), (one) => one)

  host.scene.add(root)
  host.camera.near = 10
  host.camera.far = 100_000
  host.camera.updateProjectionMatrix()

  /** The weapons in hand, one mesh per pig that has one out. */
  const weapons = createHeldWeapons()
  /** The bands, puffs and sprites that show what the engine's effect field is
   * running (three/effects.ts). */
  const effectArt = createEffectArt(root)
  /** The field of view the camera had before anything magnified it. */
  const openFov = host.camera.fov
  /** The spheres that show the bullets (three/shots.ts). */
  const bulletArt = createBulletArt(root)
  /** The grenade models and the smoke behind them (three/grenades.ts). */
  const grenadeArt = createGrenadeArt(root, (name) => props.spawn(name))
  /** …and the trodden mines and the laid ones, which wear the MAP's own
   * `WE_APMIN` (three/mineArt.ts). */
  const mineArt = createMineArt(root, (name) => props.spawn(name))
  /** …and the ground a detector sees the buried ones in (three/mineGround.ts). */
  const mineGround = createMineGround(root, terrain, assets.mineGround)
  /** …and the boots a finished death leaves on the spot (three/remains.ts). */
  const remainsArt = createRemainsArt(root, (name) => props.spawn(name))
  /** …and the DISGUISES — a bush where a hidden pig stands
   * (three/decoyArt.ts). */
  const decoyArt = createDecoyArt(root, (name) => props.spawn(name))
  /**
   * …and everything else the engine moves that has an IDENTITY: what is in the
   * air, what is coming down under a canopy, and the spot a blow left behind
   * (three/tween.ts). The camera rides these, and it eases where it stands but
   * not what it looks at — so a stepping target goes almost entirely into the
   * aim, which is the shake play reported.
   */
  const tween = createTween()
  const state = createSceneState(engine)
  const core: SceneCore = {
    host,
    assets,
    query,
    game,
    onGameChanged,
    sounds,
    root,
    sky,
    weather,
    props,
    blockers,
    squad,
    dropInArt,
    marker,
    chase,
    subject,
    link,
    engine,
    battle,
    scenery,
    swings,
    heals,
    shots,
    grenades,
    mines,
    effects,
    effectArt,
    airDrops,
    dropIn,
    weapons,
    openFov,
    grenadeArt,
    mineArt,
    mineGround,
    remainsArt,
    decoyArt,
    tween,
    state
  }

  const onFrame = (delta: number): void => {
    // The mission's clock does not start until the mission is on screen — but
    // a PAUSE is not that: the world stops and the camera goes touring.
    if (!running()) {
      if (paused()) survey(core, delta)
      return
    }
    state.flying = false
    state.time += delta
    state.lastFrame = delta
    // A GAP between two frames says a stall happened SOMEWHERE — render,
    // GC, IPC, the engine — where the engine.update line below says how
    // much of it was the engine's. The two together are what play's
    // "секунда-полсекунды пролага" needs to be attributed instead of
    // guessed: a fat gap over a thin update points OUTSIDE the engine.
    if (delta > 0.1) {
      window.api.logTelemetry(`[perf] frame gap ${(delta * 1000).toFixed(0)}ms`)
    }
    // **THE LINE COMES BEFORE THE SHOT**, so the rules are told whether the pig
    // is still talking before they step (play's rule, lib/game/shot.ts). Ahead
    // of `engine.update`, like every other input.
    battle.setSpeaking(sounds.saying())
    // …and the SERGEANT's line the same way: the beat between the walk away and
    // the handover lasts exactly as long as he does (lib/game/sergeant.ts).
    battle.setSargeSpeaking(sounds.sargeSaying())
    // The GAME, in whole steps — the order of events and everything running
    // with it, the engine's own business from end to end. A step that is about
    // to run leaves behind where the pig stood, which is what the picture is
    // drawn from (lib/game/engine.ts).
    const updateBegan = performance.now()
    const steps = engine.update(delta, () => {
      state.before = stanceNow(core)
      tween.from(marks(core))
    })
    // **THE HITCH MEASURED, not guessed.** Play keeps feeling stalls while
    // the machine thinks ("пролаги пока свин думает"); a frame whose ENGINE
    // half ran long is logged with what it cost, so the next report points
    // at a number. 40 ms is over two whole frames at 60 — a real hiccup,
    // not noise.
    const updateMs = performance.now() - updateBegan
    if (updateMs > 40) {
      window.api.logTelemetry(
        `[perf] engine.update ${updateMs.toFixed(0)}ms (${steps} steps, delta ${(delta * 1000).toFixed(0)}ms)`
      )
    }
    // ONE reading of the battle, and everything below draws from it
    // (lib/game/snapshot.ts).
    state.now = engine.snapshot()
    if (steps > 0) {
      state.after = stanceNow(core)
      if (state.before.pig !== state.after.pig) state.before = state.after
      tween.to(marks(core))
    }
    // …and then everything that SHOWS it. Every mixer is brought into line with
    // what the engine now says each pig wears (three/wear.ts).
    wear.apply(state.now.pigs, engine.alpha())
    show(core, delta)
    marker.bob(state.time)
    // …and what the engine says is in the air gets drawn where it now is. Once
    // a frame, after everything that could have moved or spent one.
    bulletArt.draw(state.now.bullets, delta, (shot) => drawnAt(core, `shot:${shot.id}`, shot))
    grenadeArt.draw(state.now.lobs, delta, (lob) => drawnAt(core, `lob:${lob.id}`, lob))
    // The minefield, through the eyes of whoever's turn it is: a buried mine is
    // shown to the side that has somebody near it who can see one, and to nobody
    // else, in the ground itself (lib/game/mines.ts).
    mineGround.draw(mines.revealed(game.currentPlayer.pigs))
    // …and every one that has been TRODDEN ON: play asked for the mine to show
    // itself the moment a foot finds it, and by then it is nobody's secret. Those
    // are the ENGINE's own art and get its model (`WE_APMIN`).
    mineArt.draw(mines.at(), mines.laid())
    // …and the disguises, straight off the snapshot (lib/game/hide.ts).
    decoyArt.draw(state.now.decoys)
    // **AND WHATEVER STANDS BETWEEN THE CAMERA AND THE PIG GOES SEE-THROUGH.**
    // Play: "здание не просвечивает когда свинья внутри." Indoors the camera has
    // nowhere to swing to — every heading is a wall (lib/game/sightline.ts) — so
    // the wall fades instead. From the eye to the pig's own middle rather than its
    // feet, or the floor it stands on counts as being in the way.
    // The eye in GAME space, wanted twice below: the sky is centred on it —
    // an infinite dome drawn at a size a depth buffer can hold (three/sky.ts) —
    // and the see-through test measures from it. AFTER `show`, which is what
    // moved the camera this frame.
    root.worldToLocal(state.eyeInGame.copy(host.camera.position))
    sky?.follow(state.eyeInGame)
    // The weather rides the camera the same way, and takes its own drift off
    // how far the camera turned this frame — so it goes after `show` too.
    weather?.draw(delta)
    fadeBlockers(core)
    effectArt.draw(state.now.effects)
    airDropArt.draw(state.now.crates, (one) => drawnAt(core, `crate:${one.id}`, { x: 0, y: one.y, z: 0 }).y)
  }
  host.onFrame.add(onFrame)

  exposeDebug(core)

  return {
    battle,
    focus: (pig) => focus(core, pig),
    dropping: () => state.now.dropping,
    plates: (width, height, lift) =>
      squad.plates(host.camera, width, height, lift, game.players.indexOf(game.currentPlayer), (pig) =>
        engine.poison.poisoned(pig)
      ),
    numbers: (width, height) => projectDamage(state.now.numbers, host.camera, root, width, height),
    still: () => state.now.still,
    eye: () => eye(core),
    blips: () => blips(core),
    charging: battle.charging,
    scoped: () => state.now.scoped,
    aim: battle.aim,
    trainingStep: (step) => trainingStep(core, step),
    dispose() {
      host.onFrame.delete(onFrame)
      // The AI's process is told the battle is over and the reply
      // subscription goes with it (lib/game/brainPort.ts). The process itself
      // stays up for the next battle; main kills it with the window.
      brain.close()
      host.scene.remove(root)
      sky?.dispose()
      weather?.dispose()
      terrain.dispose()
      props.dispose()
      dropInArt.dispose()
      faces.dispose()
      marker.dispose()
      effectArt.dispose()
      bulletArt.dispose()
      grenadeArt.dispose()
      mineArt.dispose()
      mineGround.dispose()
      remainsArt.dispose()
      decoyArt.dispose()
      airDropArt.dispose()
      weapons.dispose()
      squad.dispose()
    }
  }
}
