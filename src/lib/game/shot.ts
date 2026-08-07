// Firing is a SEQUENCE, not a keypress.
//
// Pressing fire with a gun out does not make a bullet. `Pig::Fire` (0x469360)
// only sets three things —
//
// ```
// 469371  [pig+0x300] = charge
// 469374  [pig+0x230] = 1        ; "a shot is pending"
// 46937b  [pig+0x231] = 0x0A     ; ...in ten frames
// 469385  [pig+0x2FF] = 0
// ```
//
// — and its own per-weapon switch, for every gun, asks the camera for mode 4
// and makes the pig shout (0x46946d). Ten frames later `Pig::Attack`
// (0x469610) clears `[pig+0x230]`, sets `[pig+0x2FF] = 1` and the attack clip
// runs; the clip's own key-frame event fires the shot (0x479f60). The shot's
// tail hands the camera the projectile and puts it in mode 1, so the view
// flies along behind the bullet:
//
// ```
// 47ad7e  [pig+0x16C] = the projectile
// 47ad99  0x49ec20(camera, projectile)   ; the camera's subject
// 47ada8  0x49f740(camera, 1, 0)         ; ...and mode 1
// ```
//
// Nothing may be done in the middle of that, and the gate is one function:
// `Pig::MayAct` (0x467a10) returns false while `[pig+0x230]` is 1 — which is
// exactly the window between the press and the shot — and the aim camera is
// held on the same test (0x492df1). So a second press cannot start a second
// shot, which is the whole of "why can I fire like a machine gun".
//
// Pure, and in seconds rather than frames like the rest of lib/game.

import { FRAME_SECONDS } from './ballistics'

/** `[pig+0x231] = 0x0A` — the ten frames between the press and the shot. The
 * melee's fuse is the same field and the same ten. */
export const FIRE_FUSE_FRAMES = 10
export const FIRE_FUSE = FIRE_FUSE_FRAMES * FRAME_SECONDS

/**
 * Where a shot has got to.
 *
 * - `fuse` — pressed, not yet fired. `[pig+0x230] = 1`.
 * - `flight` — the bullet is up and the camera is riding it.
 */
export type FirePhase = 'fuse' | 'flight'

export interface Firing {
  phase: FirePhase
  /** Seconds left of the fuse; meaningless once the phase is `flight`. */
  fuse: number
}

/** The press. */
export const beginFiring = (): Firing => ({ phase: 'fuse', fuse: FIRE_FUSE })

/**
 * One frame of the fuse. True the frame it runs out — the caller's cue to
 * loose the bullet, which is what `Pig::Attack` does at the same moment.
 *
 * The phase moves to `flight` either way: whether the shot actually leaves is
 * the scene's business, and a sequence that produced no bullet still has to
 * end rather than hang.
 */
export function advanceFiring(firing: Firing, delta: number): boolean {
  if (firing.phase !== 'fuse') return false
  firing.fuse -= delta
  if (firing.fuse > 0) return false
  firing.phase = 'flight'
  return true
}
