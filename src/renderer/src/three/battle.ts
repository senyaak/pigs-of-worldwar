// The battle scene: a real map with two squads of pigs standing on it.
// Everything game-space (Y-down) under the usual 180°-X group; the camera
// works in three's Y-up world and follows the active pig.

import * as THREE from 'three'
import type { Bone, Clip, Model, TerrainBlock, TerrainTexture, Texture } from '../api'
import type { Game, Pig } from '../../../lib/game/game'
import { TerrainQuery, clampToWorld } from '../../../lib/game/terrain'
import { FALL_SPEED_FACTOR, WALK_SPEED, step } from '../../../lib/game/movement'
import {
  EJECT_PITCH,
  JUMP_COOLDOWN_SECONDS,
  EJECT_SECONDS,
  FREE,
  bounceOff,
  easeBounciness,
  slopePull
} from '../../../lib/game/ballistics'
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
const SWIM_SPEED = WALK_SPEED / 2
const TURN_SPEED = 2.6 // radians per second
/** How deep a swimming pig sits below the surface (game Y-down: +down). */
const SWIM_SINK = 110
/** Jump ballistics, game Y-down: negative velocity is upward. */
const JUMP_VELOCITY = -1500
const GRAVITY = 5000

/** MCAP clip indices, from the exe's own animation-name table
 * (pigs-disasm/animations/notes.md). A fall uses JUMP_MIDDLE, not the clip
 * named "Flying through air/falling": `Pig::StartFalling` (0x4707f0) plays
 * 9, and the impact handler plays BOUNCE (0x27) on the way back up. */
const ANIM = {
  RUN: 0,
  WALK_BACK: 3,
  TURN: 4,
  SWIM: 5,
  JUMP_MIDDLE: 9,
  SCRAMBLE: 11,
  IDLE: 27,
  BOUNCE: 39
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
  /** The pig's own momentum, null when it is standing and steering again.
   * `bouncing` means it is riding out an impact rather than jumping;
   * `grounded` means it has come down and is now sliding on its behind. */
  let airborne: { vy: number; vx: number; vz: number; bouncing: boolean } | null = null
  let jumpRequested = false
  /** How long the pig has been pressed into a wall, and how bouncy that has
   * made it — the original eases both while wedged (lib/game/ballistics). */
  let wedgedSeconds = 0
  /** Seconds before the pig may jump again (exe: 15 frames of recharge). */
  let jumpReadyIn = 0
  let bounciness = FREE
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
      airborne = null
      jumpRequested = false
      jumpReadyIn = 0
      wedgedSeconds = 0
      bounciness = FREE
      focus(game.currentPig)
    }

    const active = pigMeshes.find((entry) => entry.pig === game.currentPig)
    if (!active) return
    for (const entry of pigMeshes) if (entry !== active) setClip(entry, ANIM.IDLE)

    const { x: px, z: pz } = active.pig.position
    const swimming = query.isWater(px, pz)
    let wedged = false
    let shoving = false

    // Turning on the spot works in every grounded state.
    if (intent.turn !== 0 && airborne === null) {
      game.turnCurrentPig(active.pig.heading + intent.turn * TURN_SPEED * delta)
      active.node.rotation.y = active.pig.heading + PIG_HEADING_OFFSET
    }

    if (airborne) {
      setClip(active, airborne.bouncing ? ANIM.BOUNCE : ANIM.JUMP_MIDDLE)
      // Momentum carries; gravity does the rest.
      //
      // A wall in the air is one-way: a pig may leave one it is already in —
      // that is the whole point of throwing it out — but may not enter one.
      // Both halves are needed. Without the first, an ejected pig is
      // forbidden from leaving the wall it was ejected from; without the
      // second, jump becomes a ladder, and a pig can hop up a cliff face a
      // bound at a time and right off the edge of the world.
      const inWall = !query.walkable(px, pz)
      const to = clampToWorld(px + airborne.vx * delta, pz + airborne.vz * delta)
      if (inWall || query.walkable(to.x, to.z)) {
        game.moveCurrentPig(to.x, to.z, active.pig.heading)
      }
      const at = active.pig.position
      const ground =
        query.height(at.x, at.z) + (query.isWater(at.x, at.z) ? SWIM_SINK : 0) - active.mesh.footOffset

      {
        airborne.vy += GRAVITY * delta
        const y = active.node.position.y + airborne.vy * delta
        if (airborne.vy > 0 && y >= ground) {
          // Landing. Wedged pigs come down bouncier than free ones, which is
          // what makes coming off a wall read as a bounce and not a step; when
          // there is no bounce left, the pig slides out what it has.
          // The solver's impulse, against the surface the pig actually hit:
          // the normal part reflects and damps, the part running along the
          // slope carries whole. Landing on a hillside therefore keeps its
          // speed and goes on down it.
          const hit = bounceOff(
            { x: airborne.vx, y: airborne.vy, z: airborne.vz },
            query.normal(at.x, at.z),
            bounciness.restitution,
            bounciness.friction
          )
          active.node.position.set(at.x, ground, at.z)
          // A landing is binary in the original and there is nothing in
          // between: over the threshold it bounces, under it the body is
          // STOPPED — `0x471350` hands the whole velocity to `0x4a9ee0`,
          // which writes zero vectors — the fall state is cleared and the
          // pig stands up. So there is no slide to taper off, and no floor
          // speed to taper it to: the same 25 decides both.
          if (-hit.y > 0) {
            airborne = { ...airborne, vx: hit.x, vy: hit.y, vz: hit.z, bouncing: true }
          } else {
            airborne = null
            settle(active)
          }
        } else {
          active.node.position.set(at.x, y, at.z)
        }
      }
    } else {
      const speed = swimming ? SWIM_SPEED : WALK_SPEED
      const forwardX = Math.sin(active.pig.heading)
      const forwardZ = Math.cos(active.pig.heading)

      if (jumpRequested && !swimming && jumpReadyIn <= 0) {
        // A jump is committed, not steered: the whole movement update is
        // skipped while the pig is in the air (`UpdateMovement` returns at
        // once on state 5), so it leaves the ground FORWARDS whatever the
        // keys say and lands where that put it. And it costs a cooldown —
        // the original will not take another for fifteen frames.
        airborne = {
          vy: JUMP_VELOCITY,
          vx: forwardX * speed,
          vz: forwardZ * speed,
          bouncing: false
        }
        jumpReadyIn = JUMP_COOLDOWN_SECONDS
      } else if (intent.walk !== 0) {
        // Straight ahead, as the original walks. Only the world edge refuses;
        // a big enough drop turns the step into a fall, and a wall is
        // something the pig walks INTO and is thrown out of below.
        const move = step(query, px, pz, active.pig.heading, speed * delta * intent.walk)
        if (move.outcome === 'falling') {
          game.moveCurrentPig(move.x, move.z, active.pig.heading)
          airborne = {
            vy: 0,
            vx: forwardX * intent.walk * speed * FALL_SPEED_FACTOR,
            vz: forwardZ * intent.walk * speed * FALL_SPEED_FACTOR,
            bouncing: false
          }
        } else if (move.outcome === 'moved') {
          game.moveCurrentPig(move.x, move.z, active.pig.heading)
          settle(active)
          setClip(active, swimming ? ANIM.SWIM : intent.walk > 0 ? ANIM.RUN : ANIM.WALK_BACK)
        } else {
          shoving = true
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
    jumpReadyIn = Math.max(0, jumpReadyIn - delta)

    // Wedged is either of two things: shoving at a wall that will not let
    // the step through, or standing inside one — the original asks
    // `Map::IsBlocked` once a frame at its own feet, and a pig that landed
    // in a wall has to get out of it too. Both end the same way.
    const at = active.pig.position
    wedged = airborne === null && (shoving || !query.walkable(at.x, at.z))
    if (!wedged) wedgedSeconds = 0
    else {
      setClip(active, ANIM.SCRAMBLE)
      wedgedSeconds += delta
      if (wedgedSeconds >= EJECT_SECONDS) {
        const away = intent.walk < 0 ? 1 : -1
        const out = Math.cos(EJECT_PITCH) * WALK_SPEED * away
        airborne = {
          vy: -Math.sin(EJECT_PITCH) * WALK_SPEED,
          vx: Math.sin(active.pig.heading) * out,
          vz: Math.cos(active.pig.heading) * out,
          bouncing: true
        }
        wedgedSeconds = 0
      }
    }
    bounciness = easeBounciness(bounciness, wedged, airborne === null, delta)

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
      warp: (x: number, z: number, heading: number) => {
        game.moveCurrentPig(x, z, heading)
        airborne = null
        wedgedSeconds = 0
        bounciness = FREE
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
      for (const { mesh } of pigMeshes) mesh.dispose()
      marker.geometry.dispose()
      ;(marker.material as THREE.Material).dispose()
    }
  }
}
