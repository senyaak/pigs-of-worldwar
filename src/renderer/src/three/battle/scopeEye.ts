// THE SCOPE'S EYE: where the rifle camera looks from, once an engine frame,
// its height lagging behind the hand the way the exe's does.

import { FRAME_SECONDS } from '../../../../lib/game/ballistics'
import { SCOPE_BONE, SCOPE_MOUNT } from '../chase'
import type { Soldier } from '../squad'
import type { SceneCore } from './core'

/** `[0x4bd6c8]` — how far toward the hand the camera's HEIGHT moves in one
 * engine frame (0x4a3072). A third, and no more. */
const EYE_LAG = 0.333

/**
 * Where the scope looks FROM: `SCOPE_MOUNT` in the hand bone's space, in
 * game space. The exe's rifle cam is bolted there (0x4a2ec0) and that is
 * where its wobble comes from — the hand rides a breathing chest.
 */
export const scopeEye = (core: SceneCore, soldier: Soldier): { x: number; y: number; z: number } => {
  const { engine, state } = core
  // ONCE AN ENGINE FRAME, and held in between. The exe places this camera
  // once per game frame at fifteen a second; sampling an interpolated
  // skeleton at sixty turns the same breath into a glide, which is exactly
  // what play saw — "щас плавает, а в оригинале прям дрожит". The pose
  // itself still interpolates, so the pig moves smoothly and the view it is
  // holding does not.
  const frame = Math.floor(state.time / FRAME_SECONDS)
  if (frame === state.eyeFrame) return state.heldEye
  // A gap means the sights were down in between; start the lag afresh.
  if (frame > state.eyeFrame + 1) state.settled = false
  state.eyeFrame = frame
  const eyeAt = engine.pose.boneToWorld(soldier.pig, SCOPE_BONE, SCOPE_MOUNT) ?? state.heldEye
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
  state.heldEye = {
    x: eyeAt.x,
    y: state.settled ? state.heldEye.y + (eyeAt.y - state.heldEye.y) * EYE_LAG : eyeAt.y,
    z: eyeAt.z
  }
  state.settled = true
  return state.heldEye
}
