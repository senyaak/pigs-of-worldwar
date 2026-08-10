// What each pig is playing, and whether it has finished.
//
// The domain has always DECIDED the clip — `locomotion.ts` says which one and
// whether it is committed — but it could not tell whether a committed one had
// run out, so it asked the renderer (`Soldier.animating()`). That is the last
// thing in the battle that made the frame's order of events depend on a mixer.
//
// A committed clip is the original's own idea: `Pig::SetAnim`'s third argument
// is a repeat COUNT and the exe only decrements it where the clip's cursor
// wraps (0x46e27f..0x46e2cb), so a count of 1 means "play it through once".
// Two clips are asked for that way — the jump's crouch (the launch waits for
// it, 0x46e8e2) and a landing's get-up (0x470944, and the parachute's
// 0x4717f5).
//
// Asking for a DIFFERENT clip cancels a committed one, which is the exe's own
// behaviour: a movement clip request resets the cursor outright (0x472320).
//
// Nothing here plays anything. A renderer reads the state once a frame and
// makes its mixer agree — `revision` is what tells it a clip was RESTARTED
// rather than merely still running.

import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import type { Pig } from './game'

export interface WornClip {
  /** The clip index, or null for the bind pose. */
  index: number | null
  /** Whether it was committed: played through once and its last frame held. */
  once: boolean
  /** Bumped every time a clip STARTS. A renderer that has already applied this
   * revision leaves its mixer alone, so a looping clip is not restarted every
   * frame and a one-shot is restarted exactly when it is asked for again. */
  revision: number
  /** Seconds left of a committed clip; 0 when nothing is committed. */
  left: number
  /**
   * Seconds since it STARTED, and the reason this state is enough to pose a
   * pig with: the cursor was the mixer's, so the pose only existed once
   * something drew it (lib/game/clipPose.ts).
   */
  elapsed: number
}

/** The upper-body clip laid over the worn one — the weapon channel
 * (three/clips.ts, lib/game/aim.ts). */
export interface WornOverlay {
  /** Clip index, or -1 for none. */
  index: number
  /** 0..1 through it — a cursor, not a playback. */
  phase: number
}

const NOTHING: WornClip = { index: null, once: false, revision: 0, left: 0, elapsed: 0 }
const NO_OVERLAY: WornOverlay = { index: -1, phase: 0 }

export interface Anim {
  /** Wear a looping clip, or the bind pose. Asking for the one already on is
   * free; asking for a different one CANCELS a committed clip. */
  setClip(pig: Pig, index: number | null): void
  /** Commit to a clip played through once, holding its last frame. */
  playOnce(pig: Pig, index: number): void
  /** Lay a clip's upper body over whatever is worn, held at `phase`; -1
   * clears it. */
  overlay(pig: Pig, index: number, phase: number): void
  /** Whether a committed clip is still running. */
  animating(pig: Pig): boolean
  /** Burn down the committed clips; once a frame. */
  update(delta: number): void
  /** What this pig is wearing — what a renderer applies. */
  wornBy(pig: Pig): WornClip
  /** …and over the top of it. */
  overlayOf(pig: Pig): WornOverlay
  /** Drop everything: a new battle. */
  clear(): void
}

export function createAnim(clips: ClipTiming[]): Anim {
  const worn = new Map<Pig, WornClip>()
  const over = new Map<Pig, WornOverlay>()
  let revision = 0

  const start = (pig: Pig, index: number | null, once: boolean): void => {
    revision++
    worn.set(pig, {
      index,
      once,
      revision,
      left: once && index !== null ? clipSeconds(clips[index]) : 0,
      elapsed: 0
    })
  }

  return {
    setClip(pig, index) {
      const now = worn.get(pig)
      // The same LOOPING clip is already on: nothing to do, and restarting it
      // would stutter. A committed one is cancelled even by its own index,
      // because asking is what resets the cursor.
      if (now && now.index === index && !now.once) return
      start(pig, index, false)
    },
    playOnce(pig, index) {
      start(pig, index, true)
    },
    overlay(pig, index, phase) {
      if (index < 0) over.delete(pig)
      else over.set(pig, { index, phase })
    },
    animating: (pig) => (worn.get(pig)?.left ?? 0) > 0,
    update(delta) {
      for (const one of worn.values()) {
        one.elapsed += delta
        if (one.left > 0) one.left = Math.max(0, one.left - delta)
      }
    },
    wornBy: (pig) => worn.get(pig) ?? NOTHING,
    overlayOf: (pig) => over.get(pig) ?? NO_OVERLAY,
    clear() {
      worn.clear()
      over.clear()
    }
  }
}
