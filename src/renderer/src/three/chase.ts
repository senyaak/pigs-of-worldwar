// The chase camera: the one thing in the battle that works in three's Y-up
// world rather than the game's Y-down one, so the conversion lives here and
// nowhere else.

import * as THREE from 'three'
import type { Pig } from '../../../lib/game/game'
import { SWIM_SINK } from '../../../lib/game/locomotion'
import { MODEL_SCALE } from '../../../lib/game/scale'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { clearHeading } from '../../../lib/game/sightline'
import type { Blocked } from '../../../lib/game/sightline'

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

/**
 * The MELEE view: the shoulder rig swung round and pulled in, which is what
 * the original does and the only thing it uses its camera mode 19 for.
 *
 * Both numbers are the exe's. `Pig::Fire` calls `0x49f740(0x13, 0)` on the
 * five hand-to-hand skills and nothing else ever asks for that mode
 * (`../pigs-disasm/weapons/melee.md`); the mode's own handler is 0x4a4940,
 * and with the flag 0 it takes the branch at 0x4a4bb5, which puts the camera
 * at `pigYaw − 0x264` — 612 of 4096, **53.8° round from straight behind**,
 * the ordinary chase being at the pig's own yaw with no offset at all
 * (mode 0, 0x4a0ee0). The distance comes out of the per-mode table at
 * 0x4d9528, six bytes a row: **1700** against the chase's 3072, so it also
 * comes in to a little over half.
 *
 * A ratio rather than the number itself, because the rig's own distances are
 * the remake's (see `want`) — what is faithful is the SWING and the
 * PROPORTION. The mode's second column, 924 against the chase's 768, is not
 * applied: its handler never reads that column.
 *
 * **The SIDE is play's, and it is the opposite of the exe's sign.** Read
 * literally the subtraction sends the camera round to the pig's left; the
 * original swings RIGHT ("камера в другую сторону уезжает — не вправо, а
 * влево"), so the turn is added here. The magnitude is still 612 and still
 * the exe's. Which of the several places between that yaw and these pixels
 * flips it is not found — a yaw sign is exactly the sort of thing the
 * un-mirroring of the map (`parsePmg`, and the marker's own half turn in
 * `spawns.ts`) moves — so this is measured, not derived, like the tile
 * table's turn direction and the weapon's half turn before it.
 */
const MELEE_TURN = (612 / 4096) * 2 * Math.PI
const MELEE_CLOSE = 1700 / 3072

/**
 * The AIM view: the shoulder rig pulled in, and nothing else.
 *
 * The original holds camera mode **0x0E**, its debug name "rifle cam"
 * (0x4d8ea8), for as long as one of two pad bits is down, and it picks that
 * mode for weapons 6..15, 17, 18 and 64 — every gun (0x492dfa). Its row of
 * the table at 0x4d9528 is **2048** against the chase's 3072, so it comes in
 * to two thirds and stays behind the shoulder: no swing, unlike the melee's.
 * `../../../pigs-disasm/weapons/fire.md`.
 *
 * The row's second column is 1024 here against the chase's 768, which is what
 * a zoom in 1024ths would look like — but nothing in the mode's own handler
 * (0x4a2e30) has been traced reading it, so it is NOT applied. A field of
 * view is the obvious place for it if it ever is.
 */
const RIFLE_CLOSE = 2048 / 3072

/**
 * The SCOPE: the view down the weapon, and it is BOLTED TO THE HAND.
 *
 * The mode's own handler was read properly the second time round and it
 * settles the argument the table could not. 0x4a2e30 does not build a
 * position from the mode table's 2048 at all — it takes a fixed point in
 * BONE 5's space and turns it into a world point with the very call the
 * muzzle and the bayonet use:
 *
 * ```
 * 4a2e72  eax = [0x4d0fa4]                 ; = 14, a constant
 * 4a2e86  dx  = [eax*8 + 0x4d0ee0]         ; 44
 * 4a2e8d  ax  = [eax*8 + 0x4d0ee2]         ; 230   (y is pushed as 0... see below)
 * 4a2ec0  0x440fb0(5, x, y, z, &out)       ; the HAND
 * ```
 *
 * and row 14 of that table is **(44, 32, 230)** — the PISTOL's muzzle offset,
 * used as the camera mount for every gun. `[cam+0x60]` is 0 for this mode
 * (`0x49f740(0x0E, 0)`), which takes the short branch at 0x4a303a: no
 * smoothing, the camera is where the hand is, this frame.
 *
 * So the aim view IS first person, play was right, and the mode table's
 * distance column is simply not what this handler reads.
 *
 * **And this is where the wobble comes from.** The camera rides the hand, the
 * hand rides the chest, and the chest breathes: with the aim pose held on the
 * arm and clip 27 (IDLE, 36 frames) under it, this mount point travels about
 * 32 model units across, 26 up and 13 forward over one breath. Nothing in the
 * binary drifts the aim ANGLE — the remake looked and wrote up the negative
 * result — because it does not need to. `lib/game/wobble.ts` is what the
 * remake adds ON TOP, and says so.
 */
export const SCOPE_MOUNT = { x: 44, y: 32, z: 230 }
/**
 * How much closer a full sniper zoom brings things.
 *
 * The exe hands `afSetZoom` a number from 0 to 0x1000 (lib/game/zoom.ts) and
 * `afSetZoom` lives in a library that is NOT in the install, so what 0x1000
 * does to a field of view cannot be read. Four times is the remake's pick:
 * play calls it a sniper scope and the weapon's only other distinction is
 * three times the rifle's range.
 */
export const SCOPE_MAGNIFY = 4
/** The bone it hangs off. The same one a barrel and a blade do. */
export const SCOPE_BONE = 5

/** Which way the rig is pointing at the pig from. */
export type View =
  /** Over the shoulder — the ordinary battle camera. */
  | 'chase'
  /** In front, face on: what a pig under a canopy is watched from. */
  | 'face'
  /** Round to the side and close in: a hand-to-hand swing. */
  | 'melee'
  /** Straight behind and closer: sighting a gun. */
  | 'rifle'
  /** Down the barrel: first person, looking where the weapon points. */
  | 'scope'

export interface Chase {
  /**
   * Point at a pig standing at `nodeY` (game space, the model's origin).
   * `delta` null snaps rather than glides — a new acting pig, not a frame.
   * `rise` is anything hanging ABOVE the pig that has to stay in shot.
   */
  follow(
    pig: Pig,
    nodeY: number,
    rise: number,
    delta: number | null,
    view: View,
    /** Where the weapon points, radians, positive UP. Only the scope reads
     * it (lib/game/aim.ts). */
    aim?: number,
    /** How far the sights have drifted off the pig's own facing, radians.
     * Only the scope reads it, and only the sights move — the model stands
     * where it stands (lib/game/wobble.ts). */
    yaw?: number,
    /** Where the scope's eye is: the world point the pig's HAND bone puts
     * `SCOPE_MOUNT` at, handed in because only the scene can pose a
     * skeleton. Game space, Y-down. Ignored by every other view. */
    eye?: { x: number; y: number; z: number } | null
  ): void
  /**
   * Ride a bullet.
   *
   * The moment a shot leaves, the exe hands the camera the PROJECTILE as its
   * subject (`0x49ec20`, from the shot's own tail at 0x47ad99) and puts it in
   * **mode 1** (`0x49f740(1, 0)`). Mode 1's row of the table at 0x4d9528 is
   * `3072, 1024` — the same distance as the ordinary chase, so this is the
   * chase rig with a bullet in the middle of it instead of a pig, and it gets
   * the same numbers here for the same reason.
   *
   * `heading` is where the bullet is going, so the camera sits behind it and
   * watches it fly away rather than side-on.
   */
  ride(at: { x: number; y: number; z: number }, heading: number, delta: number | null): void
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

export function createChase(
  camera: THREE.PerspectiveCamera,
  query: TerrainQuery,
  /**
   * What the view cannot pass, in game space. Optional, and only `ride` uses
   * it — the ordinary chase does not dodge, because a pig you are driving is
   * where you already know it is. Null keeps the old behaviour exactly.
   */
  blocked: Blocked | null = null
): Chase {
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
    view: View,
    aim: number,
    yaw: number,
    eye: { x: number; y: number; z: number } | null
  ): { position: THREE.Vector3; target: THREE.Vector3 } => {
    if (view === 'scope' && eye) {
      // Game space is Y-DOWN and the rig is Y-up, hence the negations. WHERE
      // the camera is comes off the hand bone; where it LOOKS does not — the
      // exe builds the direction from the pig's own yaw and the aim angle
      // (0x4a310c onwards), so a breathing hand shifts the view without
      // steering it.
      const facing = pig.heading + yaw
      const position = new THREE.Vector3(eye.x, -eye.y, -eye.z)
      const ahead = Math.cos(aim)
      const reach = 4096
      const target = new THREE.Vector3(
        position.x + Math.sin(facing) * reach * ahead,
        position.y + Math.sin(aim) * reach,
        position.z - Math.cos(facing) * reach * ahead
      )
      return { position, target }
    }
    const face = view === 'face'
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
    // Behind the shoulders normally; ahead of the snout on the way down; and
    // round to one side, close in, for a swing.
    const reach = face
      ? -back
      : view === 'melee'
        ? back * MELEE_CLOSE
        : view === 'rifle'
          ? back * RIFLE_CLOSE
          : back
    const from = view === 'melee' ? pig.heading + MELEE_TURN : pig.heading
    const behindX = pig.position.x - Math.sin(from) * reach
    const behindZ = pig.position.z - Math.cos(from) * reach
    const terrainAtCamera = -query.surface(behindX, behindZ)
    const position = new THREE.Vector3(
      behindX,
      Math.max(target.y + (face ? FACE_LIFT : LIFT), terrainAtCamera + CLEARANCE),
      -behindZ
    )
    return { position, target }
  }

  return {
    follow(pig, nodeY, rise, delta, view, aim = 0, yaw = 0, eye = null) {
      const { position, target } = want(pig, nodeY, rise, view, aim, yaw, eye)
      // The scope SNAPS. Easing a first-person view is motion sickness: the
      // whole point of it is that the barrel and the frame are the same thing.
      if (delta === null || !snapped || view === 'scope') {
        at.copy(position)
        snapped = true
      } else if (wait <= 0) {
        at.lerp(position, 1 - Math.exp(-6 * delta))
      }
      camera.position.copy(at)
      camera.lookAt(target)
    },
    ride(point, heading, delta) {
      // Swing round whatever is in the way. THE REMAKE'S OWN — the original
      // has no line-of-sight test anywhere in its camera code, which was
      // checked (lib/game/sightline.ts says where) — and play asked for it
      // because watching a grenade through a wall is no use.
      const seen = blocked
        ? clearHeading(point, heading, BACK, LIFT, blocked)
        : heading
      const target = new THREE.Vector3(point.x, -point.y, -point.z)
      const position = new THREE.Vector3(
        point.x - Math.sin(seen) * BACK,
        -point.y + LIFT,
        -(point.z - Math.cos(seen) * BACK)
      )
      // The ground still has a say: a bullet skimming a slope must not put the
      // camera inside it.
      const floor = -query.surface(position.x, -position.z) + CLEARANCE
      position.y = Math.max(position.y, floor)
      if (delta === null || !snapped) {
        at.copy(position)
        snapped = true
      } else {
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
