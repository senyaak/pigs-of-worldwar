// Pointing the weapon, and looking down it.
//
// One state with five pieces that only ever move together: whether the aim
// view is held, the angle itself, the tremor that rides it, the sniper's zoom,
// and the sideways ramp the scope borrows off the aim. Split up they were five
// variables in the battle's frame with the ordering between them written out
// by hand; together they are one thing the frame asks once.
//
// `aim.ts` is the angle's own rules, `wobble.ts` the tremor and `zoom.ts` the
// magnification. This is where they meet.

import {
  AIM_RAMP,
  AIM_TOP,
  SIGHT_RAMP,
  SIGHT_TOP,
  clampAim,
  createAim,
  rampedStep,
  updateAim
} from './aim'
import type { AimState } from './aim'
import { createWobble, resetWobble, wobbleStep } from './wobble'
import type { Random } from './random'
import { createZoom, updateZoom, zoomFraction, zoomedStep, zoomsIn } from './zoom'
import { FRAME_SECONDS } from './ballistics'
import { isGun } from './projectile'
import { weaponOf } from './weapons'

export interface SightsFrame {
  /** What the acting pig has in hand. */
  holding: number | null
  /** Whether the pig has committed to a blow — nothing moves the aim then. */
  committed: boolean
  /** Whether a shot is in progress: the tremor FREEZES for the fuse rather
   * than being reset. */
  firing: boolean
  /** The turn keys, which drive the scope sideways rather than the pig. */
  turning: number
  delta: number
}

export interface Sights {
  /** Whether the aim view is HELD — the caller has already decided the weapon
   * allows one. */
  setHeld(held: boolean): void
  /** Drop the sights and refuse them until the key is let go. Firing does
   * this: the exe's aim camera is gated on `Pig::MayAct`, which has just gone
   * false (0x492df1). */
  refuse(): void
  /** Which way the aim keys are pushing: -1 down, 0 nothing, +1 up. */
  push(direction: number): void
  /** A new weapon is in hand: it comes up pointing where its own record says —
   * a rifle level, a grenade already lobbing at 45°. */
  rearm(holding: number | null): void
  /**
   * How far the pig TURNS this frame on the sights' account: the scope's own
   * sideways step, plus the tremor's yaw.
   *
   * Two calls rather than one, and the order is the original's. This runs
   * BEFORE the walk, and `advance` runs at the end of the frame — so the yaw
   * a step uses is the one the LAST frame's tremor left, and a shot fired
   * mid-frame leaves along the angle the player last saw rather than one this
   * frame has already moved. Folding them together shifted both by a frame.
   */
  turnStep(frame: SightsFrame): number
  /** The end of the frame: the aim itself, the tremor and the zoom. */
  advance(frame: SightsFrame): void
  /** Where the weapon points, engine units — the tremor is already IN it. One
   * number, read by the camera, the barrel and the dial alike. */
  angle(): number
  /** Whether the view is actually down the barrel. */
  scoped(holding: number | null): boolean
  /** How far the sniper has zoomed, 0..1. */
  zoom(): number
}

export function createSights(random: Random = Math.random): Sights {
  /** Whether the aim view is held down. */
  let held = false
  /**
   * Whether it has been REFUSED until the key is let go.
   *
   * Firing drops the sights, and they must not come back while G is still
   * down — holding it through the shot would snap the scope back over the
   * flight.
   */
  let refused = false
  /** Which way the aim keys are pushing. */
  let push = 0
  /** The tremor's share of the pig's TURN, as the last frame left it — the aim
   * view's handler feeds one stick axis to `Pig::Aim` and the other to the
   * turn (lib/game/wobble.ts). */
  let shivered = 0
  /** Where it points (lib/game/aim.ts). */
  let aim: AimState = createAim(null)
  /** The sideways ramp the scope borrows off the aim, so left and right move
   * at the rate up and down do. */
  const scopeTurn = { rate: 0 }
  const wobble = createWobble()
  const zoom = createZoom()

  return {
    setHeld(want) {
      // Letting go always clears the refusal; holding it down never lifts it.
      if (!want) refused = false
      held = want && !refused
    },
    refuse() {
      held = false
      refused = true
    },
    push(direction) {
      push = direction
    },
    rearm(holding) {
      aim = createAim(holding)
    },
    turnStep({ holding, firing, turning, delta }) {
      const sighted = held && isGun(holding)
      // Down the sights the two axes move together, which means running the
      // turn through the aim's own ramp: the pad gives the turn a flat 0x40 the
      // moment the key goes down and the aim a ramp to 0x20, so sideways would
      // otherwise be twice as fast and instant.
      const scoping = sighted && !firing
      const swung = scoping
        ? zoomsIn(holding)
          ? zoomedStep(zoom, rampedStep(scopeTurn, turning, delta), SIGHT_RAMP)
          : rampedStep(scopeTurn, turning, delta)
        : 0
      if (!scoping) scopeTurn.rate = 0
      // …and the tremor's other axis, as the LAST frame left it.
      return swung + shivered
    },
    advance({ holding, committed, firing, delta }) {
      const sighted = held && isGun(holding)
      // NOTHING moves the sights once the trigger is down. `Pig::Aim`
      // (0x46a7f0) calls `Pig::MayAct` before it does anything and bails when
      // it is false, and it is false from the press until the attack — play:
      // "будто секунду в сторону движения прицела продолжал двигаться".
      const weapon = weaponOf(holding)
      updateAim(
        aim,
        holding,
        committed ? 0 : weapon.aims ? push : 0,
        delta,
        (step) => (zoomsIn(holding) ? zoomedStep(zoom, step, SIGHT_RAMP) : step),
        // Down the sights the aim view's own arm drives it, and it is slower.
        sighted ? SIGHT_RAMP : AIM_RAMP,
        sighted ? SIGHT_TOP : AIM_TOP
      )

      // The tremor steps once an ENGINE frame at fifteen a second, which is
      // what makes it a jitter rather than a glide. **It FREEZES for the fuse
      // rather than being reset**: `Pig::Aim` is refused from the press until
      // the attack and the tremor arrives through it, so the sights stop dead
      // and the bullet leaves along exactly what the player last saw. Zeroing
      // it is what made the shot look a second stale.
      const frames = delta / FRAME_SECONDS
      if (sighted) {
        const shiver = wobbleStep(wobble, frames, random)
        aim.angle = clampAim(holding, aim.angle + shiver.pitch)
        shivered = shiver.yaw
      } else {
        shivered = 0
        if (!firing) resetWobble(wobble)
      }
      updateZoom(zoom, frames, sighted && zoomsIn(holding))
    },
    angle: () => aim.angle,
    scoped: (holding) => held && isGun(holding),
    zoom: () => zoomFraction(zoom)
  }
}
