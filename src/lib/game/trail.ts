// The smoke a thrown thing leaves behind it — a grenade's trail, and a planted
// charge's burning fuse, which turn out to be the same machinery with different
// numbers (`LOB_TRAIL` and `FUSE_TRAIL` below).
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

/** The age they all die at, as everywhere else in the effect system. */
export const TRAIL_DEAD = 100

/** One trail's numbers: how many go down a frame, how fast they age, and what
 * one looks like. Two projectiles in the game carry one and they are not the
 * same trail. */
export interface TrailKind {
  /** The effect id, so the row it came from is on the record. */
  id: number
  /** How many go down per frame, spread along the step. */
  steps: number
  /** What one's age advances a frame — 100 is dead, so 0x14 is five frames. */
  ageStep: number
  /** The particle type its update arm spawns. */
  particle: number
  /** Five bits a channel, as everywhere in the effect system. */
  colour: [number, number, number]
  /** The particle setter's own size argument. */
  size: number
}

/**
 * **A GRENADE's trail** — effect 0x15, six a frame of particle type 0x16, mid
 * grey, size 8 (0x48b038, 0x486f8d).
 */
export const LOB_TRAIL: TrailKind = {
  id: 0x15,
  steps: 6,
  ageStep: 0x14,
  particle: 0x16,
  colour: [16, 16, 16],
  size: 8
}

/**
 * **A CHARGE's own burning fuse** — and it is a trail like the grenade's, not a
 * flame. Play: "горение динамита не из игры", and it was not: the spark was
 * invented. The projectile constructor's arm for kind 53 (TNT and the mine
 * shell, `0x432414`) does exactly what the grenade's arm does one branch
 * along — it hangs a PARENTED effect on the projectile:
 *
 * ```
 * 432414  new(0xE4)
 * 432442  push 1Dh ; push esi        ; id 0x1D, parent = the projectile
 * 432447  0x487620(parent, 0x1D, 0, 0x3C, 0,0,0,0, 1, 0x3E8, 0x19, 1, 2)
 * 43246b  push 8 ; 0x43A9D0          ; ...and sound 8, at 100/100
 * ```
 *
 * The 0x3C is the offset the grenade's arm passes as zero — the effect rides
 * ABOVE the bundle, where the fuse is. Effect 0x1D's update arm (0x48ad9d) is
 * the same shape as the grenade's, with its own numbers: **four** a frame
 * rather than six (`sar 2`), laid evenly along the segment travelled, of
 * particle type **0x18** — whose setter (0x486f16) gives colour **0x14A5** and
 * size **0x10**, against the grenade's 0x4210 and 8.
 *
 * So the fuse is DARK smoke, five of thirty-one on every channel, in puffs
 * twice the size of a grenade's, four a frame. A planted charge does not move,
 * so all four land on the same spot: a column of smoke standing off the fuse,
 * which is what a burning one looks like. There is no fire in it — the same
 * answer the grenade's trail gave.
 */
export const FUSE_TRAIL: TrailKind = {
  id: 0x1d,
  steps: 4,
  ageStep: 0x14,
  particle: 0x18,
  colour: [5, 5, 5],
  size: 0x10
}

/** How far above the charge the effect is hung — `0x3C`, exe units, the one
 * argument that is not zero (0x43243f). */
export const FUSE_LIFT = 0x3c

/**
 * **A ROCKET's smoke — and this one is the REMAKE's, against a clean negative.**
 *
 * Play: "нет белого густого дыма за снарядом базуки." The exe hangs nothing on
 * it, and both of its trail sites were read to be sure:
 *
 * - the CONSTRUCTOR's trail dispatch is `kind − 0x15` against a 0x21-entry byte
 *   map (0x4323F3), so it answers **kinds 21..53 only** — the grenade family to
 *   0x43247B (id 0x15) and the charges to 0x432414 (id 0x1D). The bazooka is
 *   kind **10** and falls out of range before the map is even read;
 * - the UPDATE's every-fifth-frame trail is `kind − 4` against its own map
 *   (0x436607), and kind 10's slot is 4 — the exit. Only kinds 26 and 27, the
 *   guided family, lay one there.
 *
 * So the original's rocket leaves nothing behind it, and this row exists because
 * play asked for one. It is the grenade's shape with the two things play named:
 * WHITE (thirty-one of thirty-one, where the engine's own default grey is
 * sixteen) and THICK — twice the puffs a grenade lays, at twice the size and
 * living twice as long, since a rocket outruns anything a grenade's six-a-frame
 * would leave.
 *
 * (The same reading corrects this file's old claim that a BULLET takes the
 * grenade's trail "from the same pool, because the engine hangs that effect off
 * a projectile in its constructor": kinds 4..20 are outside that dispatch too.
 * A bullet's trail is the remake's as well.)
 */
export const ROCKET_TRAIL: TrailKind = {
  id: 0x15,
  steps: 12,
  ageStep: 0x0a,
  particle: 0x16,
  colour: [31, 31, 31],
  size: 0x10
}

/** How many of a kind can be alive at once, which is the capacity its id gets
 * from the count table. */
export const trailRoom = (kind: TrailKind): number =>
  kind.steps * (TRAIL_DEAD / kind.ageStep)

/** One puff. It does not move — type 0x16 carries no velocity. */
export interface Puff {
  x: number
  y: number
  z: number
  age: number
}

export interface Trail {
  /** Which of the two this is — the numbers travel with it. */
  kind: TrailKind
  puffs: Puff[]
  /** Where the projectile was when the trail was last laid, or null on the
   * frame it was thrown — the engine's `[+0xB0..0xB4]`, and with nothing there
   * yet there is no segment to lay along. */
  last: { x: number; y: number; z: number } | null
}

export const beginTrail = (kind: TrailKind = LOB_TRAIL): Trail => ({
  kind,
  puffs: [],
  last: null
})

/**
 * Lay this frame's along the segment from where it was to where it is, and age
 * everything already down.
 *
 * The engine's order: it interpolates and seeds first, then the common tail ages
 * the particles. A puff put down this frame is therefore already one step old by
 * the time it is drawn.
 */
export function advanceTrail(
  trail: Trail,
  /** Where the projectile is, or null once it is gone — the last few still have
   * to fade out, and nothing more goes down. */
  at: { x: number; y: number; z: number } | null
): void {
  const { steps, ageStep } = trail.kind
  const from = at ? trail.last : null
  if (at && from) {
    for (let n = 1; n <= steps; n++) {
      const t = n / steps
      trail.puffs.push({
        x: from.x + (at.x - from.x) * t,
        y: from.y + (at.y - from.y) * t,
        z: from.z + (at.z - from.z) * t,
        age: 0
      })
    }
  }
  if (at) trail.last = { x: at.x, y: at.y, z: at.z }
  for (const puff of trail.puffs) puff.age += ageStep
  trail.puffs = trail.puffs.filter((puff) => puff.age < TRAIL_DEAD)
}

/** Whether anything is left of it — a grenade that has gone still stops laying
 * them, and the last six take five frames to clear. */
export const trailSpent = (trail: Trail): boolean => trail.puffs.length === 0
