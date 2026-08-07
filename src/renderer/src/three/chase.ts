// The chase camera: the one thing in the battle that works in three's Y-up
// world rather than the game's Y-down one, so the conversion lives here and
// nowhere else.

import * as THREE from 'three'
import type { Pig } from '../../../lib/game/game'
import { SWIM_SINK } from '../../../lib/game/locomotion'
import { MODEL_SCALE } from '../../../lib/game/scale'
import type { TerrainQuery } from '../../../lib/game/terrain'

/** After a flight the camera stays put this long before gliding back behind
 * the pig — resuming the chase the instant of landing is a jolt. */
const CHASE_DELAY = 0.5
/** How far back and how high the rig sits, in the pig's own units. */
const BACK = 2100 * MODEL_SCALE
const LIFT = 900 * MODEL_SCALE
/** Where the gaze rests on the pig, and how far the camera keeps off the
 * ground behind it. */
const GAZE = 300 * MODEL_SCALE
const CLEARANCE = 500 * MODEL_SCALE
/**
 * The drop-in view: the camera stands IN FRONT of a pig on a canopy and looks
 * it in the face, which is what play remembers of the original's opening.
 *
 * It is the chase rig turned around — the same BACK, so the pig sits in the
 * frame exactly as it always does — and only the lift is its own: level with
 * the pig rather than over its shoulder, which is what makes it a face and
 * not a top of a head.
 */
const FACE_LIFT = 150 * MODEL_SCALE

export interface Chase {
  /**
   * Point at a pig standing at `nodeY` (game space, the model's origin).
   * `delta` null snaps rather than glides — a new acting pig, not a frame.
   * `rise` is anything hanging ABOVE the pig that has to stay in shot.
   * `face` swaps the shoulder view for the drop-in one, in front of the pig.
   */
  follow(pig: Pig, nodeY: number, rise: number, delta: number | null, face: boolean): void
  /**
   * The chase's own wait, once a frame: parked through involuntary flight and
   * a beat beyond it, cleared the instant the player drives.
   *
   * The camera follows what the PLAYER does and stands off what happens TO
   * the pig. Chasing a thrown pig spun the view and drove it into the wall
   * the pig had just come off; a walk-off hop or a jump is the player
   * driving, not flying.
   */
  hold(flung: boolean, driving: boolean, delta: number): void
  /** Start again on a new pig: nothing carries over. */
  reset(): void
}

export function createChase(camera: THREE.PerspectiveCamera, query: TerrainQuery): Chase {
  /** Smoothed camera position (world space). */
  const at = new THREE.Vector3()
  let snapped = false
  let wait = 0

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
  const framedY = (pig: Pig, nodeY: number): number =>
    nodeY - (query.isWater(pig.position.x, pig.position.z) ? SWIM_SINK : 0)

  /**
   * Where the rig wants to be: behind the pig's shoulders, clamped above the
   * terrain so hills never swallow the view.
   *
   * Both heights are held against the VISIBLE surface rather than the
   * ground, so a shore whose seabed runs on under the water sheet neither
   * drags the gaze below the waterline nor sinks the camera under it — from
   * beneath, an opaque sheet is the whole view.
   *
   * Every distance rides `MODEL_SCALE`, because this is a rig around the PIG
   * and not around the map: 2100 back and 900 up framed a 651-unit pig, so a
   * 325-unit one wants half of each, and the framing of the pig itself does
   * not change at all. What changes is everything around it — the trench
   * that used to come to its shoulders now stands over it, which is the
   * whole point of the model scale. The numbers themselves are still the
   * remake's own; the original's camera table (exe 0x4d952c: a yaw offset in
   * 4096ths, a distance, a zoom in 1024ths through `afSetZoom`) is found but
   * its zoom is not yet turned into a field of view.
   */
  const want = (
    pig: Pig,
    nodeY: number,
    rise: number,
    face: boolean
  ): { position: THREE.Vector3; target: THREE.Vector3 } => {
    const waterline = -query.surface(pig.position.x, pig.position.z)
    // Looking a pig in the face means looking at the PIG: the canopy over it
    // is out of frame on purpose, so `rise` is ignored on this side.
    const target = new THREE.Vector3(
      pig.position.x,
      Math.max(-framedY(pig, nodeY), waterline) + GAZE + (face ? 0 : rise / 2),
      -pig.position.z
    )
    // The pull-back that fits `rise` more height at this vertical field of
    // view — half the extra height over the tangent of half the angle. The
    // rig is built round a pig, so anything three times its height (a
    // canopy) needs the frame saying so rather than being cropped off.
    const back = face ? BACK : BACK + rise / (2 * Math.tan((camera.fov * Math.PI) / 360))
    // Behind the shoulders normally; ahead of the snout on the way down.
    const reach = face ? -back : back
    const behindX = pig.position.x - Math.sin(pig.heading) * reach
    const behindZ = pig.position.z - Math.cos(pig.heading) * reach
    const terrainAtCamera = -query.surface(behindX, behindZ)
    const position = new THREE.Vector3(
      behindX,
      Math.max(target.y + (face ? FACE_LIFT : LIFT), terrainAtCamera + CLEARANCE),
      -behindZ
    )
    return { position, target }
  }

  return {
    follow(pig, nodeY, rise, delta, face) {
      const { position, target } = want(pig, nodeY, rise, face)
      if (delta === null || !snapped) {
        at.copy(position)
        snapped = true
      } else if (wait <= 0) {
        at.lerp(position, 1 - Math.exp(-6 * delta))
      }
      camera.position.copy(at)
      camera.lookAt(target)
    },
    hold(flung, driving, delta) {
      if (flung) wait = CHASE_DELAY
      else if (driving) wait = 0
      else wait = Math.max(0, wait - delta)
    },
    reset() {
      wait = 0
    }
  }
}
