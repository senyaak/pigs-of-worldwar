// A planted charge's BURNING FUSE — effect 0x1D, `effects/fuse.md`.
//
// `[exe]` A projectile of kind 52 or 53 hangs the effect on itself in its
// constructor (0x432414), 0x3C up. Its Init gives it ten of the cloud's own
// records (0x489260, 0x4892C8) and its update arm (0x48B85C) takes one of them a
// frame back to the top of the charge and throws it up again, in the cloud's
// narrow cone at a quarter of the speed. The ten share one age, pinned every
// frame, so they never time out: a small standing flame, for as long as the
// charge stands.
//
// It is NOT the dark smoke of 0x48AD9D, which this used to be built from: that
// arm is effect 0x22's (`effects/fuse.md`).
//
// Records are the cloud's (`cloud.ts`): the same aim, the same step, the same size
// and colour laws. Only the renewal is this effect's.
//
// Pure. Offsets from the fuse tip, Y-down, exe units a frame. The roll is the
// caller's, because a flame is drawn rather than played and `lib/game` never
// reaches for `Math.random`.

import { advanceCloud, aimBlob, cloudSpent } from './cloud'
import type { Blob, CloudRecords } from './cloud'

/** One channel triple, five bits each, as everywhere in the effect system. */
export type FlameColour = [number, number, number]

export interface FuseRow {
  /** The effect id, so the row it came from is on the record. */
  id: number
  /** How many records it has, `[+0x6E]`. One is renewed a frame. */
  records: number
  /** How fast a renewed record leaves sideways: 0x489890's second argument. */
  out: number
  /** …and along the cone's axis: its third. */
  up: number
  /** What every velocity is divided by once it is aimed. */
  slowed: number
  /** The record's gravity byte. */
  gravity: number
  /** What scales the sprite, `[+0x7E]`. */
  size: number
  /** The age the arm pins the whole array at, every frame. */
  heldAt: number
  /** A record's red: the same for every one. */
  red: number
  /** How many greens one can draw: 0 up to one short of this, once, at Init. */
  greens: number
  /** A record's blue. */
  blue: number
}

/** Every number is the exe's, `effects/fuse.md`. */
export const FUSE_TRAIL: FuseRow = {
  id: 0x1d,
  records: 10,
  out: 1,
  up: 2,
  slowed: 4,
  gravity: 2,
  size: 4,
  heldAt: 0x5a,
  red: 15,
  greens: 15,
  blue: 0
}

/** How far above the charge the exe hangs the effect (0x43243F). The drawing
 * goes by the fuse tip instead, on play's word (`three/grenades.ts`, `tipOf`). */
export const FUSE_LIFT = 0x3c

/** One fuse alight: the cloud's records, each with a colour of its own. */
export interface Fuse extends CloudRecords {
  /** Index-aligned with `blobs`. Rolled once, and a renewal leaves it alone. */
  colours: FlameColour[]
  /** The effect's tick counter, `[+0x9C]`, wrapped: which record is renewed. */
  frame: number
}

/**
 * Light one. All ten start on the tip with no velocity (Init passes 0x489740 an
 * up and an out of nothing) and only gravity moves them until each one's turn
 * comes round.
 */
export function beginFuse(random: () => number): Fuse {
  const { records, gravity, size, red, greens, blue } = FUSE_TRAIL
  const blobs: Blob[] = []
  const colours: FlameColour[] = []
  for (let n = 0; n < records; n++) {
    blobs.push({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 })
    colours.push([red, Math.floor(random() * greens), blue])
  }
  return { age: 0, gravity, size, blobs, colours, frame: 0 }
}

/**
 * One frame, in the engine's order: the cloud's step over all ten, then the arm
 * (`effects/fuse.md`, § The frame: 0x48A63B comes ahead of the arm's call at
 * 0x48A68F). So a renewed record is drawn on the tip the frame it is renewed and
 * the age drawn is the pinned one.
 *
 * `alight` false is the charge gone: nothing renews and nothing pins the age
 * (`effects/fuse.md`, § The frame: 0x48A607 parks the effect and the arm is gated on
 * that), so the step takes it past the draw's gate two frames on.
 */
export function advanceFuse(fuse: Fuse, alight: boolean, random: () => number): void {
  advanceCloud(fuse)
  if (!alight) return
  // The counter ticks ahead of the arm (`effects/fuse.md`, 0x48A5D6), so the first
  // renewal is record 1.
  fuse.frame = (fuse.frame + 1) % fuse.blobs.length
  const aim = aimBlob(FUSE_TRAIL, random)
  const quarter = (speed: number): number => Math.trunc(speed / FUSE_TRAIL.slowed)
  const record = fuse.blobs[fuse.frame]
  record.x = 0
  record.y = 0
  record.z = 0
  record.dx = quarter(aim.dx)
  record.dy = quarter(aim.dy)
  record.dz = quarter(aim.dz)
  fuse.age = FUSE_TRAIL.heldAt
}

/** Whether it is finished with: past the draw's gate, which only a gone charge
 * ever is. */
export const fuseSpent = (fuse: Fuse): boolean => cloudSpent(fuse)
