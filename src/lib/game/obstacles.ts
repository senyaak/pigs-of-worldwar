// What a pig runs into: the map's objects, and the other pigs.
//
// Pure, like the rest of lib/game. Everything here is in the game's Y-DOWN
// space, so a smaller y is HIGHER and an obstacle's `top` is less than its
// `bottom`.
//
// The shapes come out of the .POG, which stores a collision box on every
// record — extents ÷128 in the order (z, y, x), a COLLIDER rather than the
// art, since a tree's is its trunk (docs/formats.md). The pig's own box is
// in there too: every one of the 772 spawn markers carries 5×5×5, so a pig
// is 640 units on a side and this file needs no guess for it.
//
// The BEHAVIOUR is the one the disassembly already gave up. `TryMove`'s
// dispatch (0x478e78) reads "hitting only the landscape is the successful
// walk", so terrain never refuses a step and an OBJECT does — and the same
// step-up envelope and sidestep the wall handling borrows are the object
// path's own (../pigs-disasm/movement/notes.md). An object is therefore not
// a full stop either: its top is ground when it is within the envelope, and
// a wall only above that.

import type { MapObject } from '../formats/pog'
import { isSpawnMarker } from './spawns'

/**
 * The pig's collision box, from the spawn markers' own 5×5×5. Used as a
 * CYLINDER of that width: a box would have to be turned with the pig, and
 * the original's own solver rounds a walking body's contact off anyway —
 * what a square pig buys is corners that catch.
 */
export const PIG_RADIUS = (5 * 128) / 2
export const PIG_HEIGHT = 5 * 128

/** The stored box's unit — a quarter of a tile. */
const BOX_UNIT = 128

/**
 * The crates. In the original a pig COLLECTS one by walking into it, so a
 * crate cannot be a blocker; there is no pickup yet, and until there is,
 * walking through is much closer than walking around. Types 67, 68 and 388
 * are CRATE1, CRATE2 and CRATE4 — the only crate models any map places.
 */
export const PICKUP_TYPES = new Set([67, 68, 388])

/**
 * The smallest box that is allowed to stop a pig, per horizontal side.
 *
 * Which records are in the exe's collision world is NOT decoded — the test
 * itself (0x406bb0) is still an open thread — so this is the remake's own
 * line, and it is drawn where the data draws one: grass, flowers and the
 * swimming fish all carry a box exactly one unit across, an eighth of the
 * pig's own width, while the smallest real structure is three. Anything a
 * fifth of a pig wide is scenery to walk through.
 */
export const MIN_SOLID = 2 * BOX_UNIT

/** Whether a record is something a pig can run into at all. */
export function isSolid(object: MapObject): boolean {
  if (isSpawnMarker(object)) return false
  if (PICKUP_TYPES.has(object.type)) return false
  return object.box.x >= MIN_SOLID && object.box.z >= MIN_SOLID && object.box.y > 0
}

/** One thing in the way — an oriented box, game space, Y-down. */
export interface Obstacle {
  x: number
  z: number
  /** The box's upper face: SMALLER than `bottom`, because Y counts down. */
  top: number
  bottom: number
  halfX: number
  halfZ: number
  /** How the box is turned about the vertical, matching what the scene
   * draws (three/props.ts): the model's +x points along
   * `(cos yaw, −sin yaw)` in game (x, z). */
  yaw: number
}

/** What locomotion asks about the things in its way. */
export interface Obstruction {
  /**
   * The top a pig with its feet at `footY` may step onto here — the highest
   * one that is no more than `reach` above those feet — or null for nothing
   * to stand on.
   */
  standOn(x: number, z: number, footY: number, reach: number): number | null
  /**
   * Something in the way: a box the pig's body would be inside, whose top
   * is further than `reach` above its feet. Below that it is a step, not a
   * wall, and `standOn` has it.
   */
  blocks(x: number, z: number, footY: number, reach: number): boolean
}

/** Nothing in the way — the default when a map's objects failed to load. */
export const NO_OBSTACLES: Obstruction = {
  standOn: () => null,
  blocks: () => false
}

/** The obstacle a POG record makes, or null when it is not solid. */
export function obstacleOf(object: MapObject): Obstacle | null {
  if (!isSolid(object)) return null
  // Stored y is an elevation of the model's CENTRE; game space is Y-down,
  // so the centre negates and the box's own half-height straddles it. No
  // HEIGHT_SCALE here on purpose: the scene draws props at exactly -y, and
  // collision has to be the surface that is drawn.
  const centre = -object.y
  return {
    x: object.x,
    z: object.z,
    top: centre - object.box.y / 2,
    bottom: centre + object.box.y / 2,
    halfX: object.box.x / 2,
    halfZ: object.box.z / 2,
    yaw: object.yaw
  }
}

/** How near the pig's centre comes to a box, in its own frame. */
function penetrates(obstacle: Obstacle, x: number, z: number, radius: number): boolean {
  const dx = x - obstacle.x
  const dz = z - obstacle.z
  // Into the box's frame: the same axes three/props.ts turns the art onto.
  const cos = Math.cos(obstacle.yaw)
  const sin = Math.sin(obstacle.yaw)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  const nearX = Math.max(-obstacle.halfX, Math.min(obstacle.halfX, localX))
  const nearZ = Math.max(-obstacle.halfZ, Math.min(obstacle.halfZ, localZ))
  const gapX = localX - nearX
  const gapZ = localZ - nearZ
  return gapX * gapX + gapZ * gapZ <= radius * radius
}

/** Tiles the buckets are this wide — a tile, like everything else. */
const BUCKET = 512

/**
 * The map's solid objects, bucketed so a step tests a handful rather than
 * all 370 of them.
 */
export class ObstacleField implements Obstruction {
  private readonly buckets = new Map<number, Obstacle[]>()
  readonly obstacles: Obstacle[] = []

  constructor(objects: MapObject[]) {
    for (const object of objects) {
      const obstacle = obstacleOf(object)
      if (!obstacle) continue
      this.obstacles.push(obstacle)
      // Turned any way, a box stays inside the circle round its corners.
      const span = Math.hypot(obstacle.halfX, obstacle.halfZ) + PIG_RADIUS
      const from = this.cell(obstacle.x - span, obstacle.z - span)
      const to = this.cell(obstacle.x + span, obstacle.z + span)
      for (let col = from.col; col <= to.col; col++) {
        for (let row = from.row; row <= to.row; row++) {
          const key = col * 65536 + row
          this.buckets.set(key, [...(this.buckets.get(key) ?? []), obstacle])
        }
      }
    }
  }

  private cell(x: number, z: number): { col: number; row: number } {
    return { col: Math.floor(x / BUCKET), row: Math.floor(z / BUCKET) }
  }

  /** Everything that could reach (x, z). */
  private near(x: number, z: number): Obstacle[] {
    const { col, row } = this.cell(x, z)
    return this.buckets.get(col * 65536 + row) ?? []
  }

  standOn(x: number, z: number, footY: number, reach: number): number | null {
    let best: number | null = null
    for (const obstacle of this.near(x, z)) {
      if (obstacle.top < footY - reach) continue // too tall to step onto
      if (!penetrates(obstacle, x, z, PIG_RADIUS)) continue
      if (best === null || obstacle.top < best) best = obstacle.top
    }
    return best
  }

  blocks(x: number, z: number, footY: number, reach: number): boolean {
    for (const obstacle of this.near(x, z)) {
      if (obstacle.top >= footY - reach) continue // a step, not a wall
      if (obstacle.bottom <= footY - PIG_HEIGHT) continue // the pig walks under
      if (penetrates(obstacle, x, z, PIG_RADIUS)) return true
    }
    return false
  }
}

/** Where another pig is standing — a cylinder of the pig's own box. */
export interface PigBody {
  x: number
  z: number
  /** The FEET, game Y-down. */
  y: number
}

/**
 * The static field plus the pigs that are not the one moving. A pig is
 * never something to stand on: its top is a whole body height up, which no
 * step-up envelope reaches, so it can only ever be in the way.
 */
export function withPigs(field: Obstruction, pigs: PigBody[]): Obstruction {
  return {
    standOn: (x, z, footY, reach) => field.standOn(x, z, footY, reach),
    blocks(x, z, footY, reach) {
      if (field.blocks(x, z, footY, reach)) return true
      for (const pig of pigs) {
        // Feet far enough apart in height and they miss each other entirely.
        if (pig.y - PIG_HEIGHT >= footY || pig.y <= footY - PIG_HEIGHT) continue
        const dx = x - pig.x
        const dz = z - pig.z
        const reachSquared = (PIG_RADIUS * 2) * (PIG_RADIUS * 2)
        if (dx * dx + dz * dz <= reachSquared) return true
      }
      return false
    }
  }
}
