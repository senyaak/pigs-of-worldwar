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
  /** Movement intent from the input layer: a direction in the XZ plane
   * (game space), zero when no key is held. */
  setIntent(x: number, z: number): void
  dispose(): void
}

const PIG_HEADING_OFFSET = Math.PI // model faces -z in its own space
const WALK_SPEED = 900 // world units per second (tile = 512)

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
    walking: boolean
  }
  const pigMeshes: PigEntry[] = []
  const walkClip = assets.clips[0] ?? null
  for (const player of game.players) {
    for (const pig of player.pigs) {
      const mesh = buildPig(assets.model, assets.modelTextures, assets.skeleton)
      const node = mesh.group.children[0]
      node.position.set(pig.position.x, query.height(pig.position.x, pig.position.z), pig.position.z)
      node.rotation.y = pig.heading + PIG_HEADING_OFFSET
      root.add(node)
      // T-pose at rest; the walk clip plays only while moving.
      pigMeshes.push({ pig, mesh, node, player: createPlayer(mesh), walking: false })
    }
  }

  const setWalking = (entry: PigEntry, walking: boolean): void => {
    if (entry.walking === walking) return
    entry.walking = walking
    entry.player.play(walking ? walkClip : null)
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
  const intent = { x: 0, z: 0 }

  const focus = (pig: Pig): void => {
    const ground = query.height(pig.position.x, pig.position.z)
    markerBase = new THREE.Vector3(pig.position.x, ground - 700, pig.position.z)
    marker.position.copy(markerBase)
    // Camera in Y-up world: the root flips Y and Z.
    const target = new THREE.Vector3(pig.position.x, -ground, -pig.position.z)
    host.camera.near = 10
    host.camera.far = 100_000
    host.camera.updateProjectionMatrix()
    host.camera.position.set(target.x, target.y + 1500, target.z + 2600)
    host.camera.lookAt(target)
  }

  const walk = (delta: number): void => {
    const active = pigMeshes.find((entry) => entry.pig === game.currentPig)
    if (!active) return
    // A pig that stopped being active mid-stride stops walking.
    for (const entry of pigMeshes) if (entry !== active) setWalking(entry, false)
    const length = Math.hypot(intent.x, intent.z)
    if (length === 0 || game.remainingMove <= 0) {
      setWalking(active, false)
      return
    }
    const step = Math.min(WALK_SPEED * delta, game.remainingMove)
    const x = active.pig.position.x + (intent.x / length) * step
    const z = active.pig.position.z + (intent.z / length) * step
    const heading = Math.atan2(intent.x, intent.z)
    if (!query.walkable(x, z) || !game.moveCurrentPig(x, z, step, heading)) {
      setWalking(active, false)
      return
    }
    setWalking(active, true)
    active.node.position.set(x, query.height(x, z), z)
    active.node.rotation.y = heading + PIG_HEADING_OFFSET
    focus(active.pig)
    onGameChanged()
  }

  const onFrame = (delta: number): void => {
    time += delta
    walk(delta)
    for (const { player } of pigMeshes) player.update(delta)
    marker.position.y = markerBase.y - Math.sin(time * 3) * 40
  }
  host.onFrame.add(onFrame)

  return {
    focus,
    setIntent(x, z) {
      intent.x = x
      intent.z = z
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
