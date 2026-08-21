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
// is now, so they are laid evenly along the segment the grenade travelled — which
// is why the trail does not come apart at throwing speed.
//
// **AND THE ARM ABOVE IS NOT THE GRENADE'S** — corrected 2026-08-11, after play
// refused a flat "the engine gives the rocket nothing" ("ВРЁШЬ!!!"). They were
// right, and the two mistakes behind it are worth keeping:
//
//  1. `0x48B024` is the update arm of effect id **0x14**, not 0x15. The id → arm
//     map is `byte [0x48BF90 + id − 1]` into `[0x48BF24 + slot*4]`: id 0x14 lands
//     on 0x48B024 (`edi = 6`, the ÷6 magic 0x2AAAAAAB, particle type **0x16**)
//     and id 0x15 on **0x48B0F5** (`÷3`, particle type **0x19**). The grenade's
//     constructor arm pushes 0x15 (0x4324AC), so a GRENADE lays **three** a
//     frame and the six belong to whatever uses 0x14.
//  2. What uses 0x14 is the ROCKET, and it comes from a third dispatch nobody
//     had read — see `ROCKET_TRAIL`.
//
// That dispatch (0x436766, the map at 0x436D68 indexed by the KIND straight)
// hands a parented effect to nearly every projectile in the game, and it settles
// the BULLET too: kinds **12..17**, the guns, take slot 3 → `push 15h` — the
// grenade's own id. So a bullet really does lay a grenade's trail, which this
// engine had right by accident and for the wrong reason. The rest of the map, for
// whoever needs it next: 5..10 → 0x14, 11 → 0x17, 18..19 → 0x16, 34/35/46 → 0x14
// hung 0xC8 above, and everything unlisted → nothing.
//
// Both particle types resolve to the SAME setter (0x486F8D, the table at
// 0x4871D0): colour **0x4210**, the mid grey that is the setter's own default;
// age step **0x14**, so one lives `100/20 =` **five frames**; size 8; and no
// jitter, no gravity and no velocity at all. It sits where it was put and fades.
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
  /**
   * Drawn as a SPARK rather than a puff — lit rather than tinted, so it adds to
   * what is behind it instead of sitting over it.
   *
   * `[play]` and nothing else: the exe's own numbers make the burning fuse dark
   * smoke (see `FUSE_TRAIL`), and play remembers sparks. The row stays the
   * exe's everywhere it can; this is the one field that is a ruling.
   */
  spark?: boolean
  /**
   * How far a particle is scattered from the point it is laid at, in exe units.
   *
   * Nought everywhere the exe lays a trail along a SEGMENT — a moving thing
   * spreads its own puffs. A planted charge does not move, so without this its
   * four a frame land on one another; sparks want to fly off.
   */
  scatter?: number
}

/**
 * **A GRENADE's trail** — effect 0x15, and **three** a frame of particle type
 * 0x19, mid grey, size 8 (0x48B0F5, 0x486F8D).
 *
 * The six this used to carry were read off the wrong arm; see the head of this
 * file. Three a frame for five frames is fifteen alive.
 */
export const LOB_TRAIL: TrailKind = {
  id: 0x15,
  steps: 3,
  ageStep: 0x14,
  particle: 0x19,
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
 * So the ARM makes it dark smoke, five of thirty-one on every channel, in
 * puffs twice the size of a grenade's, four a frame — and a planted charge does
 * not move, so all four would land on one another.
 *
 * **`[play]` overrules the colour and the size**: "в оригинале там не дым а
 * искры когда он горит." What is kept off the exe is the shape of the thing —
 * effect 0x1D, four a frame, hung `FUSE_LIFT` above the bundle. What is play's
 * is that they are SPARKS: lit rather than tinted, small, short-lived and
 * thrown clear of the fuse instead of stacked on it. The three fields that
 * changed say so; `ageStep` at 0x28 is two and a half frames alive against the
 * smoke's five, which is what makes a spark a spark rather than a slow ember.
 */
export const FUSE_TRAIL: TrailKind = {
  id: 0x1d,
  steps: 4,
  ageStep: 0x28,
  particle: 0x18,
  // Nearly white with a warm edge, in the effect system's own five bits a
  // channel: 31/24/8 comes out about (248, 192, 64).
  colour: [31, 24, 8],
  size: 6,
  spark: true,
  scatter: 0x18
}

/** How far above the charge the effect is hung — `0x3C`, exe units, the one
 * argument that is not zero (0x43243f). */
export const FUSE_LIFT = 0x3c

/**
 * **A ROCKET's smoke — effect id 0x14, and the ENGINE lays it.**
 *
 * Play: "нет белого густого дыма за снарядом базуки", and then, when a first
 * pass came back with "the exe hangs nothing on a bazooka": "ВРЁШЬ!!!" They were
 * right. The trail is there and it comes from a THIRD dispatch — the projectile
 * update has two, not one, and the first pass read the other:
 *
 * ```
 * 43658a  cmp eax,1Ah / 1Ch          ; eax is the KIND
 * 436596  jne 00436727h              ; …anything outside 26..28 goes here
 * 436727  ecx = [proj+0xB4]          ; the state: 0, 2 or 5 only
 * 43673e  edi = ++[proj+0xA4]        ; …and only as the counter first reaches 0
 * 436755  cmp eax,36h                ; the KIND, straight — no subtraction
 * 436760  dl = [eax + 0x436D68]      ; kind 10 -> slot 1
 * 436766  jmp [edx*4 + 0x436D24]     ;          -> 0x43676D
 * 43676d  new(0xE4); push 14h; push esi; 0x487620(...)
 * ```
 *
 * So a parented effect **0x14** is hung on the rocket on its second frame, at
 * offset zero — the same call and the same `(1, 0x3E8, 0x19, 1, 2)` tail the
 * grenade's own gets. Its update arm is the ÷6 one (0x48B024): **six a frame**
 * of particle type 0x16, against a grenade's three. Twice the smoke, off the
 * engine's own table, which is what "густой" is.
 *
 * **Every number here is the engine's**, colour and size included — play asked
 * for that in as many words ("давай делаем как в движке, в этом же и суть")
 * after a first pass shipped a white, double-size row on the strength of
 * "белый густой дым". The setter gives this trail the same 0x4210 and the same
 * 8 a grenade's gets: what differs is the COUNT, and six against three is the
 * whole of what "густой" turns out to be.
 *
 * If it still reads as nothing in play, the thing that is wrong is the PUFF —
 * our soft canvas blob against the original's textured additive particle
 * (`three/lobTrail.ts`, `expltims.mad`'s `ptp*` art) — and that is where the
 * change belongs, not in this row.
 *
 * One thing read and NOT built: effect 0x14's own Init arm (0x488CCC) lays a
 * single particle of type **0x14** at the spawn point — same grey, size 0x10,
 * so one bigger puff where the rocket left the barrel.
 */
export const ROCKET_TRAIL: TrailKind = {
  id: 0x14,
  steps: 6,
  ageStep: 0x14,
  particle: 0x16,
  colour: [16, 16, 16],
  size: 8
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
  at: { x: number; y: number; z: number } | null,
  /**
   * How far to throw one particle off the point it is laid at, in the caller's
   * OWN units — a whole displacement, signed, one call an axis.
   *
   * A port rather than a roll: nothing in `lib/game` reaches for `Math.random`
   * (CLAUDE.md), and a trail is drawn rather than played, so the scatter a
   * SPARK row asks for belongs to whoever is drawing it. Left out, nothing
   * scatters, which is every row the exe lays along a segment.
   */
  jitter?: () => number
): void {
  const { steps, ageStep } = trail.kind
  const from = at ? trail.last : null
  const off = (): number => (jitter && trail.kind.scatter ? jitter() : 0)
  if (at && from) {
    for (let n = 1; n <= steps; n++) {
      const t = n / steps
      trail.puffs.push({
        x: from.x + (at.x - from.x) * t + off(),
        y: from.y + (at.y - from.y) * t + off(),
        z: from.z + (at.z - from.z) * t + off(),
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
