// The MINE MARKERS — the one thing on the ground that is drawn for somebody and
// not for everybody.
//
// A minefield is a bit in a tile and the original draws nothing for it
// (`lib/game/mines.ts`), so this is the remake's own, on play's rule: "мины скрыты
// — текстуры видны только тем кто рядом и то только тем у кого есть класс
// специальный." WHICH mines are visible is the engine's answer — `mines.revealed`
// takes the eyes and the range — and all this file does is put the game's own
// `WE_MINE` model where it says.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { WEAPON_MODEL } from '../../../lib/game/weapons'
import { createLobArt } from './lobArt'

/** `WE_MINE`, entry 20 of `Chars/WEAPONS.MAD` — the model the mine WEAPON puts in
 * a pig's hand (lib/game/weapons.ts), which is the same object lying in the
 * ground. */
const MINE_MODEL = WEAPON_MODEL[20]

export interface MineArt {
  /** Show exactly these and nothing else. Once a frame. */
  draw(at: readonly { x: number; y: number; z: number }[]): void
  /** How many are on the scene — what a spec counts, since a marker is art and
   * a screenshot cannot tell one from a stone. */
  shown(): number
  clear(): void
  dispose(): void
}

export function createMineArt(root: THREE.Object3D): MineArt {
  const art = createLobArt()
  const meshes: THREE.Mesh[] = []

  const release = (from: number): void => {
    for (let i = from; i < meshes.length; i++) art.release(meshes[i])
    meshes.length = Math.max(from, 0)
  }

  return {
    draw(at) {
      // Grown and shrunk to fit, the way the grenades' pool is: a marker has no
      // identity worth tracking and there are never many in range.
      if (meshes.length > at.length) release(at.length)
      for (let i = 0; i < at.length; i++) {
        if (!meshes[i]) {
          const mesh = art.take(MINE_MODEL)
          if (!mesh) return
          mesh.scale.setScalar(MODEL_SCALE)
          root.add(mesh)
          meshes[i] = mesh
        }
        // ON the ground rather than in it: the model hangs around its own origin,
        // and game space is Y-DOWN, so lifting is subtracting.
        meshes[i].position.set(at[i].x, at[i].y - MINE_LIFT * MODEL_SCALE, at[i].z)
      }
    },
    shown: () => meshes.length,
    clear() {
      release(0)
    },
    dispose() {
      release(0)
      art.dispose()
    }
  }
}

/** How far the marker's own centre sits above the ground, model units — half a
 * mine, near enough, and the same lift a resting grenade takes
 * (three/grenades.ts). */
const MINE_LIFT = 35
