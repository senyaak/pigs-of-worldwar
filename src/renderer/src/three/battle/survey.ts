// THE PAUSE'S OWN CAMERA (lib/game/mapView.ts).

import { EXE_FRAME_SECONDS } from '../../../../lib/game/ballistics'
import {
  DWELL_FRAMES,
  FLOOR_CLEARANCE,
  LOOK_EASE,
  MOVE_EASE_XZ,
  MOVE_EASE_Y,
  NEAR_ENOUGH,
  advanceBearing,
  easeOver,
  orbitPoint
} from '../../../../lib/game/mapView'
import type { SceneCore } from './core'

/**
 * THE PAUSE'S OWN CAMERA — the exe's mode 7, entered at 0x49205F and put
 * back on the way out.
 *
 * A paused mission is not a still picture in the original: the world stops
 * and the camera goes FLYING. The path is a figure-eight — `x = R·cos(θ)`,
 * `z = R·sin(2θ)`, the sine's index doubled at 0x4A4E67 — about the world
 * origin at the height of the map's own highest ground, with the bearing
 * advancing six of 4096 EVERY frame whether or not anything else changes
 * (lib/game/mapView.ts carries every number and where it was read).
 *
 * What it LOOKS at is a pig, and that half is a lagged copy: the look-at
 * point eases toward the subject at a thirteenth a frame, which is what
 * makes a change of subject a sweep rather than a cut.
 *
 * Play caught the first attempt at this: switching subject pig by pig with
 * a still camera is the VICTORY camera (lib/game/endOfGame.ts), not this.
 */
export const survey = (core: SceneCore, delta: number): void => {
  const { host, query, root, state } = core
  const shown = state.now.pigs.filter((pig) => pig.health > 0 && !pig.sheltered && !pig.hidden)
  if (shown.length === 0) return
  const frames = delta / EXE_FRAME_SECONDS
  const first = !state.flying
  if (first) {
    state.flying = true
    state.bearing = 0
    state.dwell = 0
    state.watching = shown[0].id
  }
  state.bearing = advanceBearing(state.bearing, frames)
  state.dwell += frames
  const point = orbitPoint(state.bearing)
  const away = (pig: { x: number; z: number }): number =>
    Math.hypot(pig.x - point.x, pig.z - point.z)

  // The subject changes when the look has run out OR when the flight comes
  // too near the pig it is on — the routine's one early-out. The next one is
  // the next pig far enough away, and a full lap keeps whoever it is on.
  const standing = shown.find((pig) => pig.id === state.watching) ?? shown[0]
  if (state.dwell >= DWELL_FRAMES || away(standing) < NEAR_ENOUGH) {
    const at = shown.findIndex((pig) => pig.id === standing.id)
    for (let step = 1; step <= shown.length; step++) {
      const candidate = shown[(at + step) % shown.length]
      if (away(candidate) >= NEAR_ENOUGH || step === shown.length) {
        state.watching = candidate.id
        break
      }
    }
    state.dwell = 0
  }

  // WHERE IT FLIES. The nominal height is the map's own peak, and the mover
  // holds it clear of the ground under it by 0x300 — which on a map with any
  // relief never fires.
  const subject = shown.find((pig) => pig.id === state.watching) ?? standing
  const wantY = Math.min(query.peak, query.height(point.x, point.z) - FLOOR_CLEARANCE)
  if (first) {
    state.flightAt.set(point.x, wantY, point.z)
    state.lookingAt.set(subject.x, subject.y, subject.z)
  } else {
    state.flightAt.x += (point.x - state.flightAt.x) * easeOver(MOVE_EASE_XZ, frames)
    state.flightAt.z += (point.z - state.flightAt.z) * easeOver(MOVE_EASE_XZ, frames)
    state.flightAt.y += (wantY - state.flightAt.y) * easeOver(MOVE_EASE_Y, frames)
    const look = easeOver(LOOK_EASE, frames)
    state.lookingAt.x += (subject.x - state.lookingAt.x) * look
    state.lookingAt.y += (subject.y - state.lookingAt.y) * look
    state.lookingAt.z += (subject.z - state.lookingAt.z) * look
  }
  host.camera.position.copy(root.localToWorld(state.worldPoint.copy(state.flightAt)))
  host.camera.lookAt(root.localToWorld(state.worldPoint.copy(state.lookingAt)))
  state.lastView = 'map'
}
