// The engine's one source of chance.
//
// Every roll the battle makes used to be `Math.random` — the drop's spread, the
// tremor's nudge, the smoke off a blast. That is fine for one machine watching
// itself and impossible for two: lockstep means both sides step the same rules
// over the same inputs and get the same battle, and a global RNG makes that a
// coin flip (`net play is lockstep`).
//
// So chance is a PORT like any other. One seeded stream per battle, threaded
// from `createEngine` down to everything that rolls; the seed is the only thing
// two machines have to agree on beforehand.

/** A number in [0, 1). The shape `Math.random` has, so it drops in anywhere. */
export type Random = () => number

/**
 * mulberry32: 32 bits of state, one multiply-xor-shift round.
 *
 * Nothing here is cryptographic and nothing needs to be — what it needs is to
 * be the SAME sequence everywhere, which a hand-written integer generator is
 * and a runtime's built-in is not. `Math.imul` keeps the multiply in 32 bits so
 * it does not drift through a double.
 */
export function seeded(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** What a battle rolls from when nobody said otherwise. A CONSTANT, not the
 * clock: an unseeded battle should replay the same way, and a match that wants
 * a different one passes its own. */
export const DEFAULT_SEED = 0x50_49_47_53
