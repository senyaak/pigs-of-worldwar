// The battle scene: a real map with two squads of pigs standing on it.
// Everything game-space (Y-down) under the usual 180°-X group; the camera
// works in three's Y-up world and follows the active pig.

import * as THREE from 'three'
import type {
  Bone,
  Clip,
  MapObject,
  MapProp,
  Model,
  TerrainBlock,
  TerrainTexture,
  Texture
} from '../api'
import type { Game, Pig } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildWaterMask } from '../../../lib/game/watermask'
import { ANIM, SWIM_SINK, createLocomotion, restingY, updateLocomotion } from '../../../lib/game/locomotion'
import type { LocomotionState } from '../../../lib/game/locomotion'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildMapProps } from './props'
import { classArt } from './soldiers'
import { buildPig } from './pig'
import type { Pig as PigMesh } from './pig'
import { createPlayer } from './clips'
import type { Player as ClipPlayer } from './clips'
import type { SceneHost } from './scene'
import { controller } from '../input/controller'

/** One dressed soldier model out of Chars/british.mad. */
export interface SoldierArt {
  /** Archive base name, e.g. `pcgru_hi` (three/soldiers.ts). */
  base: string
  model: Model
  textures: Texture[]
}

export interface BattleAssets {
  blocks: TerrainBlock[]
  terrainTextures: TerrainTexture[]
  /** Every model the squads need — one per class group on the map. The
   * first is the fallback for a class nothing loaded art for. */
  soldiers: SoldierArt[]
  skeleton: Bone[]
  clips: Clip[]
  /** The map's .POG records and the geometry they name. Empty is fine — a
   * map whose objects failed to load still plays. */
  objects: MapObject[]
  props: MapProp[]
  propTextures: Texture[]
}

export interface BattleScene {
  /** Point the camera at the active pig and park the marker over it. */
  focus(pig: Pig): void
  /** Tank controls from the input layer: walk -1|0|1 (back/stop/forward),
   * turn -1|0|1 (left/stop/right). */
  setIntent(walk: number, turn: number): void
  /** Ask the acting pig to jump (ignored mid-air, swimming or sliding). */
  jump(): void
  dispose(): void
}

// The model's own forward axis — chosen so a pig FACES where it walks
// (π had them strolling sideways like crabs; π/2 had them moonwalking).
const PIG_HEADING_OFFSET = -Math.PI / 2

export function buildBattle(
  host: SceneHost,
  assets: BattleAssets,
  game: Game,
  /** Called whenever the game state changed this frame (HUD refresh). */
  onGameChanged: () => void
): BattleScene {
  // The per-texel water verdict rides on the same art the ground draws —
  // a pig stands on the painted dry half of a shore tile and swims one
  // step further, exactly where the water shows.
  const query = new TerrainQuery(assets.blocks, buildWaterMask(assets.blocks, assets.terrainTextures))
  const root = new THREE.Group()
  root.rotation.x = Math.PI

  const terrain: Terrain = buildTerrain(assets.blocks, assets.terrainTextures)
  // buildTerrain wraps in its own converted group; unwrap into ours. Its
  // one child is the inner game-space group — ground and water together.
  const terrainMesh = terrain.group.children[0]
  root.add(terrainMesh)

  // Whatever the map stands on its ground: trees, crates, bridges, and on
  // the training map the dummies and the gate.
  const props = buildMapProps(assets.objects, assets.props, assets.propTextures)
  root.add(props.group)

  interface PigEntry {
    pig: Pig
    mesh: PigMesh
    node: THREE.Object3D
    player: ClipPlayer
    clip: number | null
    /** The archive base actually drawn — which is the fallback when the
     * pig's class had no art of its own. */
    art: string
  }
  const pigMeshes: PigEntry[] = []
  const setClip = (entry: PigEntry, index: number | null): void => {
    if (entry.clip === index) return
    entry.clip = index
    entry.player.play(index === null ? null : (assets.clips[index] ?? null))
  }
  const artFor = (pigClass: number): SoldierArt =>
    assets.soldiers.find((art) => art.base === classArt(pigClass)) ?? assets.soldiers[0]
  for (const player of game.players) {
    for (const pig of player.pigs) {
      const art = artFor(pig.pigClass)
      const mesh = buildPig(art.model, art.textures, assets.skeleton)
      const node = mesh.group.children[0]
      node.position.set(
        pig.position.x,
        query.height(pig.position.x, pig.position.z) - mesh.footOffset,
        pig.position.z
      )
      node.rotation.y = pig.heading + PIG_HEADING_OFFSET
      root.add(node)
      const entry: PigEntry = {
        pig,
        mesh,
        node,
        player: createPlayer(mesh),
        clip: null,
        art: art.base
      }
      setClip(entry, ANIM.IDLE)
      pigMeshes.push(entry)
    }
  }

  // The active-pig marker: a slowly bobbing cone overhead (game-space, so
  // it lives under the same converted root).
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(60, 140, 4),
    new THREE.MeshStandardMaterial({ color: 0xd8e08a })
  )
  marker.rotation.x = Math.PI // point down in Y-down space
  root.add(marker)

  host.scene.add(root)

  let markerBase = new THREE.Vector3()
  let time = 0
  const intent = { walk: 0, turn: 0 }
  let jumpRequested = false
  /** The acting pig's frame-by-frame state — walking, wedged, airborne —
   * lives in the pure domain (lib/game/locomotion); this scene only feeds
   * it intents and draws what it says. Reset whenever the acting pig
   * changes or is warped. */
  let loco: LocomotionState = createLocomotion(query, 0, 0, 0)
  /** Smoothed chase-camera position (world space). */
  const cameraPos = new THREE.Vector3()
  let cameraSnapped = false
  /** After a flight the camera stays put this long before gliding back
   * behind the pig — resuming the chase the instant of landing is a jolt. */
  const CHASE_DELAY = 0.5
  let chaseWait = 0

  host.camera.near = 10
  host.camera.far = 100_000
  host.camera.updateProjectionMatrix()

  /** Sync a pig's node to its game position: soles on the ground, sunk a
   * little when swimming. */
  const settle = (entry: PigEntry): void => {
    const { x, z } = entry.pig.position
    entry.node.position.set(x, restingY(query, x, z) - entry.mesh.footOffset, z)
  }

  /**
   * The height the camera frames a pig at: its node, less the sink when it
   * is afloat.
   *
   * A swimming pig hangs SWIM_SINK below the water, and the moment the
   * per-texel test concedes that a paddling pig IS swimming, it drops that
   * whole distance in ONE frame — 280 units, on a shore whose seabed sits
   * exactly at the water level, so nothing about the ground eases it. The
   * camera followed the drop and lurched. Taking the same sink back off the
   * height it frames cancels it exactly: the swap happens on the frame the
   * pig sinks, so the two moves annihilate and the view never moves at all.
   */
  const framedY = (entry: PigEntry): number => {
    const { x, z } = entry.pig.position
    return entry.node.position.y - (query.isWater(x, z) ? SWIM_SINK : 0)
  }

  /**
   * The chase camera hangs behind the pig's shoulders (world space; the
   * root flips Y and Z out of the game's Y-down coordinates), clamped
   * above the terrain so hills never swallow the view.
   *
   * Both heights are held against the VISIBLE surface rather than the
   * ground, so a shore whose seabed runs on under the water sheet neither
   * drags the gaze below the waterline nor sinks the camera under it — from
   * beneath, an opaque sheet is the whole view.
   */
  const desiredCamera = (pig: Pig, nodeY: number): { position: THREE.Vector3; target: THREE.Vector3 } => {
    const waterline = -query.surface(pig.position.x, pig.position.z)
    const target = new THREE.Vector3(
      pig.position.x,
      Math.max(-nodeY, waterline) + 300,
      -pig.position.z
    )
    const behindX = pig.position.x - Math.sin(pig.heading) * 2100
    const behindZ = pig.position.z - Math.cos(pig.heading) * 2100
    const terrainAtCamera = -query.surface(behindX, behindZ)
    const position = new THREE.Vector3(
      behindX,
      Math.max(target.y + 900, terrainAtCamera + 500),
      -behindZ
    )
    return { position, target }
  }

  const updateCamera = (active: PigEntry, delta: number | null): void => {
    const { position, target } = desiredCamera(active.pig, framedY(active))
    if (delta === null || !cameraSnapped) {
      cameraPos.copy(position)
      cameraSnapped = true
    } else if (chaseWait <= 0) {
      // The chase never chases a FLUNG pig: thrown, bouncing or sliding,
      // the original's camera stands where it was and follows with its
      // gaze alone — chasing one spun the view and drove it into the wall
      // the pig had just been thrown off. `chaseWait` above is the whole
      // rule: parked through involuntary flight and a beat beyond it,
      // cleared the instant the player drives.
      cameraPos.lerp(position, 1 - Math.exp(-6 * delta))
    }
    host.camera.position.copy(cameraPos)
    host.camera.lookAt(target)
  }

  const focus = (pig: Pig): void => {
    loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading)
    chaseWait = 0
    const ground = query.height(pig.position.x, pig.position.z)
    markerBase = new THREE.Vector3(pig.position.x, ground - 700, pig.position.z)
    marker.position.copy(markerBase)
    const active = pigMeshes.find((entry) => entry.pig === pig)
    if (active) updateCamera(active, null)
  }

  const update = (delta: number): void => {
    // The turn clock runs regardless of what anyone does.
    if (game.tick(delta)) {
      game.endTurn()
      jumpRequested = false
      focus(game.currentPig)
    }

    const active = pigMeshes.find((entry) => entry.pig === game.currentPig)
    if (!active) return
    for (const entry of pigMeshes) if (entry !== active) setClip(entry, ANIM.IDLE)

    // Position and facing are the game's; everything else the frame needs —
    // height, momentum, the wedge clock, which clip to wear — lives in the
    // locomotion state. Sync in, step one frame of the domain, sync back,
    // and draw exactly what it says.
    loco.x = active.pig.position.x
    loco.z = active.pig.position.z
    loco.heading = active.pig.heading
    updateLocomotion(
      loco,
      query,
      { walk: intent.walk, turn: intent.turn, jump: jumpRequested },
      delta
    )
    jumpRequested = false
    // The camera follows what the PLAYER does and stands off what happens
    // TO the pig. Involuntary flight — bounced or thrown — parks it (and
    // keeps it parked half a second past the landing); the player's own
    // input clears the wait at once, because walking must never face the
    // lens. A walk-off hop or a jump is the player driving, not flying.
    if (loco.airborne?.bouncing || loco.airborne?.ejected) chaseWait = CHASE_DELAY
    else if (intent.walk !== 0 || intent.turn !== 0) chaseWait = 0
    else chaseWait = Math.max(0, chaseWait - delta)
    game.moveCurrentPig(loco.x, loco.z, loco.heading)
    active.node.position.set(loco.x, loco.y - active.mesh.footOffset, loco.z)
    active.node.rotation.y = loco.heading + PIG_HEADING_OFFSET
    setClip(active, loco.clip)

    // Marker and camera trail the pig every frame.
    const ground = query.height(loco.x, loco.z)
    markerBase.set(loco.x, ground - 700, loco.z)
    marker.position.x = markerBase.x
    marker.position.z = markerBase.z
    updateCamera(active, delta)
    onGameChanged()
  }

  const onFrame = (delta: number): void => {
    time += delta
    update(delta)
    for (const { player } of pigMeshes) player.update(delta)
    marker.position.y = markerBase.y - Math.sin(time * 3) * 40
  }
  host.onFrame.add(onFrame)

  // A window onto the acting pig, so the e2e suite can assert on where it
  // actually IS rather than on what the HUD says about it. `warp` is the one
  // write: a spec that wants a pig in front of a particular wall cannot walk
  // it there across a whole map, and doing so through the controller would
  // test the walk, not the wall.
  window.pow = {
    ...(window.pow ?? { controller }),
    debug: {
      currentPig: () => ({ x: game.currentPig.position.x, z: game.currentPig.position.z }),
      currentHeading: () => game.currentPig.heading,
      currentNodeY: () => pigMeshes.find((e) => e.pig === game.currentPig)?.node.position.y ?? 0,
      /** The squads as they were fielded — where each pig started, what
       * class the map called it, and which art it actually wears. */
      squads: () =>
        game.players.map((player) => ({
          name: player.name,
          pigs: player.pigs.map((pig) => {
            const entry = pigMeshes.find((candidate) => candidate.pig === pig)
            return {
              name: pig.name,
              pigClass: pig.pigClass,
              art: entry?.art ?? '',
              x: pig.position.x,
              z: pig.position.z,
              heading: pig.heading
            }
          })
        })),
      /** What the map put on its ground: how many .POG records were drawn,
       * and where each one landed — the spec's only view of placement. */
      props: () => ({
        placed: props.placed,
        objects: assets.objects.length,
        at: props.group.children.map((mesh) => ({
          name: mesh.name,
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z
        }))
      }),
      /** Where the chase camera actually is, world space — the only way a
       * spec can tell "swimming" from "the view has gone under the water". */
      camera: () => ({ x: host.camera.position.x, y: host.camera.position.y, z: host.camera.position.z }),
      warp: (x: number, z: number, heading: number) => {
        game.moveCurrentPig(x, z, heading)
        loco = createLocomotion(query, x, z, heading)
        const entry = pigMeshes.find((e) => e.pig === game.currentPig)
        if (!entry) return
        entry.node.rotation.y = heading + PIG_HEADING_OFFSET
        settle(entry)
      }
    }
  }

  return {
    focus,
    setIntent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    jump() {
      jumpRequested = true
    },
    dispose() {
      host.onFrame.delete(onFrame)
      host.scene.remove(root)
      terrain.dispose()
      props.dispose()
      for (const { mesh } of pigMeshes) mesh.dispose()
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
  }
}
