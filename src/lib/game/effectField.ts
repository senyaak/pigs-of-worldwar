// Every effect running in the battle at once.
//
// `effects.ts` is one effect — its parameter row, its twelve stages, its rings
// and its clouds. This is the LIST of them: what has been thrown, what is still
// going, and the counts the rest of the battle waits on. It lived in
// `three/effects.ts` beside the vertex buffers, so "is anything still coming
// apart" was a question only the renderer could answer — and the aftermath, the
// map script and the turn all ask it.
//
// Nothing here draws. A renderer reads `all()` once a frame and shapes it.

import {
  BLAST_EFFECT,
  BREAK_EFFECT,
  DUST_EFFECT,
  GAS_EFFECT,
  HEAL_EFFECT,
  MINE_EFFECT,
  SPLASH_EFFECT,
  advanceEffect,
  beginEffect,
  hitEffectOf,
  spent
} from './effects'
import type { Effect } from './effects'
import type { Point } from './pose'
import type { Random } from './random'

export interface EffectField {
  /** Something took a hand-to-hand hit here (game space, Y-down). */
  hit(skill: number, at: Point): void
  /** …and something came APART here — a dummy knocked down, and by the look
   * of the exe's handler anything else that breaks. A different effect
   * entirely from a hit: smoke, and not a ring in it. */
  broke(at: Point): void
  /**
   * …and something EXPLODED here, under the effect id its own row names.
   *
   * A GRENADE's 0x54 shares row 0 with a breaking crate, and that is the exe's
   * own doing: both ids land on the same init arm. A MINE's 0x4c does not — it
   * reads row 14, which is one dim fireball, a slowing ring and eighteen puffs
   * thrown straight up (lib/game/effects.ts). Anything else falls back to the
   * grenade's.
   */
  blast(at: Point, effect: number): void
  /** …and something heavy LANDED here. Row 0's smoke without its fire, so a
   * crate arriving raises dust rather than going off (lib/game/effects.ts). */
  dust(at: Point): void
  /** …and a GAS canister let a little cloud go here — effect 0x5E, thirty
   * green blobs hanging where they were born (lib/game/effects.ts). One per
   * puff; the plume is a chain of these along the canister's path. */
  gas(at: Point): void
  /** …and something went into WATER here. Effect 0x0E, row 2: three bright
   * rings and a white cloud. Pass the WATER LINE, not where the thing is — the
   * engine's own arm snaps its y to the surface. */
  splash(at: Point): void
  /** Step them; call once a frame. */
  update(delta: number): void
  /** Everything still running — what a renderer draws. */
  all(): readonly Effect[]
  /** How many rings are alive — what a spec can see of an effect, since its
   * pixels are a colour on a transparent quad. */
  rings(): number
  /** …and how many puffs of smoke. */
  smoke(): number
  /** …and how many sprites the fireballs have up. */
  fire(): number
  /**
   * Whether ANY effect is still running.
   *
   * Not the same as "there is smoke on screen": row 0's bursts do not fire
   * until its second and third frames, so a count of puffs is zero for the
   * first tenth of a second and reads as finished before it has begun.
   * Whatever waits for a thing to come apart has to wait on THIS.
   */
  busy(): boolean
  /** Drop the lot: a new battle, or a warp. */
  clear(): void
}

export function createEffectField(random: Random = Math.random): EffectField {
  const live: Effect[] = []

  return {
    hit(skill, at) {
      const effect = hitEffectOf(skill)
      if (!effect) return
      live.push(beginEffect(effect, at))
    },
    broke: (at) => void live.push(beginEffect(BREAK_EFFECT, at)),
    // …and the MEDICINE BALL's 0x60 reads row 4 — the slow blue ring and
    // motes of a heal, nothing of a fireball (lib/game/effects.ts).
    blast: (at, effect) =>
      void live.push(
        beginEffect(
          effect === MINE_EFFECT.id ? MINE_EFFECT : effect === HEAL_EFFECT.id ? HEAL_EFFECT : BLAST_EFFECT,
          at
        )
      ),
    dust: (at) => void live.push(beginEffect(DUST_EFFECT, at)),
    gas: (at) => void live.push(beginEffect(GAS_EFFECT, at)),
    splash: (at) => void live.push(beginEffect(SPLASH_EFFECT, at)),
    update(delta) {
      for (const effect of live) advanceEffect(effect, delta, random)
      for (let i = live.length - 1; i >= 0; i--) if (spent(live[i])) live.splice(i, 1)
    },
    all: () => live,
    rings: () => live.reduce((n, effect) => n + effect.rings.length, 0),
    smoke: () => live.reduce((n, effect) => n + effect.smoke.length, 0),
    fire: () =>
      live.reduce(
        (n, effect) => n + effect.clouds.reduce((m, cloud) => m + cloud.blobs.length, 0),
        0
      ),
    busy: () => live.length > 0,
    clear() {
      live.length = 0
    }
  }
}
