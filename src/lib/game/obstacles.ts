// What a pig runs into: the map's objects, and the other pigs.
//
// Pure, like the rest of lib/game. Everything here is in the game's Y-DOWN
// space, so a smaller y is HIGHER and an obstacle's `top` is less than its
// `bottom`.
//
// The shapes come out of the .POG, which stores a collision box on every
// record — counts of BOX_UNIT in the order (z, y, x), a COLLIDER rather than the
// art, since a tree's is its trunk (docs/formats.md). The pig's own box is
// in there too: every one of the 772 spawn markers carries 5×5×5, so a pig
// is 320 units on a side and this file needs no guess for it.
//
// The BEHAVIOUR is the one the disassembly already gave up. `TryMove`'s
// dispatch (0x478e78) reads "hitting only the landscape is the successful
// walk", so terrain never refuses a step and an OBJECT does — and the same
// step-up envelope and sidestep the wall handling borrows are the object
// path's own (../pigs-disasm/movement/notes.md). An object is therefore not
// a full stop either: its top is ground when it is within the envelope, and
// a wall only above that.

import { BOX_UNIT, SHAPE_BOX, modelRotationY } from '../formats/pog'
import type { MapObject } from '../formats/pog'
import { isSpawnMarker } from './spawns'
import { HEIGHT_SCALE } from './terrain'

/**
 * The pig's collision box, from the spawn markers' own 5×5×5. Used as a
 * CYLINDER of that width: a box would have to be turned with the pig, and
 * the original's own solver rounds a walking body's contact off anyway —
 * what a square pig buys is corners that catch.
 */
export const PIG_RADIUS = (5 * BOX_UNIT) / 2
export const PIG_HEIGHT = 5 * BOX_UNIT

/**
 * The crate models: CRATE1, CRATE2, CRATE4.
 *
 * A crate is only a PICKUP when it actually carries something, and that is
 * the difference between the crates a pig collects and the ones it walks
 * round. All 11 CRATE4s carry nothing, and so do two CRATE1s and two
 * CRATE2s out of the 540.
 *
 * The records say a pickup is SOLID — every one of CAMP's eleven carries
 * shape kind 0 and a real box, 3×3×4 on a CRATE1 and 2×2×4 on a CRATE2 —
 * and play remembers the shove that goes with it. It is nonetheless left OUT
 * of the collision world here, because the two halves do not meet yet: this
 * engine refuses a step that would END inside a box, so a solid crate is one
 * the pig can never be inside, and a pickup collected on overlap is one it
 * can never collect. Whatever reconciles them — collecting off the step's
 * TARGET rather than its result, or a shove that resolves — is its own
 * piece of work; until then a crate is walked into and through.
 */
export const CRATE_TYPES = new Set([67, 68, 388])

/** A crate with something in it — walk into it, do not walk round it. */
export const isPickup = (object: MapObject): boolean =>
  CRATE_TYPES.has(object.type) && object.contents !== null

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

/**
 * Whether a record is something a pig can run into at all.
 *
 * The first test is the exe's own: field 11 picks the collision shape, and
 * only kind 0 builds a box. Kind 1 sets the body's mass properties and no
 * collider — and the 94 records carrying it are every bridge and step piece
 * on every map, which is exactly why the original lets a pig over a bridge
 * instead of walling it off.
 */
export function isSolid(object: MapObject): boolean {
  if (object.shape !== SHAPE_BOX) return false
  if (isSpawnMarker(object)) return false
  if (isPickup(object)) return false
  return object.box.x >= MIN_SOLID && object.box.z >= MIN_SOLID && object.box.y > 0
}

/** One thing in the way — an oriented box, game space, Y-down. */
export interface Obstacle {
  /** The POG record's own id, so one can be taken out of the world again —
   * a crate that has been collected. */
  id: number
  x: number
  z: number
  /** The box's upper face: SMALLER than `bottom`, because Y counts down. */
  top: number
  bottom: number
  halfX: number
  halfZ: number
  /** How the box is turned about the vertical — `modelRotationY` of the
   * stored yaw, which is the SAME turn the art gets. The model's +x then
   * points along `(cos turn, −sin turn)` in game (x, z). */
  turn: number
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
  return isSolid(object) ? boxOf(object) : null
}

/**
 * The box a record describes, whether or not it is in the collision world —
 * a crate needs its own shape to be collected by (lib/game/pickups.ts) even
 * while it is not something to walk into.
 */
export function boxOf(object: MapObject): Obstacle {
  // Stored y is an elevation of the model's CENTRE, in the PMG's own height
  // space — so it rides HEIGHT_SCALE, exactly as the ground and the drawn
  // prop do. Game space is Y-down, so the centre negates and the box's own
  // half-height straddles it. Collision has to be the surface that is drawn:
  // `three/props.ts` scales the same way, and the two must not drift.
  const centre = -object.y * HEIGHT_SCALE
  return {
    id: object.id,
    x: object.x,
    z: object.z,
    top: centre - object.box.y / 2,
    bottom: centre + object.box.y / 2,
    halfX: object.box.x / 2,
    halfZ: object.box.z / 2,
    turn: modelRotationY(object.yaw)
  }
}

/** How near the pig's centre comes to a box, in its own frame. */
export function penetrates(
  obstacle: Obstacle,
  x: number,
  z: number,
  radius: number
): boolean {
  const dx = x - obstacle.x
  const dz = z - obstacle.z
  // Into the box's frame: the same axes three/props.ts turns the art onto.
  const cos = Math.cos(obstacle.turn)
  const sin = Math.sin(obstacle.turn)
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
  /** Records taken out of the world since it was built: a crate a pig has
   * collected is no longer something to push against. */
  private readonly gone = new Set<number>()
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

  /** Everything that could reach (x, z), less whatever has been removed. */
  private near(x: number, z: number): Obstacle[] {
    const { col, row } = this.cell(x, z)
    const here = this.buckets.get(col * 65536 + row) ?? []
    return this.gone.size === 0 ? here : here.filter((box) => !this.gone.has(box.id))
  }

  /** Take a record out of the collision world for good. */
  remove(id: number): void {
    this.gone.add(id)
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
