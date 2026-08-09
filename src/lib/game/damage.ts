// The numbers floating off whatever has just been hurt.
//
// It is the original's own effect, not a flourish: `Pig::TakeDamage`
// (0x467b5b) and the dummy's (0x48da5c) both call **0x487b90** with the body's
// position and the damage — and they pass it `amount >> 7`, which is the whole
// reason health is worth counting in POINTS (lib/game/health.ts). That
// function spawns effect **0x35** with a life of 0x3e8 and hangs the value on
// it at `+0xd4`, with a style index at `+0xd8` picked out of a 16-byte record
// per team at 0x4cf1e4. `damage/notes.md`.
//
// What is NOT decoded is how it MOVES, so the rise and the fade are the
// remake's own — and so is reading 0x3e8 as milliseconds rather than the turn
// clock's hundredths. Only the value, the point it starts at and the fact that
// there is one at all come from the exe.
//
// Where it ends up ON SCREEN is a projection and belongs to whatever holds the
// camera; this is the list, in game space (Y-down).

import type { Point } from './pose'

/** How long one stays up. */
export const NUMBER_SECONDS = 1

/** How far it drifts up over that time, in world units — a pig is 320 tall,
 * so this is about half a body. The remake's own. */
export const NUMBER_RISE = 160

export interface FloatingDamage extends Point {
  /** The damage, in points — what the exe puts on the effect. */
  value: number
  /** 0 at the moment of the hit, 1 as it goes out. */
  age: number
}

export interface DamageNumbers {
  /** Something took `value` points at this spot. */
  show(at: Point, value: number): void
  /** Age them; call once a frame. */
  update(delta: number): void
  /** Every one still floating, oldest first — what a renderer projects. */
  all(): readonly FloatingDamage[]
  /** How many are still up — "the last damage" as something the beat after a
   * blow can wait on (lib/game/aftermath.ts). */
  live(): number
  /** Drop the lot — a new battle. */
  clear(): void
}

export function createDamageNumbers(): DamageNumbers {
  let live: FloatingDamage[] = []

  return {
    show(where, value) {
      if (value <= 0) return
      live.push({ x: where.x, y: where.y, z: where.z, value, age: 0 })
    },
    update(delta) {
      for (const one of live) one.age += delta / NUMBER_SECONDS
      live = live.filter((one) => one.age < 1)
    },
    all: () => live,
    live: () => live.length,
    clear() {
      live = []
    }
  }
}
