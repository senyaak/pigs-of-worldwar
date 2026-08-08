// The CLOUD — the bulk of an explosion, and the biggest thing the effect
// system had left unopened.
//
// A parameter row's twelve stages spawn children through five different
// spawners (`effects.ts`). Two of them, `0x48bff0` and `0x48c160`, were never
// read, and row 0 — which is what a grenade going off resolves to, and what a
// thing breaking resolves to as well — turns on FOUR stages through them. So
// the remake was drawing one stage of five: six grey puffs, which is why a
// blast looked like a crate and neither looked like anything.
//
// `0x48bff0(base)` is the big one. It reads eight parameters and builds a
// CHILD effect that is not a normal particle effect at all:
//
// ```
// 48c010  param(base+0)                ; the gate, AND the count
// 48c022  [0x537dec] = 1               ; the child gets ONE ordinary particle
// 48c059  child = new Effect(id 0x1a)  ; at the parent's own position
// 48c08b  [child+0x6e] = param(base+0) ; …but its own array of THIS many
// 48c0a0  [child+0x70] = malloc(n*20)  ; twenty bytes each
// 48c10b  0x489740(p4, p5, p6, colour(p1,p2,p3), 0, 0)
// 48c118  [child+0x76] = 5             ; the age step: 100/5 = TWENTY frames
// 48c12b  [child+0x7e] = param(base+7) ; what scales the sprite
// ```
//
// A twenty-byte record is a light particle — position at `+0`/`+2`/`+4`,
// velocity at `+8`/`+0xa`/`+0xc`, a colour word at `+0x10` and one byte of
// gravity at `+0x12` — stepped by `0x48a7e0` and drawn by `0x489fa0`, both
// hung off `[+0x70]` being non-null (0x48a637, 0x489c74). `0x489740` fills
// them and `0x489890` aims each one.
//
// Row 0 asks for **seventy of them, twice**: a dark red cloud on frame 1 and a
// near-black one on frame 2, both fired up and out and pulled back down.
//
// Pure, and in the remake's game space (Y-DOWN) — see the note on the launch.
// `../../../pigs-disasm/effects/notes.md`.

/** A full turn in the raw count the trig takes: the engine multiplies the
 * count by 5/2 and closes at 4096, so 0x648 is a turn less a whisker — the
 * same unit, and the same whisker, as the ring's 32 segments of 50. */
const TURN = 0x648

/**
 * How wide the cone is: `rand() % 0xc9` of that turn (0x4898b3), which is
 * 200·5/8192 = **44°** about the vertical.
 *
 * The spawner's last argument picks between this and `rand() % 0x324` — a
 * half turn, so a whole sphere (0x4898ac). Row 0 passes 0, so a blast is a
 * cone and not a ball.
 */
const CONE = 0xc9

/** Each one's speed is scaled by `rand() % 0x80 + 0x80` over 128 (0x4898c2,
 * 0x489962) — so between once and twice the row's own figure. */
const SPREAD = 0x80

/** What the age steps a frame, `[child+0x76]` (0x48c118). */
export const CLOUD_STEP = 5

/** …and the age it dies at, the same 100 as everything else in the system. */
export const CLOUD_DEAD = 100

/**
 * What the sprite's size is measured against: `(200 - age) * [+0x7e] * 12.5`
 * (0x489fe1..0x48a013, the `*2500/200`). So it starts at twice what it ends
 * at and SHRINKS the whole way — the fireball collapses rather than billows.
 */
export const cloudSize = (cloud: Cloud): number => (200 - cloud.age) * cloud.size * 12.5

/**
 * A colour component as the draw packs it: `c * 400 >> 6`, so 0..31 becomes
 * 0..194 rather than 0..255 (0x48a04a..0x48a086). Nothing divides by the age
 * the way a ring does — a cloud does not flash.
 */
export const cloudChannel = (c: number): number => (c * 400) >> 6

/** One stage's worth: what `0x48bff0` reads off the row, in order. */
export interface CloudStage {
  /** The frame of the parent's life it is born on, `param(when) + 1`. */
  at: number
  /** How many sprites — `param(base+0)`, and zero means the stage is off. */
  count: number
  /** `param(base+1..3)`, five bits each. */
  colour: [number, number, number]
  /** How fast one leaves along the cone's axis — `param(base+4)`, through
   * `0x489890`'s third argument (0x48997b). */
  up: number
  /** …and how fast it leaves sideways — `param(base+5)`, the second
   * argument, which scales both x and z (0x489905). */
  out: number
  /** What is taken off the vertical velocity every frame — `param(base+6)`,
   * parked in the record's own byte at `+0x12` (0x489861) and subtracted by
   * `0x48a801`. */
  gravity: number
  /** What scales the sprite — `param(base+7)`, `[child+0x7e]`. */
  size: number
}

/** One sprite. Game space, Y-DOWN, and exe units a frame. */
export interface Blob {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
}

/** A cloud in flight: one age for the lot, which is how the engine has it —
 * the array belongs to a single child effect and the size comes off that
 * child's own age, not off each sprite's. */
export interface Cloud {
  age: number
  gravity: number
  size: number
  colour: [number, number, number]
  blobs: Blob[]
}

/** The angle a raw count means, in radians: the engine takes `n * 5 / 2` and
 * treats 4096 as a turn. */
const angleOf = (n: number): number => ((n * 5) / 8192) * 2 * Math.PI

/** A sine or cosine in 256ths, truncated exactly where the engine truncates
 * it — `ftol(f * 4096)` then `sar 4`. */
const fixed = (f: number): number => Math.trunc(f * 4096) >> 4

/**
 * Let one go.
 *
 * **The launch is UPWARD, and this is where a long-standing sign error in the
 * notes gets corrected.** The engine's world has +y UP: its three force
 * generators all point `(0,-1,0)` and gravity is one of them
 * (`../../../pigs-disasm/movement/notes.md`), so falling is y going DOWN. The
 * effect table agrees from four directions — every burst's vertical launch is
 * `rand()%100 * p * 3/100`, which can only be positive; row 15 stacks three
 * shockwave rings at +100, +300 and +600; a damage number lays its trail at
 * `y + 100` (0x48b973) and a damage number floats up. So the byte the engine
 * SUBTRACTS from the vertical is **gravity**, not buoyancy, and the notes'
 * "y is DOWN, so the byte the code calls gravity is buoyancy" had it exactly
 * backwards.
 *
 * The remake works Y-down, so both signs flip here, once, and nowhere else.
 */
export function spawnCloud(
  stage: CloudStage,
  at: { x: number; y: number; z: number },
  random: () => number = Math.random
): Cloud {
  const blobs: Blob[] = []
  for (let n = 0; n < stage.count; n++) {
    const yaw = angleOf(Math.floor(random() * TURN))
    const pitch = angleOf(Math.floor(random() * CONE))
    const spread = Math.floor(random() * SPREAD) + SPREAD
    const sinPitch = fixed(Math.sin(pitch))
    // The vertical loses three more bits than the pair round it (0x489985).
    const up = (((fixed(Math.cos(pitch)) >> 3) * stage.up * spread) >> 7) * -1
    const out = (trig: number): number =>
      (((trig * sinPitch) >> 11) * stage.out * spread) >> 7
    blobs.push({
      x: at.x,
      y: at.y,
      z: at.z,
      dx: out(fixed(Math.cos(yaw))),
      dy: up,
      dz: out(fixed(Math.sin(yaw)))
    })
  }
  return { age: 0, gravity: stage.gravity, size: stage.size, colour: stage.colour, blobs }
}

/**
 * One frame of it, in the engine's own order: gravity onto the vertical
 * first, then the whole velocity onto the position (0x48a801..0x48a818), and
 * the age last (0x48a829).
 */
export function advanceCloud(cloud: Cloud): void {
  for (const blob of cloud.blobs) {
    blob.dy += cloud.gravity
    blob.x += blob.dx
    blob.y += blob.dy
    blob.z += blob.dz
  }
  cloud.age += CLOUD_STEP
}

/** Whether it is done — the draw and the step share this gate (0x489fb5,
 * 0x48a7ea). */
export const cloudSpent = (cloud: Cloud): boolean => cloud.age >= CLOUD_DEAD
