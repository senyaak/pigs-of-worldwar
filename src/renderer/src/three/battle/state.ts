// What the scene remembers from one frame to the next: the camera's own
// clocks, the last reading of the battle and the stances it is drawn between,
// and the scratch vectors the camera's sums run through.

import type { Engine } from '../../../../lib/game/engine'
import type { BattleSnapshot } from '../../../../lib/game/snapshot'
import { stanceNow } from './drawn'
import type { Stance } from './drawn'
import * as THREE from 'three'

export interface SceneState {
  /** Scratch for the camera's position in GAME space: the root is turned half a
   * turn about x, so the world's y and z are the game's negated. */
  eyeInGame: THREE.Vector3
  /** …and the map's own pair, so asking for the eye between frames cannot
   * disturb what the see-through test is holding. */
  mapEye: THREE.Vector3
  mapLook: THREE.Vector3
  /** Seconds the battle has been on screen. */
  time: number
  /** The eye as of the last ENGINE frame, and which frame that was. */
  heldEye: { x: number; y: number; z: number }
  eyeFrame: number
  /** Whether there is a previous height for the lag below to come from. */
  settled: boolean
  /** Which view the ACTING pig was last watched from — the debug surface's, so
   * a spec can tell the rig's views apart (three/debug.ts, `view`). */
  lastView: string
  /**
   * The last reading of the battle, and the ONLY thing below draws from it
   * (lib/game/snapshot.ts).
   *
   * Held rather than asked for again: the dashboard asks for plates and numbers
   * between frames, and two readings of one frame would be two different
   * pictures.
   */
  now: BattleSnapshot
  /** Where the acting pig stood at the last two step boundaries — the two the
   * picture is drawn between (`drawn.ts`). */
  before: Stance
  after: Stance
  /** The last frame's own length, seconds — kept only so a spec can pair a
   * displacement with the time that produced it (three/debug.ts, `frame`). */
  lastFrame: number
  /** The pause camera's flight (`survey.ts`): where it is on its figure-eight,
   * which pig it looks at, how long it has, and whether it is flying at all. */
  bearing: number
  watching: number
  dwell: number
  flying: boolean
  /** The flight and its aim, both in GAME space; the camera is world space. */
  flightAt: THREE.Vector3
  lookingAt: THREE.Vector3
  worldPoint: THREE.Vector3
}

export const createSceneState = (engine: Engine): SceneState => {
  const stance = stanceNow({ engine })
  return {
    eyeInGame: new THREE.Vector3(),
    mapEye: new THREE.Vector3(),
    mapLook: new THREE.Vector3(),
    time: 0,
    heldEye: { x: 0, y: 0, z: 0 },
    eyeFrame: -1,
    settled: false,
    lastView: 'chase',
    now: engine.snapshot(),
    before: stance,
    after: stance,
    lastFrame: 0,
    bearing: 0,
    watching: -1,
    dwell: 0,
    flying: false,
    flightAt: new THREE.Vector3(),
    lookingAt: new THREE.Vector3(),
    worldPoint: new THREE.Vector3()
  }
}
