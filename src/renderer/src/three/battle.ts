// The battle scene, assembled: a real map, the map's own squads standing on
// it, and one frame loop that drives them.
//
// Everything game-space (Y-down) under the usual 180°-X group. What this
// file owns is the WIRING and the frame's order of events; the pieces each
// live next door — `squad.ts` the pigs, `chase.ts` the camera, `dropIn.ts`
// the level's opening, `marker.ts` the pointer, `debug.ts` the window the
// e2e suite looks through. The rules themselves are pure and live in
// `lib/game`; this scene feeds them intents and draws what they say.

import * as THREE from 'three'
import type { Bone, Clip, MapObject, MapProp, Model, Sky, TerrainBlock, TerrainTexture, Texture } from '../api'
import type { Game, Pig } from '../../../lib/game/game'
import { createEngine } from '../../../lib/game/engine'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { aimRadians } from '../../../lib/game/aim'
import { weaponModelName } from '../../../lib/game/weapons'
import { meleeOf } from '../../../lib/game/melee'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildMapProps } from './props'
import { buildSky } from './sky'
import { buildWeather } from './weather'
import { skyFogFor } from '../../../lib/game/sky'
import { fieldSquad } from './squad'
import type { Soldier, SoldierArt } from './squad'
import { SCOPE_BONE, SCOPE_MAGNIFY, SCOPE_MOUNT, createChase } from './chase'
import type { View } from './chase'
import { createDropInArt } from './dropIn'
import { buildMarker } from './marker'
import { createHeldWeapons } from './heldWeapon'
import type { Battle } from '../../../lib/game/battle'
import { objectBlips, pigBlips } from '../../../lib/game/scanner'
import type { Blip, Eye } from '../../../lib/game/scanner'
import { createTween } from './tween'
import { createWear } from './wear'
import type { Point } from '../../../lib/game/pose'
import type { PigShot } from '../../../lib/game/snapshot'
import { projectDamage } from './damageNumbers'
import { createEffectArt } from './effects'
import { createAirDropArt } from './airDrop'
import { handling } from '../../../lib/game/events'
import type { BattleBus } from '../../../lib/game/events'
import type { SceneSound } from '../contracts/sound'
import type { Collected } from '../../../lib/game/scenery'
import { FRAME_SECONDS } from '../../../lib/game/ballistics'
import { createBulletArt } from './shots'
import { crossedTowards, sightBlockers, silhouetteOf } from '../../../lib/game/seeThrough'
import { createGrenadeArt } from './grenades'
import { createMineArt } from './mineArt'
import { PIG_HEIGHT, PIG_HOLD, PIG_RADIUS } from '../../../lib/game/obstacles'
import { weaponLayer } from '../../../lib/game/controls'
import { advanceTraining, nextBreak } from '../../../lib/game/training'
import { exposeBattleDebug } from './debug'
import { touredIndex } from '../../../lib/game/mapView'
import type { FloatingNumber, PigPlate } from '../contracts/overlay'
import type { SceneHost } from './scene'

export type { SoldierArt } from './squad'

export interface BattleAssets {
  blocks: TerrainBlock[]
  terrainTextures: TerrainTexture[]
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
  propTextures: Texture[]
  /** `gtext`, the battle's own strings — the skill names among them
   * (lib/game/skills.ts). Empty is fine: a battle plays without them. */
  strings: string[]
  /** `WE_PARA` out of `Chars/WEAPONS.MAD` — the canopy the drop-in hangs
   * under. Null is fine: a map whose squad parachutes simply stands instead
   * of dropping under nothing (three/dropIn.ts). */
  canopy: { model: Model; textures: Texture[] } | null
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
  const props = buildMapProps(assets.objects, assets.props, assets.propTextures)
  root.add(props.group)
  /** Every box that could hide the pig from the camera (lib/game/seeThrough.ts),
   * built once — the records do not move. */
  const blockers = sightBlockers(assets.objects)
  /** Scratch for the camera's position in GAME space: the root is turned half a
   * turn about x, so the world's y and z are the game's negated. */
  const eyeInGame = new THREE.Vector3()
  /** …and the map's own pair, so asking for the eye between frames cannot
   * disturb what the see-through test is holding. */
  const mapEye = new THREE.Vector3()
  const mapLook = new THREE.Vector3()

  /**
   * Where the camera is and which way it looks, GAME space — what the
   * dashboard's map is centred on and turned by.
   *
   * The root is turned half a turn about x, so a point taken back into its
   * space IS in game space; that is the same trip the see-through test makes.
   * The look is taken as a second POINT rather than as a direction, because a
   * direction taken through `worldToLocal` would come back rotated and
   * translated both.
   */
  const eye = (): Eye => {
    root.worldToLocal(mapEye.copy(host.camera.position))
    host.camera.getWorldDirection(mapLook)
    root.worldToLocal(mapLook.add(host.camera.position))
    // `atan2(z, x)` and not the other way round: the library's yaw is the one
    // whose `(cos, sin)` in world (x, z) points UP the widget
    // (lib/game/scanner.ts).
    return { x: mapEye.x, z: mapEye.z, heading: Math.atan2(mapLook.z - mapEye.z, mapLook.x - mapEye.x) }
  }

  /**
   * Everything the map draws a marker for.
   *
   * Whose turn it is decides what is on it: an espionage pig is on its own
   * team's map and on nobody else's (lib/game/scanner.ts). A crate's marker
   * belongs to the OBJECT in the original and dies with it, so the art is
   * asked whether the record is still standing.
   */
  const blips = (): Blip[] => [
    ...pigBlips(game.players, game.players.indexOf(game.currentPlayer), performance.now() / 1000),
    ...objectBlips(assets.objects, (id) => !props.drawn(id))
  ]
  const squad = fieldSquad(assets, game.players.map((player) => player.pigs), query, root)
  // The level opens with whoever the map's markers say drops in. Built after
  // the squad because it LIFTS them off it.
  const dropInArt = createDropInArt(squad, assets.canopy)
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
  bus.on(
    handling({
      shown: ({ id, visible }) => props.show(id, visible),
      taken: ({ id }) => props.take(id),
      dropOpened: ({ pig }) => dropInArt.open(pig),
      dropCut: ({ pig }) => dropInArt.cut(pig),
      crateSent: ({ id }) => airDropArt.open(id),
      crateLanded: ({ id }) => airDropArt.land(id),
      canopiesCut: () => airDropArt.cutAll(),
      cameraReset: () => chase.reset(),
      collected: (one) => onCollected({ ...one, result: 'taken' }),
      refused: (one) => onCollected({ ...one, given: 0, result: 'full' })
    })
  )
  /**
   * The battle itself, assembled: the terrain, the map's script, the
   * projectiles, the effects, the drop-in and the frame's own order of events —
   * every rule in it, and none of them here (lib/game/engine.ts).
   *
   * What this file does below is feed it art and READ what it did.
   */
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
      parachutes: assets.canopy !== null
    },
    query,
    onChanged: onGameChanged,
    bus
  })
  const { battle, scenery, obstacles, anim, swings, shots, grenades, mines, effects, numbers, airDrops, dropIn } =
    engine
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

  let time = 0
  /** `[0x4bd6c8]` — how far toward the hand the camera's HEIGHT moves in one
   * engine frame (0x4a3072). A third, and no more. */
  const EYE_LAG = 0.333
  /** The eye as of the last ENGINE frame, and which frame that was. */
  let heldEye = { x: 0, y: 0, z: 0 }
  let eyeFrame = -1
  /** Whether there is a previous height for the lag below to come from. */
  let settled = false
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
  /** …and the mines a pig who KNOWS about them can see, plus the trodden ones,
   * which wear the MAP's own `WE_APMIN` (three/mineArt.ts). */
  const mineArt = createMineArt(root, (name) => props.spawn(name))
  /**
   * Camera and marker onto a pig, wherever it happens to be standing — or
   * hanging: a pig still on its canopy is watched from the front, face on,
   * and one mid-swing from the side, which is the original's own camera mode
   * for a hand-to-hand attack and the only thing that uses it (three/chase).
   */
  /**
   * Where the scope looks FROM: `SCOPE_MOUNT` in the hand bone's space, in
   * game space. The exe's rifle cam is bolted there (0x4a2ec0) and that is
   * where its wobble comes from — the hand rides a breathing chest.
   */
  const scopeEye = (soldier: Soldier): { x: number; y: number; z: number } => {
    // ONCE AN ENGINE FRAME, and held in between. The exe places this camera
    // once per game frame at fifteen a second; sampling an interpolated
    // skeleton at sixty turns the same breath into a glide, which is exactly
    // what play saw — "щас плавает, а в оригинале прям дрожит". The pose
    // itself still interpolates, so the pig moves smoothly and the view it is
    // holding does not.
    const frame = Math.floor(time / FRAME_SECONDS)
    if (frame === eyeFrame) return heldEye
    // A gap means the sights were down in between; start the lag afresh.
    if (frame > eyeFrame + 1) settled = false
    eyeFrame = frame
    const eyeAt = engine.pose.boneToWorld(soldier.pig, SCOPE_BONE, SCOPE_MOUNT) ?? heldEye
    // …and the HEIGHT LAGS. The exe does not put the camera at the hand's y —
    // it moves a THIRD of the way there each frame and no further:
    //
    //   4a304e  eax = boneY - cameraY
    //   4a3072  ...times the double at 0x4bd6c8, which is 0.333
    //   4a3082  bp += that
    //
    // x and z are taken outright. So the picture snaps sideways with the hand
    // and drags vertically behind it, which is a good deal less steady than
    // either axis is on its own. `eyeFrame < 0` is the first frame of a
    // sighting, where there is nothing to lag from.
    heldEye = {
      x: eyeAt.x,
      y: settled ? heldEye.y + (eyeAt.y - heldEye.y) * EYE_LAG : eyeAt.y,
      z: eyeAt.z
    }
    settled = true
    return heldEye
  }

  /** Which view the ACTING pig was last watched from — the debug surface's, so
   * a spec can tell the rig's views apart (three/debug.ts, `view`). */
  let lastView = 'chase'

  const watch = (soldier: Soldier, delta: number | null): void => {
    const acting = soldier.pig.id === now.acting
    // Something of the acting pig's is in the air, and the two families answer
    // differently — the whole table is `TRACKS_ITS_SHOT` in three/chase.ts. A
    // GUN asks for mode 1, which stands still and TURNS after the bullet; a
    // THROWN weapon asks for mode 0x0B, whose handler this build has lost and
    // whose row is 3000 straight behind at the flight's own height. The NEWEST
    // projectile is the one it answers for.
    const flying = now.bullets.length > 0 ? now.bullets : now.lobs
    const bullet = now.firing?.phase === 'flight' ? (flying[flying.length - 1] ?? null) : null
    if (bullet && acting) {
      const at = drawnAt(`${now.bullets.length > 0 ? 'shot' : 'lob'}:${bullet.id}`, bullet)
      const thrown = weaponLayer(pigShot(soldier.pig.id)?.holding ?? null) === 'lob'
      if (thrown) chase.pursue(at, Math.atan2(bullet.vx, bullet.vz), delta)
      else chase.watch(at)
      soldier.node.visible = true
      lastView = thrown ? 'pursue' : 'watch'
      return
    }
    // …and so does what the blow left behind. Mode 0 on the crate, which is
    // the ordinary chase rig with something other than a pig in it
    // (0x4661c2).
    if (now.aftermath && acting) {
      chase.ride(drawnAt('aftermath', now.aftermath.at), soldier.pig.heading, delta)
      soldier.node.visible = true
      lastView = 'ride'
      return
    }
    // A THROWN weapon has a camera of its own, and two of them — BOTH the exe's
    // (three/chase.ts). Taking one in HAND is what changes the view, which is
    // 0x493BB0's own dispatch and mode 4; holding the VIEW key is the TR cam,
    // mode 0x12. **The fire button has nothing to do with either of them**, and
    // a gun changes nothing on either count — 0x493BB0 skips it outright.
    const lobbing = acting && weaponLayer(pigShot(soldier.pig.id)?.holding ?? null) === 'lob'
    const view: View = pigShot(soldier.pig.id)?.underCanopy
      ? 'face'
      : acting && now.swinging
        ? 'melee'
        : // The aim view, held, and only for something that shoots — the exe
          // picks mode 0x0E by WEAPON (0x492dfa) and gates it on the same test
          // the melee camera is gated on, which is false through a swing.
          acting && now.scoped
          ? 'scope'
          : lobbing && now.sighting
            ? 'throw'
            : lobbing
              ? 'lob'
              : 'chase'
    if (acting) lastView = view
    chase.follow(
      drawnStance(soldier),
      soldier.node.position.y,
      dropInArt.riseOver(soldier.pig.id),
      delta,
      view,
      // The camera looks along the AIM, tremor and all — the picture FOLLOWS the
      // sight, which is what play asked for and what makes it honest.
      aimRadians(now.aimAngle),
      0,
      view === 'scope' ? scopeEye(soldier) : null
    )
    // The pig's own body is IN the way of its own eye. Hide the acting model
    // while the scope is up — every other pig stays, because those are what
    // is being aimed at.
    soldier.node.visible = view !== 'scope'
    // …**and a pig inside a SHELTER is not drawn at all**, which is the engine's
    // own word rather than a flourish: the exe clears `[pig+0x30]`, the byte its
    // draw loop gates every object on (lib/game/indoors.ts). The camera stays
    // where it is — pointed at the building he is in.
    if (pigShot(soldier.pig.id)?.sheltered) soldier.node.visible = false
  }

  /** Take the battle to a pig, and the camera and marker with it. */
  const focus = (pig: Pig): void => {
    battle.focus(pig)
    // A different pig is not a movement: both ends of the tween become where
    // this one is standing.
    settle()
    sounds.reset()
    marker.moveTo(pig.position.x, query.height(pig.position.x, pig.position.z), pig.position.z)
    const soldier = squad.of(pig.id)
    if (soldier) watch(soldier, null)
  }

  /**
   * The last reading of the battle, and the ONLY thing below draws from it
   * (lib/game/snapshot.ts).
   *
   * Held rather than asked for again: the dashboard asks for plates and numbers
   * between frames, and two readings of one frame would be two different
   * pictures.
   */
  let now = engine.snapshot()
  const pigShot = (id: number): PigShot | undefined => now.pigs.find((one) => one.id === id)

  /** Where the acting pig stood at a step boundary — the two the picture is
   * drawn between. */
  interface Stance {
    x: number
    y: number
    z: number
    heading: number
    /** Whose stance it is: the battle hands the turn on inside a step, and one
     * pig's place is not the next one's to be drawn between. */
    pig: number
    /** The engine's own word on whether it is in the water (three/chase.ts). */
    swimming: boolean
  }
  const stanceNow = (): Stance => {
    const at = engine.snapshot()
    const { x, y, z, heading, swimming } = at.loco
    return { x, y, z, heading, swimming, pig: at.acting }
  }
  let before: Stance = stanceNow()
  let after: Stance = before
  /** A jump in the state is not a movement to draw: a new turn, a warp, the
   * moment the squad lands. Both ends become the same place, so nothing is
   * tweened across the map. */
  const settle = (): void => {
    after = stanceNow()
    before = after
  }

  /**
   * Put the acting pig somewhere, and the picture with it — the debug surface's
   * ONE write (three/debug.ts), and the training jump below uses the same one.
   */
  const warp = (x: number, z: number, heading: number): void => {
    battle.warp(x, z, heading)
    settle()
    const pig = game.currentPig
    squad.of(pig.id)?.place(pig.position.x, pig.position.y, pig.position.z, pig.heading)
  }

  /**
   * **Jump the training ground to one of its steps** — the console's and F11/F12's
   * (ui/battle.ts). The chain itself is `lib/game/training.ts`; what belongs here
   * is the standing and the collecting, since a warp is a picture as well as a
   * position.
   *
   * The crate is COLLECTED rather than conjured: the pig is stood on it and
   * `Scenery.collect` is the very call the frame makes, so the inventory, the
   * briefing bar and the sergeant's line all come out of the ordinary path. What
   * IS the remake's own is putting the thing in the pig's hands afterwards —
   * the original wants the skill menu for that, and a jump exists to skip the
   * walking, not to make a point.
   */
  const trainingStep = (step: number): boolean => {
    if (!engine.training) return false
    const at = advanceTraining(step, { targets: engine.targets, scenery, airDrops })
    if (!at) return true
    // Facing whatever the step asks to be broken next, so the jump lands looking
    // at the job rather than at the sky.
    const target = engine.targets.find((one) => one.id === nextBreak(step))
    const heading = target
      ? Math.atan2(target.x - at.x, target.z - at.z)
      : game.currentPig.heading
    warp(at.x, at.z, heading)
    scenery.collect(game.currentPig)
    // Whatever that just handed over goes into the hands — a health crate hands
    // over nothing to hold, and leaves them empty.
    const holding = game.currentPig.carrying[game.currentPig.carrying.length - 1]
    game.currentPig.holding = holding?.skill ?? null
    onGameChanged()
    return true
  }

  /**
   * …and everything else the engine moves that has an IDENTITY: what is in the
   * air, what is coming down under a canopy, and the spot a blow left behind
   * (three/tween.ts). The camera rides these, and it eases where it stands but
   * not what it looks at — so a stepping target goes almost entirely into the
   * aim, which is the shake play reported.
   */
  const tween = createTween()
  const marks = (): [unknown, Point][] => {
    const at = engine.snapshot()
    const out: [unknown, Point][] = []
    for (const shot of at.bullets) out.push([`shot:${shot.id}`, shot])
    for (const lob of at.lobs) out.push([`lob:${lob.id}`, lob])
    // A crate only moves DOWN, and `raise` is the only thing that reads it.
    for (const one of at.crates) out.push([`crate:${one.id}`, { x: 0, y: one.y, z: 0 }])
    for (const one of at.pigs) if (one.arriving) out.push([`drop:${one.id}`, one])
    // There is only ever one beat, so it needs no number of its own.
    if (at.aftermath) out.push(['aftermath', at.aftermath.at])
    return out
  }
  /** Where to DRAW something the engine moves. */
  const drawnAt = (key: unknown, now: Point): Point => tween.at(key, now, engine.alpha())

  /**
   * Where a pig is being DRAWN — which is what the camera frames, never the
   * engine's own numbers.
   *
   * Three ways a pig gets a position, and each has its own history: one still
   * on a canopy is coming down under it, the acting one is walking, and
   * anything else is standing exactly where it stands.
   */
  const drawnStance = (soldier: Soldier): Omit<Stance, 'pig'> => {
    // Only the acting pig is DRIVEN, so only it has a locomotion state to ask
    // whether it is in the water; nothing else is followed closely enough for
    // the swim framing to matter (three/chase.ts).
    const swimming = soldier.pig.id === now.acting && now.loco.swimming
    const shot = pigShot(soldier.pig.id)
    if (shot?.arriving) {
      const at = drawnAt(`drop:${shot.id}`, shot)
      return { ...at, heading: shot.heading, swimming }
    }
    if (soldier.pig.id === now.acting) return stanceAt(engine.alpha())
    const at = shot ?? soldier.pig.position
    return { x: at.x, y: at.y, z: at.z, heading: shot?.heading ?? soldier.pig.heading, swimming }
  }

  /** Where to draw it, `alpha` of the way from the one to the other. Heading
   * takes the SHORT way round, or a pig crossing north spins the long way. */
  const stanceAt = (alpha: number): Omit<Stance, 'pig'> => {
    const turn = ((after.heading - before.heading + Math.PI) % (2 * Math.PI)) - Math.PI
    return {
      x: before.x + (after.x - before.x) * alpha,
      y: before.y + (after.y - before.y) * alpha,
      z: before.z + (after.z - before.z) * alpha,
      heading: before.heading + turn * alpha,
      // Not a thing to interpolate: it is where the pig ENDED the step.
      swimming: after.swimming
    }
  }

  /**
   * Everything the frame LOOKS like, read back off the battle once it has run.
   *
   * Every branch the engine takes — the drop, the beat after a blow, an
   * ordinary frame — ends up watching the SAME pig, the acting one, so the
   * camera is placed once here rather than at each of the engine's own exits.
   */
  const show = (delta: number): void => {
    const arriving = now.pigs.filter((one) => one.arriving)
    // The squad coming down: each pig where its own descent has got to, and
    // the canopies heard the first frame the bank can play them.
    dropInArt.draw(arriving, (one) => drawnAt(`drop:${one.id}`, one))
    sounds.chuteOverhead(now.dropping)
    const active = squad.of(now.acting)
    if (!active) return
    if (!now.dropping && !now.starting && !now.over) {
      // The acting pig stands where the locomotion state says, and the camera
      // stops holding the moment the player drives (three/chase.ts).
      chase.hold(
        now.loco.airborne?.bouncing === true || now.loco.airborne?.ejected === true,
        now.driving,
        delta
      )
      sounds.follow(now.loco, now.loco.swimming)
      // BETWEEN the last two steps. The rules move in fixed quanta and the
      // screen does not, so what is drawn is the pig partway from where it
      // stood to where it now stands (lib/game/engine.ts, STEP_SECONDS). The
      // pig itself is not moved by this — `place` draws (three/squad.ts).
      const at = stanceAt(engine.alpha())
      active.place(at.x, at.y, at.z, at.heading)
      marker.moveTo(at.x, query.height(at.x, at.z), at.z)
      // The model is not in the hand until the getting-it-out clip has run.
      for (const soldier of squad.members) {
        const reaching = soldier === active && now.readying > 0
        const held = pigShot(soldier.pig.id)?.holding ?? null
        weapons.show(soldier.mesh, reaching ? null : weaponModelName(held))
      }
    }
    // **THE MISSION IS OVER: EVERY PIG PUTS ITS WEAPON DOWN.** Play: "анимация
    // победы играется в позе вытащенного оружия — все оружия надо убрать у всех
    // свинов." The engine empties the hands (lib/game/battle.ts), but the block
    // above that takes the model off the arm does not run once the battle is in
    // its ending — so the mesh stayed where it was.
    if (now.ending) {
      for (const soldier of squad.members) weapons.show(soldier.mesh, null)
    }
    // …and every pig in a building is gone from the picture, acting or not.
    for (const soldier of squad.members) {
      if (pigShot(soldier.pig.id)?.sheltered) soldier.node.visible = false
    }
    // A magnified view really is magnified. Where 0x1000 of `afSetZoom` puts a
    // field of view is the library's and the library is not in the install, so
    // SCOPE_MAGNIFY is the remake's pick and three/chase.ts says so.
    const magnified = openFov / (1 + now.zoom * (SCOPE_MAGNIFY - 1))
    if (Math.abs(host.camera.fov - magnified) > 1e-4) {
      host.camera.fov = magnified
      host.camera.updateProjectionMatrix()
    }
    // **THE MISSION IS OVER**, and the camera is no longer the acting pig's: the
    // exe's END OF GAME walks the survivors, one every two seconds, and hands
    // each to the camera as its subject (lib/game/endOfGame.ts). Which pig is the
    // engine's to say; all this does is point the ordinary chase at it.
    watch((now.ending ? squad.of(now.ending.watching) : null) ?? active, delta)
  }


  /** The last frame's own length, seconds — kept only so a spec can pair a
   * displacement with the time that produced it (three/debug.ts, `frame`). */
  let lastFrame = 0

  /** How long this pause has been touring, and whether one is under way. */
  let touring = 0
  let surveying = false

  /**
   * THE PAUSE'S OWN CAMERA — the exe's mode 7, entered at 0x49205F and put
   * back on the way out.
   *
   * A paused mission is not a still picture in the original: the world stops
   * and the camera pulls back to 11000 and goes round the field, one pig every
   * 0x7D frames. It tours the pigs the DRAW loop is drawing — the `+0x30` byte
   * the tour tests is the one a shelter clears — so a pig indoors is skipped,
   * and so is a dead one.
   *
   * It runs on the frame's own delta and not the engine's, because it is a
   * camera: the world is not stepping and must not be made to.
   */
  const survey = (delta: number): void => {
    const first = !surveying
    surveying = true
    touring = first ? 0 : touring + delta
    const shown = now.pigs.filter((pig) => pig.health > 0 && !pig.sheltered)
    const index = touredIndex(touring, shown.length)
    const soldier = index < 0 ? null : squad.of(shown[index].id)
    if (!soldier) return
    // `null` on the first frame of a pause SNAPS rather than glides, the same
    // way a new acting pig does — the camera has 11000 units to travel and
    // sliding all of it would read as a swoop the original does not have.
    chase.follow(drawnStance(soldier), soldier.node.position.y, 0, first ? null : delta, 'map')
    lastView = 'map'
  }

  const onFrame = (delta: number): void => {
    // The mission's clock does not start until the mission is on screen — but
    // a PAUSE is not that: the world stops and the camera goes touring.
    if (!running()) {
      if (paused()) survey(delta)
      return
    }
    surveying = false
    time += delta
    lastFrame = delta
    // **THE LINE COMES BEFORE THE SHOT**, so the rules are told whether the pig
    // is still talking before they step (play's rule, lib/game/shot.ts). Ahead
    // of `engine.update`, like every other input.
    battle.setSpeaking(sounds.saying())
    // The GAME, in whole steps — the order of events and everything running
    // with it, the engine's own business from end to end. A step that is about
    // to run leaves behind where the pig stood, which is what the picture is
    // drawn from (lib/game/engine.ts).
    const steps = engine.update(delta, () => {
      before = stanceNow()
      tween.from(marks())
    })
    // ONE reading of the battle, and everything below draws from it
    // (lib/game/snapshot.ts).
    now = engine.snapshot()
    if (steps > 0) {
      after = stanceNow()
      if (before.pig !== after.pig) before = after
      tween.to(marks())
    }
    // …and then everything that SHOWS it. Every mixer is brought into line with
    // what the engine now says each pig wears (three/wear.ts).
    wear.apply(now.pigs, engine.alpha())
    show(delta)
    marker.bob(time)
    // …and what the engine says is in the air gets drawn where it now is. Once
    // a frame, after everything that could have moved or spent one.
    bulletArt.draw(now.bullets, delta, (shot) => drawnAt(`shot:${shot.id}`, shot))
    grenadeArt.draw(now.lobs, delta, (lob) => drawnAt(`lob:${lob.id}`, lob))
    // The minefield, through the eyes of whoever's turn it is: a buried mine is
    // shown to the side that has somebody near it who can see one, and to nobody
    // else (lib/game/mines.ts).
    // …plus every one that has been TRODDEN ON: play asked for the mine to show
    // itself the moment a foot finds it, and by then it is nobody's secret. Those
    // are the ENGINE's own art and get its model (`WE_APMIN`), which is why the
    // two lists go in separately.
    mineArt.draw(mines.revealed(game.currentPlayer.pigs), mines.at())
    // **AND WHATEVER STANDS BETWEEN THE CAMERA AND THE PIG GOES SEE-THROUGH.**
    // Play: "здание не просвечивает когда свинья внутри." Indoors the camera has
    // nowhere to swing to — every heading is a wall (lib/game/sightline.ts) — so
    // the wall fades instead. From the eye to the pig's own middle rather than its
    // feet, or the floor it stands on counts as being in the way.
    // The eye in GAME space, wanted twice below: the sky is centred on it —
    // an infinite dome drawn at a size a depth buffer can hold (three/sky.ts) —
    // and the see-through test measures from it. AFTER `show`, which is what
    // moved the camera this frame.
    root.worldToLocal(eyeInGame.copy(host.camera.position))
    sky?.follow(eyeInGame)
    // The weather rides the camera the same way, and takes its own drift off
    // how far the camera turned this frame — so it goes after `show` too.
    weather?.draw(delta)
    const watched = squad.of(game.currentPig.id)
    if (watched) {
      const { x, y, z } = game.currentPig.position
      props.fade(
        crossedTowards(
          blockers,
          eyeInGame,
          // HIS OWN SILHOUETTE — nine points of it, each ray stopped at his
          // NEAR SIDE, and a box has to cover half of them to be in the way
          // (lib/game/seeThrough.ts). Nothing is grown before the test: the
          // margin that used to be here faded whatever stood BESIDE him.
          silhouetteOf(eyeInGame, { x, y, z }, PIG_HEIGHT, PIG_RADIUS, PIG_HOLD / 2)
        )
      )
    }
    effectArt.draw(now.effects)
    airDropArt.draw(now.crates, (one) => drawnAt(`crate:${one.id}`, { x: 0, y: one.y, z: 0 }).y)
  }
  host.onFrame.add(onFrame)

  exposeBattleDebug({
    game,
    query,
    obstruction: engine.obstacles,
    squad,
    dropIn,
    props,
    objectCount: assets.objects.length,
    camera: host.camera,
    // Measured against the eye as it stood at the end of the last frame,
    // which is what `follow` was given.
    sky: () => sky?.state(eyeInGame) ?? null,
    weather: () => weather?.state() ?? null,
    sounds: () => sounds.played(),
    barks: () => sounds.spoken(),
    still: () => battle.view().still,
    strings: () => assets.strings,
    swinging: () => swings.running(),
    strike: () => swings.lastStrike(),
    effects: () => effects.rings(),
    smoke: () => effects.smoke(),
    fire: () => effects.fire(),
    script: () => ({ absent: scenery.waiting(), falling: airDrops.falling() }),
    shots: () => shots.live().length,
    aim: () => battle.aim(),
    grenades: () => grenades.at(),
    charges: () => grenadeArt.charges(),
    burning: () => grenadeArt.burning(),
    mines: () => mines.at().map((one) => ({ x: one.x, y: one.y, z: one.z, fuse: one.fuse })),
    mineMarkers: () => mineArt.shown(),
    map: () => ({ eye: eye(), blips: blips() }),
    minesTripped: () => mineArt.tripped(),
    charging: () => battle.charging(),
    firing: () => battle.view().firing?.phase ?? null,

    shelter: () => {
      const view = battle.view()
      const drawn = squad.of(game.currentPig.id)?.node.visible === true
      return { inside: view.inside?.id ?? null, doorway: view.doorway?.id ?? null, drawn }
    },
    frame: () => lastFrame,
    view: () => lastView,
    aftermath: () => battle.view().aftermath !== null,
    /**
     * The acting pig's POSE, from BOTH ends of the chain.
     *
     * Play: "реально не двигается у нас" — the body does not move while it walks,
     * and there is no way to tell by eye which half is at fault. `foot` is the
     * engine's own sampler (lib/game/bonePose.ts) reading the ankle relative to
     * the hip, so the pig's own travel is out of it; `drawn` is the quaternion
     * that same bone is actually WEARING on the skinned mesh. If `foot` moves and
     * `drawn` does not, it is the renderer; if neither moves, it is the clip.
     */
    pose: () => {
      const pig = game.currentPig
      const worn = now.pigs.find((one) => one.id === pig.id)
      const hip = engine.pose.boneToWorld(pig, 0, { x: 0, y: 0, z: 0 })
      const ankle = engine.pose.boneToWorld(pig, 11, { x: 0, y: 0, z: 0 })
      // …and EVERY bone the mesh is wearing, in HIR order, because "that part of
      // the body does not move at all" is a question about which bones are dead
      // and no summary answers it.
      const bones = squad.of(pig.id)?.mesh.bones ?? []
      const bone = bones[11]
      return {
        clip: worn?.clip ?? null,
        elapsed: worn?.clipElapsed ?? 0,
        // What the keyframe head is doing to the whole body — the bob, on the
        // root bone (lib/game/clipPose.ts).
        lift: bones[0]?.position.y ?? 0,
        bones: bones.map(
          (one) =>
            [one.quaternion.x, one.quaternion.y, one.quaternion.z, one.quaternion.w] as [
              number,
              number,
              number,
              number
            ]
        ),
        foot:
          hip && ankle
            ? ([ankle.x - hip.x, ankle.y - hip.y, ankle.z - hip.z] as [number, number, number])
            : null,
        drawn: bone
          ? ([bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w] as [
              number,
              number,
              number,
              number
            ])
          : null
      }
    },
    walkAway: () => battle.view().walkAway,
    ending: () => {
      const ending = battle.view().ending
      return ending === null
        ? null
        : { won: ending.won, watching: ending.watching, elapsed: ending.elapsed }
    },
    targetsLeft: () => engine.targetsLeft(),
    cutTurnBeat: () => battle.cutTurnBeat(),
    warp
  })

  return {
    battle,
    focus,
    dropping: () => now.dropping,
    plates: (width, height, lift) => squad.plates(host.camera, width, height, lift),
    numbers: (width, height) => projectDamage(now.numbers, host.camera, root, width, height),
    still: () => now.still,
    eye,
    blips,
    charging: battle.charging,
    scoped: () => now.scoped,
    aim: battle.aim,
    trainingStep,
    dispose() {
      host.onFrame.delete(onFrame)
      host.scene.remove(root)
      sky?.dispose()
      weather?.dispose()
      terrain.dispose()
      props.dispose()
      dropInArt.dispose()
      marker.dispose()
      effectArt.dispose()
      bulletArt.dispose()
      grenadeArt.dispose()
      mineArt.dispose()
      airDropArt.dispose()
      weapons.dispose()
      squad.dispose()
    }
  }
}
