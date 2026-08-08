// The smoke a grenade leaves behind it.
//
// Play: "там нет шлейфа от гранаты." There is one, and it took looking in the
// right place to find: it is not in the projectile's UPDATE, where two separate
// per-kind dispatches both send the plain grenade straight to the exit
// (0x436621 → 0x43692f, 0x436766 → 0x4368f5). It is in the **CONSTRUCTOR**.
//
// `0x43247b` is the arm the whole grenade family takes — kinds 24..33 and 37 —
// and the first thing it does is build a PARENTED effect:
//
// ```
// 43247b  new(0xE4)
// 4324ac  push 15h ; push esi            ; id 0x15, parent = the projectile
// 4324b1  0x487620(parent, 0x15, 0,0,0, 0,0, 0, 1, 0x3E8, 0x19, 1, 2)
// ```
//
// Offset zero on every axis, so `0x48a3d0` re-derives its world position off the
// projectile's transform every frame: the effect FOLLOWS the grenade. Effect
// 0x15's Init arm (0x488d87) is one of the few that never calls `0x48ccc0`, so
// its parameter row stays −1 and the twelve-stage machinery refuses to run
// (0x48bc65) — this effect has no stages at all. Everything it does is in its
// UPDATE arm, 0x48b024:
//
// ```
// 48b038  edi = 6                            ; SIX a frame
// 48b03d  step = ([+0xA8] - [+0xB0]) / 6      ; ...and the same for y and z
// 48b0b8  0x48A8B0(1, 0x16, xy, z, 0,0,0,0)   ; one particle of type 0x16
// 48b0c4  loop
// ```
//
// `[+0xB0..0xB4]` is where the effect was LAST frame and `[+0xA8..0xAC]` where it
// is now, so the six are laid evenly along the segment the grenade travelled —
// which is why the trail does not come apart at throwing speed.
//
// Particle type 0x16 (0x486f8d → `0x486B30(1, 1, -1, 0x14, 0, 0, 0, 0, 0,
// 0x4210, 8)`) is the whole of what one looks like: colour **0x4210**, the mid
// grey that is the setter's own default; age step **0x14**, so it lives
// `100/20 =` **five frames**; and no jitter, no gravity and no velocity at all.
// It sits where it was put and fades.
//
// Six a frame for five frames is thirty alive, which is exactly the capacity
// effect id 0x15 draws from the count table. Nothing here is inferred.
//
// **There is no FIRE in it.** Play asked for smoke and fire; the engine's trail
// is grey smoke and nothing else, so that is what this is.
//
// Pure, game space, exe units.

/** How many go down per frame, spread along the step (0x48b038). */
export const TRAIL_STEPS = 6

/** What one's age advances a frame — so five frames of life (0x486f9b). */
export const TRAIL_AGE_STEP = 0x14

/** The age they all die at, as everywhere else in the effect system. */
export const TRAIL_DEAD = 100

/** 0x4210: sixteen of thirty-one on every channel (0x486f8f). */
export const TRAIL_COLOUR: [number, number, number] = [16, 16, 16]

/** …so this many can be alive at once, which is the capacity id 0x15 gets. */
export const TRAIL_ROOM = TRAIL_STEPS * (TRAIL_DEAD / TRAIL_AGE_STEP)

/** One puff. It does not move — type 0x16 carries no velocity. */
export interface Puff {
  x: number
  y: number
  z: number
  age: number
}

export interface Trail {
  puffs: Puff[]
  /** Where the grenade was when the trail was last laid, or null on the frame
   * it was thrown — the engine's `[+0xB0..0xB4]`, and with nothing there yet
   * there is no segment to lay along. */
  last: { x: number; y: number; z: number } | null
}

export const beginTrail = (): Trail => ({ puffs: [], last: null })

/**
 * Lay this frame's six along the segment from where it was to where it is, and
 * age everything already down.
 *
 * The engine's order: it interpolates and seeds first, then the common tail ages
 * the particles. A puff put down this frame is therefore already one step old by
 * the time it is drawn.
 */
export function advanceTrail(
  trail: Trail,
  /** Where the grenade is, or null once it is gone — the last six still have to
   * fade out, and nothing more goes down. */
  at: { x: number; y: number; z: number } | null
): void {
  const from = at ? trail.last : null
  if (at && from) {
    for (let n = 1; n <= TRAIL_STEPS; n++) {
      const t = n / TRAIL_STEPS
      trail.puffs.push({
        x: from.x + (at.x - from.x) * t,
        y: from.y + (at.y - from.y) * t,
        z: from.z + (at.z - from.z) * t,
        age: 0
      })
    }
  }
  if (at) trail.last = { x: at.x, y: at.y, z: at.z }
  for (const puff of trail.puffs) puff.age += TRAIL_AGE_STEP
  trail.puffs = trail.puffs.filter((puff) => puff.age < TRAIL_DEAD)
}

/** Whether anything is left of it — a grenade that has gone still stops laying
 * them, and the last six take five frames to clear. */
export const trailSpent = (trail: Trail): boolean => trail.puffs.length === 0
