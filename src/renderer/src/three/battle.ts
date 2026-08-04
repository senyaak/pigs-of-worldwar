// The battle scene: a real map with two squads of pigs standing on it.
// Everything game-space (Y-down) under the usual 180°-X group; the camera
// works in three's Y-up world and follows the active pig.

import * as THREE from 'three'
import type { Bone, Clip, Model, TerrainBlock, TerrainTexture, Texture } from '../api'
import type { Game, Pig } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildPig } from './pig'
import type { Pig as PigMesh } from './pig'
import { createPlayer } from './clips'
import type { Player as ClipPlayer } from './clips'
import type { SceneHost } from './scene'
import { controller } from '../input/controller'

export interface BattleAssets {
  blocks: TerrainBlock[]
  terrainTextures: TerrainTexture[]
  model: Model
  modelTextures: Texture[]
  skeleton: Bone[]
  clips: Clip[]
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
const WALK_SPEED = 900 // world units per second (tile = 512)
const SWIM_SPEED = WALK_SPEED / 2
const SLIDE_SPEED = 1400
const TURN_SPEED = 2.6 // radians per second
/** How deep a swimming pig sits below the surface (game Y-down: +down). */
const SWIM_SINK = 110
/** The stumble-in-place moment before a slide takes hold. */
const SLIP_STAGGER_SECONDS = 0.45
/** Jump ballistics, game Y-down: negative velocity is upward. */
const JUMP_VELOCITY = -1500
const GRAVITY = 5000

/** MCAP clip indices, from the exe's own animation-name table
 * (pigs-disasm/animations/notes.md). */
const ANIM = {
  RUN: 0,
  WALK_BACK: 3,
  TURN: 4,
  SWIM: 5,
  JUMP_MIDDLE: 9,
  SCRAMBLE: 11,
  IDLE: 27
} as const

export function buildBattle(
  host: SceneHost,
  assets: BattleAssets,
  game: Game,
  /** Called whenever the game state changed this frame (HUD refresh). */
  onGameChanged: () => void
): BattleScene {
  const query = new TerrainQuery(assets.blocks)
  const root = new THREE.Group()
  root.rotation.x = Math.PI

  const terrain: Terrain = buildTerrain(assets.blocks, assets.terrainTextures)
  // buildTerrain wraps in its own converted group; unwrap into ours.
  const terrainMesh = terrain.group.children[0]
  root.add(terrainMesh)

  interface PigEntry {
    pig: Pig
    mesh: PigMesh
    node: THREE.Object3D
    player: ClipPlayer
    clip: number | null
  }
  const pigMeshes: PigEntry[] = []
  const setClip = (entry: PigEntry, index: number | null): void => {
    if (entry.clip === index) return
    entry.clip = index
    entry.player.play(index === null ? null : (assets.clips[index] ?? null))
  }
  for (const player of game.players) {
    for (const pig of player.pigs) {
      const mesh = buildPig(assets.model, assets.modelTextures, assets.skeleton)
      const node = mesh.group.children[0]
      node.position.set(
        pig.position.x,
        query.height(pig.position.x, pig.position.z) - mesh.footOffset,
        pig.position.z
      )
      node.rotation.y = pig.heading + PIG_HEADING_OFFSET
      root.add(node)
      const entry: PigEntry = { pig, mesh, node, player: createPlayer(mesh), clip: null }
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
  /** Vertical velocity while airborne (game Y-down), null on the ground. */
  let airborne: { vy: number; vx: number; vz: number } | null = null
  let jumpRequested = false
  /** Stagger timer: > 0 means the pig is scrabbling in place before the
   * slide takes hold (reset whenever it reaches holding ground). */
  let stagger = 0
  /** Smoothed chase-camera position (world space). */
  const cameraPos = new THREE.Vector3()
  let cameraSnapped = false

  host.camera.near = 10
  host.camera.far = 100_000
  host.camera.updateProjectionMatrix()

  /** Sync a pig's node to its game position: soles on the ground, sunk a
   * little when swimming. */
  const settle = (entry: PigEntry): void => {
    const { x, z } = entry.pig.position
    const sink = query.isWater(x, z) ? SWIM_SINK : 0
    entry.node.position.set(x, query.height(x, z) + sink - entry.mesh.footOffset, z)
  }

  /**
   * The chase camera hangs behind the pig's shoulders (world space; the
   * root flips Y and Z out of the game's Y-down coordinates), clamped
   * above the terrain so hills never swallow the view.
   */
  const desiredCamera = (pig: Pig, nodeY: number): { position: THREE.Vector3; target: THREE.Vector3 } => {
    const target = new THREE.Vector3(pig.position.x, -nodeY + 300, -pig.position.z)
    const behindX = pig.position.x - Math.sin(pig.heading) * 2100
    const behindZ = pig.position.z - Math.cos(pig.heading) * 2100
    const terrainAtCamera = -query.height(behindX, behindZ)
    const position = new THREE.Vector3(
      behindX,
      Math.max(target.y + 900, terrainAtCamera + 500),
      -behindZ
    )
    return { position, target }
  }

  const updateCamera = (active: PigEntry, delta: number | null): void => {
    const { position, target } = desiredCamera(active.pig, active.node.position.y)
    if (delta === null || !cameraSnapped) {
      cameraPos.copy(position)
      cameraSnapped = true
    } else {
      cameraPos.lerp(position, 1 - Math.exp(-6 * delta))
    }
    host.camera.position.copy(cameraPos)
    host.camera.lookAt(target)
  }

  const focus = (pig: Pig): void => {
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
      stagger = 0
      airborne = null
      jumpRequested = false
      focus(game.currentPig)
    }

    const active = pigMeshes.find((entry) => entry.pig === game.currentPig)
    if (!active) return
    for (const entry of pigMeshes) if (entry !== active) setClip(entry, ANIM.IDLE)

    const { x: px, z: pz } = active.pig.position
    const swimming = query.isWater(px, pz)
    const slip = airborne === null ? query.slipDirection(px, pz) : null

    // Turning on the spot works in every grounded state.
    if (intent.turn !== 0 && airborne === null) {
      game.turnCurrentPig(active.pig.heading + intent.turn * TURN_SPEED * delta)
      active.node.rotation.y = active.pig.heading + PIG_HEADING_OFFSET
    }

    if (airborne) {
      setClip(active, ANIM.JUMP_MIDDLE)
      // Ballistics: gravity pulls (game Y-down: +down), momentum carries.
      const x = px + airborne.vx * delta
      const z = pz + airborne.vz * delta
      const moved = query.walkable(x, z)
      if (moved) game.moveCurrentPig(x, z, active.pig.heading)
      const at = active.pig.position
      airborne.vy += GRAVITY * delta
      const y = active.node.position.y + airborne.vy * delta
      const ground =
        query.height(at.x, at.z) + (query.isWater(at.x, at.z) ? SWIM_SINK : 0) - active.mesh.footOffset
      if (airborne.vy > 0 && y >= ground) {
        airborne = null
        settle(active)
      } else {
        active.node.position.set(at.x, y, at.z)
      }
    } else if (slip) {
      // Steep ground: a short scramble on the spot, then the slide — going
      // where nobody wanted to go.
      setClip(active, ANIM.SCRAMBLE)
      stagger += delta
      if (stagger >= SLIP_STAGGER_SECONDS) {
        const step = SLIDE_SPEED * delta
        const x = px + slip.x * step
        const z = pz + slip.z * step
        if (query.walkable(x, z)) {
          game.displaceCurrentPig(x, z)
          settle(active)
        }
      }
    } else {
      stagger = 0
      const speed = swimming ? SWIM_SPEED : WALK_SPEED
      const forwardX = Math.sin(active.pig.heading)
      const forwardZ = Math.cos(active.pig.heading)

      if (jumpRequested && !swimming) {
        airborne = {
          vy: JUMP_VELOCITY,
          vx: forwardX * intent.walk * speed,
          vz: forwardZ * intent.walk * speed
        }
      } else if (intent.walk !== 0) {
        const step = speed * delta * intent.walk
        const x = px + forwardX * step
        const z = pz + forwardZ * step
        if (query.walkable(x, z)) {
          game.moveCurrentPig(x, z, active.pig.heading)
          settle(active)
          setClip(active, swimming ? ANIM.SWIM : intent.walk > 0 ? ANIM.RUN : ANIM.WALK_BACK)
        } else {
          setClip(active, swimming ? ANIM.SWIM : ANIM.IDLE)
        }
      } else if (swimming) {
        setClip(active, ANIM.SWIM)
      } else if (intent.turn !== 0) {
        setClip(active, ANIM.TURN)
      } else {
        setClip(active, ANIM.IDLE)
      }
    }
    jumpRequested = false

    // Marker and camera trail the pig every frame.
    const ground = query.height(active.pig.position.x, active.pig.position.z)
    markerBase.set(active.pig.position.x, ground - 700, active.pig.position.z)
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

  // A read-only window onto the acting pig, so the e2e suite can assert on
  // where it actually IS rather than on what the HUD says about it.
  window.pow = {
    ...(window.pow ?? { controller }),
    debug: {
      currentPig: () => ({ x: game.currentPig.position.x, z: game.currentPig.position.z }),
      currentHeading: () => game.currentPig.heading,
      currentNodeY: () => pigMeshes.find((e) => e.pig === game.currentPig)?.node.position.y ?? 0
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
      for (const { mesh } of pigMeshes) mesh.dispose()
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
  }
}
