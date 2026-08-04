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
  dispose(): void
}

const PIG_HEADING_OFFSET = Math.PI // model faces -z in its own space

export function buildBattle(host: SceneHost, assets: BattleAssets, game: Game): BattleScene {
  const query = new TerrainQuery(assets.blocks)
  const root = new THREE.Group()
  root.rotation.x = Math.PI

  const terrain: Terrain = buildTerrain(assets.blocks, assets.terrainTextures)
  // buildTerrain wraps in its own converted group; unwrap into ours.
  const terrainMesh = terrain.group.children[0]
  root.add(terrainMesh)

  const pigMeshes: { pig: Pig; mesh: PigMesh; player: ClipPlayer }[] = []
  const idle = assets.clips[0] ?? null
  for (const player of game.players) {
    for (const pig of player.pigs) {
      const mesh = buildPig(assets.model, assets.modelTextures, assets.skeleton)
      const inner = mesh.group.children[0]
      inner.position.set(pig.position.x, query.height(pig.position.x, pig.position.z), pig.position.z)
      inner.rotation.y = pig.heading + PIG_HEADING_OFFSET
      root.add(inner)
      const clipPlayer = createPlayer(mesh)
      if (idle) clipPlayer.play(idle)
      pigMeshes.push({ pig, mesh, player: clipPlayer })
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
  const onFrame = (delta: number): void => {
    time += delta
    for (const { player } of pigMeshes) player.update(delta)
    marker.position.y = markerBase.y - Math.sin(time * 3) * 40
  }
  host.onFrame.add(onFrame)

  return {
    focus(pig) {
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
