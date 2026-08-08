// A frontend widget's FRAME, and how it gets to a new one.
//
// The original does not animate a widget by playing a clip: a widget holds one
// frame number, something asks for another, and a per-tick pass walks it there
// ONE step at a time, rebuilding the sprite each step. Decoded end to end in
// frontend/notes.md (disasm repo) — `0x512C18` is the frame a widget is on,
// `0x423E10` asks for a new one, `0x41FEC0` does the walking, and `0x41F110`
// rebuilds. The step and the delay between steps are the caller's to give.
//
// That is why the machine reads as a sequence of still pictures rather than as
// something running: nothing moves unless something asked it to.

import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'

export interface FrameWalk {
  /** The frame to draw at `now`, advancing the walk as ticks fall due. */
  at(now: number): number
  /** Send it to `target`, `step` frames every `hold` ticks. Ignored while a
   * walk is already running — the exe guards its own request the same way,
   * with `0x420030(widget)` (exe 0x423f60). */
  goTo(now: number, target: number, step?: number, hold?: number): void
  /** Whether it is still on its way. */
  walking(): boolean
}

/**
 * A widget sitting on `from`, of `frames` frames. The frame it reports is
 * taken modulo that count, which is the builder's own `% 6` on the plates
 * (exe 0x41f22d) — so a walk to 6 out of six lands back on the first.
 */
export function frameWalk(from: number, frames: number): FrameWalk {
  let current = from
  let target = from
  let step = 1
  let hold = 1
  /** When the next step falls due. */
  let due = 0

  const advance = (now: number): void => {
    if (current === target) return
    while (now >= due && current !== target) {
      current += current < target ? step : -step
      if ((current - target) * (step > 0 ? 1 : -1) > 0) current = target
      due += hold * EXE_FRAME_SECONDS * 1000
    }
  }

  return {
    at(now) {
      advance(now)
      return ((current % frames) + frames) % frames
    },
    goTo(now, to, by = 1, every = 1) {
      if (current !== target) return
      if (current === to) return
      target = to
      step = by
      hold = every
      due = now + every * EXE_FRAME_SECONDS * 1000
    },
    walking: () => current !== target
  }
}
