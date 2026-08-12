// A frontend widget's FRAME, and the two ways it gets a new one.
//
// The original does not animate a widget by playing a clip: a widget holds one
// frame number, something asks for another, and a per-tick pass walks it there
// ONE step at a time, rebuilding the sprite each step. Decoded end to end in
// frontend/notes.md (disasm repo) — `0x512C18` is the frame a widget is on,
// `0x512A80` how many ticks are left before the next step, `0x423E10` asks for
// a new frame, `0x41FFF0` starts a script, `0x41FEC0` does the walking and
// `0x41F110` rebuilds.
//
// That is why the machine reads as a sequence of still pictures rather than as
// something running: nothing moves unless something asked it to, and on the
// main menu that is exactly three things — the plates turning over, the dial's
// needle following the lit row, and the lit row's own lamp.
//
// The two modes are the exe's own, split on whether the widget is heading for
// a TARGET or running a SCRIPT.

/** One step of a script: a frame, and how many ticks to hold it. */
export type Beat = readonly [frame: number, hold: number]

/**
 * A widget's script — pairs out of the table at 0x4C0A78, looping where the
 * table's own negative entry jumps back. A script whose last hold is zero
 * simply stops there.
 */
export interface Script {
  beats: readonly Beat[]
  loop: boolean
}

/**
 * The LIT LAMP — animation id 1002 (cursor 8 of the script table), which is
 * what a row's widget is given when the light lands on it: `light2` for a
 * tick, `light3` for ten, `light2` for one more and `light1` for five, round
 * and round. Seventeen ticks, most of them on the brightest.
 */
export const LAMP_BLINK: Script = {
  beats: [
    [1, 1],
    [2, 10],
    [1, 1],
    [0, 5]
  ],
  loop: true
}

export interface Widget {
  /** The frame it is on. */
  frame(): number
  /** Walk to `target`, `step` frames at a time, a step every tick. It
   * re-aims whatever the widget was doing, script included — 0x423E10 asks
   * no questions. Where the exe wants a request REFUSED mid-walk it tests
   * `0x420030(widget)` at the call site, and so does this file's caller. */
  goTo(target: number, step?: number): void
  /** Put it on a frame at once, with nothing running. */
  set(frame: number): void
  /** Run a script from its first beat (exe 0x41FFF0). */
  play(script: Script): void
  /** One frontend tick of 0x41FEC0. Answers the frame it ends up on, and
   * whether it CHANGED — the exe rebuilds the sprite on exactly those ticks,
   * and the dial clicks on the one that lands it. */
  tick(): boolean
  /** Whether it is still on its way. */
  walking(): boolean
}

/** A widget sitting on `from`. */
export function widget(from: number): Widget {
  let current = from
  let target = from
  let step = 1
  /** Ticks left before the next step; zero is "not animating", which is the
   * exe's own test for whether a widget is busy. */
  let counter = 0
  let script: Script | null = null
  let beat = 0

  const startBeat = (): void => {
    if (!script) return
    const [frame, hold] = script.beats[beat]
    current = frame
    counter = hold
  }

  return {
    frame: () => current,
    goTo(to, by = 1) {
      script = null
      if (current === to) {
        counter = 0
        return
      }
      target = to
      step = Math.abs(by)
      counter = step
    },
    set(frame) {
      script = null
      counter = 0
      current = frame
      target = frame
    },
    play(it) {
      script = it
      beat = 0
      startBeat()
    },
    tick() {
      if (counter === 0) return false
      counter -= 1
      if (counter > 0) return false
      if (script) {
        beat += 1
        if (beat >= script.beats.length) {
          if (!script.loop) {
            script = null
            return false
          }
          beat = 0
        }
        startBeat()
        return true
      }
      current += current < target ? step : -step
      if ((current - target) * (current < target ? -1 : 1) > 0) current = target
      counter = current === target ? 0 : step
      return true
    },
    walking: () => counter !== 0
  }
}
