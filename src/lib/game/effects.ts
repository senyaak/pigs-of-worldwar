// What a blow throws off — the first piece of the original's effect system.
//
// The original has ONE effect class and drives every one of them off a table
// of signed bytes: 143 per KIND at 0x4d61e8, scaled per index by 0x4d6c88,
// laid out as twelve timed stages. A stage spawns a CHILD effect of its own,
// and for all five hand-to-hand weapons every live stage spawns the same
// child — id 0x18, a RING. So a hit is two or three expanding, fading bands
// and nothing else. `effects/notes.md` is the read.
//
// Pure, like the rest of lib/game: it steps numbers. Drawing a band is the
// scene's job (`three/effects.ts`).

import { EXE_FRAME_SECONDS } from './ballistics'
import type { Random } from './random'
import { advanceCloud, cloudSpent, spawnCloud } from './cloud'
import type { Cloud, CloudStage } from './cloud'

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
  /**
   * How far the ring sits off the strike, in the engine's Y. Zero on every melee
   * kind, and only the water splash uses it.
   *
   * **Its SIGN is wrong here and is deliberately left alone**: the splash is a
   * thread of its own that play has parked (docs/history/status.md), and correcting the sign
   * moves the splash. See that thread for the argument — in short, +y is up in the
   * engine, so −500 is BELOW the water and this draws it above.
   */
  lift: number
}

/**
 * A BURST of particles — stages I and J through `0x48c160`, and K and L
 * through `0x48c860`.
 *
 * None of the hand-to-hand rows but the cattle prod's has one; row 0, which
 * is both a thing BREAKING and a grenade going off, has three.
 *
 * **The argument order is now pinned**, and it used to be guesswork. It comes
 * out of `0x48c160` cleanly, and the check is free: the parameter the row
 * gates the whole stage on — it must be greater than zero or nothing is built
 * (0x48c19f) — is the one that lands in `[+0x18]`, the age step. A stage whose
 * particles would never die is a stage the engine refuses, exactly as it
 * refuses a ring with no age step. `0x48c860` is not accounted for
 * instruction by instruction, but it gates on the same two parameters in the
 * same order and packs its colour out of three, so it is read by parallel.
 */
export interface BurstStage {
  /** The frame it goes off on. */
  at: number
  /** How many. It is `param(base + 0)`, written to `[0x537dec]` so that the
   * child effect — id 0x1a, the one id whose particle count comes out of a
   * global — sizes its own array by it (0x48c8b4, 0x48c1b4). */
  count: number
  /** Five bits each. Out of `param(base+6..8)` for stages K and L; the other
   * two spawner's is the hard-coded 0x4210 (0x48c35d), which is the exact
   * default the particle setter compares against — a mid grey. */
  colour: [number, number, number]
  /** How fast one leaves sideways: `cos(bearing) * param(base+2) * 3`, the
   * cosine in 256ths (0x48c2e6). */
  out: number
  /** …and upward: `rand()%100 * param(base+1) * 3 / 100`, so anywhere from
   * nothing to three times it (0x48c302). Never negative — which is one of
   * the four things that settle which way is up (`cloud.ts`). */
  up: number
  /** `param(base+3)` → `[+0x1c]`, the amplitude of the three `rand()%1024`
   * draws the per-frame loop adds. **Not applied here**: how the draws scale
   * by it did not come out of the read, and a wobble invented to fit would be
   * a stand-in. */
  jitter: number
  /** `param(base+4)` → `[+0x1d]`, taken off the vertical every frame
   * (0x48a73e). GRAVITY — see the sign argument in `cloud.ts`. */
  gravity: number
  /** `param(base+5)` → `[+0x18]`, and the gate: a particle lives `100 / this`
   * frames. */
  step: number
}

/** What one weapon's hit looks like. */
export interface HitEffect {
  /** The effect id the exe spawns (0x476187's own jump table). */
  id: number
  /** The parameter row that id resolves to, through `0x48ccc0`. */
  kind: number
  rings: RingStage[]
  bursts?: BurstStage[]
  clouds?: CloudStage[]
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

/**
 * PARAMETER ROW 0, all five of its live stages — which is both a thing
 * BREAKING and a grenade going OFF, because the two resolve to the same row.
 *
 * The break handler (0x48d750, whose last act is to run the object's script
 * command) spawns effect **0x3e** at a point jittered ±32 about the object,
 * with two other ids for two special cases it does not take: 0x4b for record
 * type 0x1f, and 6 where `[+0xb3]` is set. The grenade's own destructor arm
 * spawns **0x54** (0x432e75, which falls into the shared tail at 0x435364).
 * Both ids land on the same jump-table arm — `0x488f80`, `push 0; call
 * 0x48ccc0` — so both read row 0, and what separates a blast from a breaking
 * is only the id, which is what decides whether it hurts.
 *
 * Row 0 has **no rings at all** — F, G and H are off, which is why a hit and a
 * blast look nothing alike. What it has is FIVE stages, and until now the
 * remake drew one of them:
 *
 * | stage | frame | spawner | |
 * | ----- | ----- | ------- | - |
 * | B | 1 | 0x48bff0 | seventy sprites, dark RED |
 * | A | 2 | 0x48bff0 | seventy more, near black |
 * | I | 2 | 0x48c160 | four grey particles, no gravity |
 * | J | 3 | 0x48c160 | four more, thrown higher and living longer |
 * | K | 3 | 0x48c860 | six grey — the only one that was here |
 *
 * So an explosion is a hundred and forty sprites, not six, and the two colours
 * (16,0,0) and (4,3,0) come out of the draw as roughly (100,0,0) and (25,19,0)
 * — the channel gain is `c * 400 >> 6`, nothing divides by the age, and a
 * cloud does not flash the way a ring does. Dark red over near-black over grey
 * smoke is what a Hogs of War blast is made of.
 */
export const ROW_ZERO: HitEffect = {
  id: 0x3e,
  kind: 0,
  rings: [],
  clouds: [
    { at: 1, count: 70, colour: [16, 0, 0], up: 4, out: 3, gravity: 20, size: 4 },
    { at: 2, count: 70, colour: [4, 3, 0], up: 5, out: 4, gravity: 20, size: 4 }
  ],
  bursts: [
    { at: 2, count: 4, colour: [16, 16, 16], out: 10, up: 0, jitter: 25, gravity: 0, step: 10 },
    { at: 3, count: 4, colour: [16, 16, 16], out: 10, up: 20, jitter: 25, gravity: 0, step: 6 },
    { at: 3, count: 6, colour: [16, 16, 16], out: 10, up: 10, jitter: 0, gravity: 0, step: 3 }
  ]
}

/** What a thing coming apart throws. Row 0, under the id the break handler
 * uses. */
export const BREAK_EFFECT: HitEffect = { ...ROW_ZERO, id: 0x3e }

/** …and what a grenade throws. The same row under the destructor's own id —
 * kept apart so the caller reads as what it is rather than borrowing the
 * other, which is what `three/grenades.ts` used to do. */
export const BLAST_EFFECT: HitEffect = { ...ROW_ZERO, id: 0x54 }

/**
 * **A MINE does NOT go off like a grenade. It is parameter row 14.**
 *
 * The remake blew every charge up with row 0, which is what a grenade and a
 * breaking crate share — and that was never read for the mine, only assumed.
 * The two mine rows' effect ids **0x4c and 0x55** (`weapons/mines.md`: the only
 * field the two flavours differ in) go through the same two-level dispatch every
 * other id does — `byte [0x489680 + id − 1]` gives the slot, 51 and 56, both
 * slots hold `0x488fb8`, and that arm is `push 0xE; call 0x48ccc0`. So both
 * flavours read **row 14**, identically, and neither reads row 0.
 *
 * The stage map is now pinned end to end rather than stage by stage. Every one of
 * the twelve is `flag = param(f) == 1`, `when = param(f+1)`, `base = param(f+2)`,
 * and the twelve spawners are read straight off the update (0x48bcaa..0x48bf1b):
 *
 * | stage | flag | spawner | | stage | flag | spawner |
 * | - | - | - | - | - | - | - |
 * | A | 0x00 | cloud 0x48bff0 | | G | 0x21 | ring 0x48c6d0 |
 * | B | 0x0a | cloud 0x48bff0 | | H | 0x2e | ring 0x48c6d0 |
 * | C | 0x53 | inline | | I | 0x5b | burst 0x48c160 |
 * | D | 0x3b | 0x48c410 | | J | 0x66 | burst 0x48c160 |
 * | E | 0x47 | 0x48c410 | | K | 0x71 | burst 0x48c860 |
 * | F | 0x14 | ring 0x48c6d0 | | L | 0x80 | burst 0x48c860 |
 *
 * Run row 0 through it and out comes `ROW_ZERO` above to the number, frames and
 * all — which is the check that says the map is right and not a story.
 *
 * Row 14 is a different picture in every part of it, and **all of it lands on
 * frame 1** where a grenade's is staged over three:
 *
 * | | a GRENADE (row 0) | a MINE (row 14) |
 * | - | - | - |
 * | fireball | TWO clouds, dark red then near-black | **one**, dim (5,2,0), rising less and falling harder |
 * | ring | none | **one**, and it SLOWS — drift −2, in a warm (13,10,4) |
 * | smoke | 14 puffs thrown outward over frames 2 and 3 | **18 thrown straight up**, out 0 |
 *
 * A mine is buried, so its blast goes UP and not out, and it throws a brown
 * shockwave a grenade has none of. Nothing here is invented: `beginEffect` reads
 * these fields the same way it reads row 0's.
 *
 * The RING's `lift` is the one number that needed a decision. The row says
 * **+100** and +y is up in the engine (`cloud.ts` settles that from four
 * directions), so it sits 100 ABOVE the blast — which in this Y-down space is
 * −100. The splash's own lift is knowingly left with the other sign because that
 * is a parked thread (`RingStage.lift`); this one is flipped on the way in, the
 * way `cloud.ts` flips, and says so here.
 */
export const MINE_EFFECT: HitEffect = {
  id: 0x4c,
  kind: 14,
  rings: [
    {
      at: 1,
      radius: 0,
      growth: 95,
      drift: -2,
      width: 0,
      spread: 41,
      step: 8,
      colour: [13, 10, 4],
      lift: -100
    }
  ],
  clouds: [{ at: 1, count: 70, colour: [5, 2, 0], up: 3, out: 2, gravity: 30, size: 4 }],
  bursts: [
    { at: 1, count: 10, colour: [16, 16, 16], out: 0, up: 60, jitter: 30, gravity: 18, step: 6 },
    { at: 1, count: 8, colour: [16, 16, 16], out: 0, up: 60, jitter: 30, gravity: 18, step: 6 }
  ]
}

/**
 * What a CRATE arriving under its canopy kicks up: row 0's smoke, and none of
 * its fire.
 *
 * **The remake's own, and narrowed because play saw the difference** — "коробка
 * когда падает — искрит, не должно быть". Nothing in the exe has been read that
 * spawns an effect for a placed object, so this used to borrow row 0 whole; once
 * row 0 turned out to carry a fireball, a landing crate was setting one off.
 * A crate meeting the ground raises dust, so it takes the three bursts and
 * leaves the two clouds behind. The id is row 0's own, since there is no id of
 * its own to give it.
 */
export const DUST_EFFECT: HitEffect = { id: 0x3e, kind: 0, rings: [], bursts: ROW_ZERO.bursts }

/**
 * A SPLASH — effect id **0x0E**, parameter row **2**, and the whole of it is
 * decoded.
 *
 * It is what a thrown thing leaves when water douses it (0x437d26,
 * `lib/game/grenade.ts` has the arm). Its own Init arm is the one that snaps its
 * y to the WATER HEIGHT before anything else — `0x4A5140(x, z)` into
 * `[this+0xAA]` at 0x488c19 — so however deep the thing was when it was doused,
 * the splash is drawn on the surface. That is why the grenade can sink out of
 * sight and the splash still land where it went in.
 *
 * Row 2 is three RINGS at a lift of **−500**, which in a Y-down space is 500
 * ABOVE the water, in a near-white (15,15,15) — plus a sixty-sprite white cloud
 * and a ten-particle burst. Nothing about it is invented.
 */
export const SPLASH_EFFECT: HitEffect = {
  id: 0x0e,
  kind: 2,
  rings: [
    { at: 2, radius: 0, growth: 100, drift: 5, width: 20, spread: 0, step: 9, colour: [14, 14, 15], lift: -500 },
    { at: 3, radius: 0, growth: 50, drift: 5, width: 20, spread: 0, step: 6, colour: [14, 14, 15], lift: -500 },
    { at: 5, radius: 20, growth: 100, drift: 10, width: 20, spread: 0, step: 6, colour: [14, 14, 15], lift: -500 }
  ],
  clouds: [{ at: 3, count: 60, colour: [15, 15, 15], up: 3, out: 1, gravity: 30, size: 4 }],
  bursts: [
    { at: 3, count: 10, colour: [8, 8, 8], out: 20, up: 90, jitter: 25, gravity: 26, step: 3 }
  ]
}

/**
 * One little cloud of the POISON GAS — effect **0x5E**, whose init arm
 * (0x489083, shared with 0x5D FREEZE and 0x5F MADNESS) is its own and not the
 * twelve-stage table.
 *
 * The read (`weapons/gas.md` in the disasm repo): a 30-slot array, five blobs
 * at birth and one more a frame while the tick is under 20, particle type
 * 0x20 — colour **(2,22,0)** five-bit, bright GREEN where FREEZE is cyan and
 * MADNESS red — **no gravity, no drift**, a blob living ~12 frames, the whole
 * ~32. The canister spawns one of these every 5th frame of its flight
 * (lib/game/gas.ts), so the plume is a CHAIN of them, not this one grown big.
 *
 * The exe's trickle-in and its type-0x20 sprite sizing are not this system's
 * shapes, so the stage is the nearest the cloud spawner speaks: the full
 * thirty at birth, hanging where they are born. `up` 1 is the one liberty —
 * a whisper of rise so a standing plume breathes — and the SIZE is play's
 * dial: 2 drew thirty near-invisible points ("там какие-то искры - а должно
 * быть облако"), 8 draws blobs of about half a pig that overlap into one
 * green puff. `matter` keeps it a cloud rather than a light — its saturated
 * green is past the fireball's brightness line and drawn additive it
 * SPARKLED (three/effects.ts, `LIT`). `[CHECK — remake]` for the rise and
 * the size; the count, the colour and the stillness are the read.
 */
export const GAS_EFFECT: HitEffect = {
  id: 0x5e,
  kind: 28,
  rings: [],
  clouds: [
    { at: 1, count: 30, colour: [2, 22, 0], up: 1, out: 1, gravity: 0, size: 8, matter: true }
  ]
}

/** How far round the burst fans its particles: the same 1638.4-per-turn unit
 * the ring is drawn in, stepped `0x648 / count` a particle (0x48cb0b). */
const BURST_SPREAD = 0x648 / 1638.4

/** The jitter on each one's bearing: `rand() % 30` of that same turn
 * (0x48c983). */
const BURST_WOBBLE = 30 / 1638.4

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

/**
 * One of a burst's particles. The 40-byte record is decoded off the engine's
 * own per-frame loop (0x48a6ab): a position, a velocity added to it every
 * frame, an age 0..100 that steps and dies at 100, and the byte at `+0x1d`
 * taken off the y velocity — which is GRAVITY, the engine's world having +y
 * up (the argument is in `cloud.ts`). Game space here, so the sign is flipped
 * once on the way in.
 */
export interface Particle {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  age: number
  step: number
  gravity: number
}

/** An effect in flight: the stages it has still to let go, and what it has. */
export interface Effect {
  /** Whole frames since it was spawned — what a stage's `at` is compared to. */
  frame: number
  /** Fractional frames carried between updates, so the count stays the exe's
   * even though the renderer's step is seconds. */
  carry: number
  pending: RingStage[]
  waiting: BurstStage[]
  brewing: CloudStage[]
  rings: Ring[]
  smoke: Particle[]
  clouds: Cloud[]
  at: { x: number; y: number; z: number }
}

/** Spawn one at a point in game space. */
export function beginEffect(effect: HitEffect, at: { x: number; y: number; z: number }): Effect {
  return {
    frame: 0,
    carry: 0,
    pending: [...effect.rings],
    waiting: [...(effect.bursts ?? [])],
    brewing: [...(effect.clouds ?? [])],
    rings: [],
    smoke: [],
    clouds: [],
    at: { ...at }
  }
}

/** Whether anything is left of it. */
export const spent = (effect: Effect): boolean =>
  effect.pending.length === 0 &&
  effect.waiting.length === 0 &&
  effect.brewing.length === 0 &&
  effect.rings.length === 0 &&
  effect.smoke.length === 0 &&
  effect.clouds.length === 0

/**
 * Step it. The engine counts FRAMES, so `delta` is converted and whole frames
 * are taken one at a time — a long frame must not let a stage go by unfired
 * or a ring skip its whole life.
 *
 * The rate is the ENGINE's, `EXE_FRAME_SECONDS`, and it used to be
 * `FRAME_SECONDS`. That 1/15 is the one free number in the WALK chain — it
 * halved so a pig at half scale would not sprint — and nothing in the effect
 * system is tied to a pig's stride. Read at 1/15 every timer in here came out
 * twice as long: a twenty-frame fireball took a second and a third to go off.
 * Same argument as the fuse and the gauge, and this is the fourth place to
 * need it.
 */
export function advanceEffect(effect: Effect, delta: number, random: Random = Math.random): void {
  effect.carry += delta / EXE_FRAME_SECONDS
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
    for (let i = effect.waiting.length - 1; i >= 0; i--) {
      const stage = effect.waiting[i]
      if (stage.at !== effect.frame) continue
      effect.waiting.splice(i, 1)
      for (let n = 0; n < stage.count; n++) {
        // Fanned round the horizontal, each one a random nudge off its share
        // — the exe steps a whole 0x648 per particle and divides by the
        // count, so the fan closes on a circle however many there are.
        const turn = (n * BURST_SPREAD) / stage.count + random() * BURST_WOBBLE
        const angle = turn * 2 * Math.PI
        effect.smoke.push({
          x: effect.at.x,
          y: effect.at.y,
          z: effect.at.z,
          dx: Math.cos(angle) * stage.out * 3,
          // Upward, so negative here, and anywhere from nothing to three
          // times the row's own figure: `rand()%100 * p * 3 / 100`.
          dy: -((Math.floor(random() * 100) * stage.up * 3) / 100),
          dz: Math.sin(angle) * stage.out * 3,
          age: 0,
          step: stage.step,
          gravity: stage.gravity
        })
      }
    }
    for (let i = effect.brewing.length - 1; i >= 0; i--) {
      const stage = effect.brewing[i]
      if (stage.at !== effect.frame) continue
      effect.brewing.splice(i, 1)
      // The gate is the count itself: `param(base+0)` of zero and 0x48bff0
      // builds nothing at all (0x48c017).
      if (stage.count <= 0) continue
      effect.clouds.push(spawnCloud(stage, effect.at, random))
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
    // …and the particles, in the engine's order: gravity onto the y velocity
    // first, then the whole velocity added on (0x48a73e..0x48a774).
    for (const one of effect.smoke) {
      one.dy += one.gravity
      one.x += one.dx
      one.y += one.dy
      one.z += one.dz
      one.age += one.step
    }
    effect.smoke = effect.smoke.filter((one) => one.age < RING_DEAD)
    for (const one of effect.clouds) advanceCloud(one)
    effect.clouds = effect.clouds.filter((one) => !cloudSpent(one))
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
