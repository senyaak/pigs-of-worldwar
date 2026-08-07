// What a blow throws off — the first piece of the original's effect system.
//
// The original has ONE effect class and drives every one of them off a table
// of signed bytes: 143 per KIND at 0x4d61e8, scaled per index by 0x4d6c88,
// laid out as twelve timed stages. A stage spawns a CHILD effect of its own,
// and for all five hand-to-hand weapons every live stage spawns the same
// child — id 0x18, a RING. So a hit is two or three expanding, fading bands
// and nothing else. `../../../pigs-disasm/effects/notes.md` is the read.
//
// Pure, like the rest of lib/game: it steps numbers. Drawing a band is the
// scene's job (`three/effects.ts`).

import { FRAME_SECONDS } from './ballistics'

/**
 * One ring the parent effect lets go, decoded straight out of its row.
 *
 * Every field is exe units and exe FRAMES — the engine steps these once a
 * frame and nothing about them is per-second.
 */
export interface RingStage {
  /** The frame of the parent's life it is born on (`param(when) + 1`). */
  at: number
  /** Where the band's outer edge starts, and how it moves. `drift` is the
   * second difference: the growth's own growth, negative on the sword. */
  radius: number
  growth: number
  drift: number
  /** How thick the band is, and how that thickens. The inner edge is
   * `radius - width`. */
  width: number
  spread: number
  /** How much the ring's own age — 0 to 100 — advances a frame, so it lives
   * `100 / step` frames. A stage whose step is 0 does not run at all, which
   * is the exe's own gate (0x48c6fd). */
  step: number
  /** Five bits each, 0..31, packed at `[ring+0x94]`. */
  colour: [number, number, number]
  /** How far the ring sits off the strike, in the engine's Y (DOWN-positive),
   * so a negative number is above it. Zero on every melee kind. */
  lift: number
}

/** What one weapon's hit looks like. */
export interface HitEffect {
  /** The effect id the exe spawns (0x476187's own jump table). */
  id: number
  /** The parameter row that id resolves to, through `0x48ccc0`. */
  kind: number
  rings: RingStage[]
}

const ring = (
  at: number,
  radius: number,
  growth: number,
  drift: number,
  width: number,
  spread: number,
  step: number,
  colour: [number, number, number]
): RingStage => ({ at, radius, growth, drift, width, spread, step, colour, lift: 0 })

/**
 * Skill -> what its hit throws. Keyed by SKILL rather than by kind because
 * that is what the caller has, and note the grouping is NOT the one the
 * impact SOUNDS use — the bayonet shares `I_STAB` with the knife and the prod
 * and shares its ring with neither.
 *
 * Every number is `param(base + n)` off the row, already scaled.
 */
const HITS: Record<number, HitEffect> = {
  // 1 TROTTER, and a boot: the exe's kick arm joins this one (0x47615e).
  1: {
    id: 0x37,
    kind: 0x0b,
    rings: [ring(1, 0, 50, 0, 0, 10, 10, [10, 7, 15]), ring(4, 0, 50, 0, 0, 10, 7, [11, 6, 15])]
  },
  2: {
    id: 0x37,
    kind: 0x0b,
    rings: [ring(1, 0, 50, 0, 0, 10, 10, [10, 7, 15]), ring(4, 0, 50, 0, 0, 10, 7, [11, 6, 15])]
  },
  // 3 BAYONET — the smallest of the four, at half the growth of the rest.
  3: {
    id: 0x36,
    kind: 0x0a,
    rings: [ring(1, 0, 25, 0, 0, 5, 14, [10, 7, 15]), ring(4, 0, 25, 0, 0, 5, 14, [11, 6, 15])]
  },
  // 4 SWORD — three, and the only kind with a second difference: both of its
  // big rings SLOW as they go out. An age step of 2 is fifty frames.
  4: {
    id: 0x38,
    kind: 0x0c,
    rings: [
      ring(1, 0, 50, -2, 0, 20, 4, [10, 7, 15]),
      ring(4, 0, 50, -6, 0, 20, 2, [11, 6, 15]),
      ring(6, 0, 15, 0, 0, 6, 7, [11, 6, 15])
    ]
  },
  // 5 CATTLE PROD — three. It also throws a BURST of fifteen particles
  // (stage K, child id 0x1a), which is not built: the particle half of the
  // system is undecoded past its 40-byte record.
  5: {
    id: 0x39,
    kind: 0x09,
    rings: [
      ring(1, 0, 50, 0, 0, 20, 3, [7, 7, 15]),
      ring(4, 0, 50, 0, 0, 20, 3, [11, 6, 15]),
      ring(6, 0, 50, 0, 0, 10, 3, [15, 6, 15])
    ]
  }
}

/** What this skill's hit throws, or null for everything that is not a melee
 * weapon. */
export const hitEffectOf = (skill: number | null): HitEffect | null =>
  skill === null ? null : (HITS[skill] ?? null)

/** How many segments a ring is drawn in — `[ring+0x84]`, set by effect 0x18's
 * own constructor arm (0x488dff). */
export const RING_SEGMENTS = 32

/**
 * How far round a ring actually goes.
 *
 * The exe steps the angle by `0x648 / segments`, integer — 1608/32 = 50 — and
 * both of its trig calls close at 1638.4. So 32 steps of 50 is 97.6% of a
 * circle and the band is a whisker short of joining. Kept, because it is what
 * the numbers say and because a seam that narrow costs nothing.
 */
export const RING_SWEEP = ((RING_SEGMENTS * Math.floor(0x648 / RING_SEGMENTS)) / 1638.4) * 2 * Math.PI

/** The age a ring dies at (0x48a84e). */
export const RING_DEAD = 100

/** What multiplies a colour component before the age divides it: `c*5*5*16`
 * at 0x48a13e. */
const RING_GAIN = 400

/** A ring in flight. Positions are game space (Y-down), sizes exe units. */
export interface Ring {
  x: number
  y: number
  z: number
  radius: number
  growth: number
  drift: number
  width: number
  spread: number
  age: number
  step: number
  colour: [number, number, number]
}

/** An effect in flight: the stages it has still to let go, and what it has. */
export interface Effect {
  /** Whole frames since it was spawned — what a stage's `at` is compared to. */
  frame: number
  /** Fractional frames carried between updates, so the count stays the exe's
   * even though the renderer's step is seconds. */
  carry: number
  pending: RingStage[]
  rings: Ring[]
  at: { x: number; y: number; z: number }
}

/** Spawn one at a point in game space. */
export function beginEffect(effect: HitEffect, at: { x: number; y: number; z: number }): Effect {
  return { frame: 0, carry: 0, pending: [...effect.rings], rings: [], at: { ...at } }
}

/** Whether anything is left of it. */
export const spent = (effect: Effect): boolean =>
  effect.pending.length === 0 && effect.rings.length === 0

/**
 * Step it. The engine counts FRAMES, so `delta` is converted and whole frames
 * are taken one at a time — a long frame must not let a stage go by unfired
 * or a ring skip its whole life.
 */
export function advanceEffect(effect: Effect, delta: number): void {
  effect.carry += delta / FRAME_SECONDS
  while (effect.carry >= 1) {
    effect.carry -= 1
    effect.frame++
    for (let i = effect.pending.length - 1; i >= 0; i--) {
      const stage = effect.pending[i]
      if (stage.at !== effect.frame) continue
      effect.pending.splice(i, 1)
      // The gate: a stage whose age step is zero would never die, and the exe
      // refuses to build it at all.
      if (stage.step <= 0) continue
      effect.rings.push({
        x: effect.at.x,
        y: effect.at.y + stage.lift,
        z: effect.at.z,
        radius: stage.radius,
        growth: stage.growth,
        drift: stage.drift,
        width: stage.width,
        spread: stage.spread,
        age: 0,
        step: stage.step,
        colour: stage.colour
      })
    }
    // 0x48a840, in its own order: the age first, then the width, then the
    // radius, and the growth last off its own second difference.
    for (const one of effect.rings) {
      one.age += one.step
      one.width += one.spread
      one.radius += one.growth
      one.growth += one.drift
    }
    effect.rings = effect.rings.filter((one) => one.age < RING_DEAD)
  }
}

/**
 * What a ring is painted, 0..1 per channel.
 *
 * `c * 400 / (age + 1)`, and the vertex takes it as a byte — so a ring is
 * BLINDING on the frame it is born and falls off as 1/age, which is why a hit
 * reads as a white flash collapsing into the row's own dark blue-purple.
 */
export function ringColour(one: Ring): [number, number, number] {
  const fade = (c: number): number => Math.min(255, (c * RING_GAIN) / (one.age + 1)) / 255
  return [fade(one.colour[0]), fade(one.colour[1]), fade(one.colour[2])]
}
