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
// path's own (movement/notes.md). An object is therefore not
// a full stop either: its top is ground when it is within the envelope, and
// a wall only above that.

import { BOX_UNIT, SHAPE_BOX, modelRotationY } from '../formats/pog'
import type { MapObject } from '../formats/pog'
import { isRamp, isWalkway } from './ramps'
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
 *
 * A WALKWAY is the exception, and it is the remake's own — flagged as such
 * because it is the only line here that a record does not draw. In the original
 * nothing about a bridge is a collider and terrain height is all a pig is
 * pinned to; play says plainly that you walk up a ramp and over a bridge, so
 * something has to carry those surfaces. The shape is nonetheless the record's
 * own: for six of the nine bodiless models the box's upper face is exactly the
 * face the art draws, and `lib/game/ramps.ts` has that measurement and the
 * three it leaves out. A ramp's box then gets a top that CLIMBS across it — its
 * y extent is the rise and its x extent the run — and an abutment's stays flat.
 */
export function isSolid(object: MapObject): boolean {
  if (isSpawnMarker(object)) return false
  if (isPickup(object)) return false
  if (object.shape !== SHAPE_BOX && !isWalkway(object.name)) return false
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
  /**
   * A RAMP's upper face is not level: it climbs from `bottom` at the box's
   * local −x end to `top` at its +x end, which is the way the art's own slope
   * runs once it is tilted (lib/game/ramps.ts). False everywhere else, where
   * `top` is the whole face.
   */
  sloped: boolean
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
  /**
   * Is this POINT inside something solid?
   *
   * `blocks` is shaped like a PIG — it works in feet, a step-up reach and a
   * body radius — and a bullet is none of those. The projectile update reads
   * the terrain table itself (0x43715f and three more inside 0x436xxx), so a
   * shot really is stopped by the world; this is the object half of that.
   */
  solid(x: number, y: number, z: number): boolean
}

/** Nothing in the way — the default when a map's objects failed to load. */
export const NO_OBSTACLES: Obstruction = {
  standOn: () => null,
  blocks: () => false,
  solid: () => false
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
    turn: modelRotationY(object.yaw),
    sloped: isRamp(object.name)
  }
}

/** Where a point falls in the box's own frame — the axes the art is on. */
function local(obstacle: Obstacle, x: number, z: number): { x: number; z: number } {
  const dx = x - obstacle.x
  const dz = z - obstacle.z
  const cos = Math.cos(obstacle.turn)
  const sin = Math.sin(obstacle.turn)
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
}

/**
 * The upper face at (x, z), game Y-down — `top` on a box, and on a RAMP the
 * height of the slope over that spot.
 *
 * Clamped to the box, so a pig whose radius reaches the low end before its
 * centre does gets the ramp's own foot rather than a level off the end of it.
 */
export function topAt(obstacle: Obstacle, x: number, z: number): number {
  if (!obstacle.sloped) return obstacle.top
  const along = local(obstacle, x, z).x
  const climbed = (Math.max(-obstacle.halfX, Math.min(obstacle.halfX, along)) + obstacle.halfX) / (2 * obstacle.halfX)
  return obstacle.bottom + (obstacle.top - obstacle.bottom) * climbed
}

/**
 * How wide the pig is against a WALL: its own radius, so a body is stopped
 * before it is inside one.
 *
 * A ramp gets none of it. Measured on CAMP's own bridge: with the cylinder, a
 * pig climbing the lower ramp stalls 212 units short of the join, because its
 * body reaches 160 ahead and at x 3744 that touches the upper ramp's footprint
 * while the feet are still below the low end of it — a clamped top 212 above
 * the feet is a wall by the envelope. A slope has no side to be shouldered
 * into; walk at the high side of one and the envelope still refuses it, off
 * the centre.
 */
const wallReachOf = (obstacle: Obstacle): number => (obstacle.sloped ? 0 : PIG_RADIUS)

/** The point of this box nearest (x, z) — in the world, not its own frame. */
function nearestOn(obstacle: Obstacle, x: number, z: number): { x: number; z: number } {
  const point = local(obstacle, x, z)
  const nearX = Math.max(-obstacle.halfX, Math.min(obstacle.halfX, point.x))
  const nearZ = Math.max(-obstacle.halfZ, Math.min(obstacle.halfZ, point.z))
  const cos = Math.cos(obstacle.turn)
  const sin = Math.sin(obstacle.turn)
  return { x: obstacle.x + nearX * cos + nearZ * sin, z: obstacle.z - nearX * sin + nearZ * cos }
}

/** How near the pig's centre comes to a box, in its own frame. */
export function penetrates(
  obstacle: Obstacle,
  x: number,
  z: number,
  radius: number
): boolean {
  const point = local(obstacle, x, z)
  const nearX = Math.max(-obstacle.halfX, Math.min(obstacle.halfX, point.x))
  const nearZ = Math.max(-obstacle.halfZ, Math.min(obstacle.halfZ, point.z))
  const gapX = point.x - nearX
  const gapZ = point.z - nearZ
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

  /** …and put one back, which is what the map SCRIPT does when it places an
   * object that started off the map (lib/game/script.ts). Not the opposite of
   * a collected crate — that one never returns. */
  restore(id: number): void {
    this.gone.delete(id)
  }

  /**
   * What holds the pig UP is under its FEET, and nothing wider.
   *
   * A radius here is what let a pig stand on air: its cylinder still overlaps
   * a box 160 units past the edge, so it walked half its own width out over
   * the gap in CAMP's first bridge before it fell. Being STOPPED is the other
   * way round — a body cannot be inside a wall — which is `blocks` and its own
   * reach.
   */
  standOn(x: number, z: number, footY: number, reach: number): number | null {
    let best: number | null = null
    for (const obstacle of this.near(x, z)) {
      const top = topAt(obstacle, x, z)
      if (top < footY - reach) continue // too tall to step onto
      if (!penetrates(obstacle, x, z, 0)) continue
      if (best === null || top < best) best = top
    }
    return best
  }

  blocks(x: number, z: number, footY: number, reach: number): boolean {
    const here = this.near(x, z)
    for (const obstacle of here) {
      if (topAt(obstacle, x, z) >= footY - reach) continue // a step, not a wall
      if (obstacle.bottom <= footY - PIG_HEIGHT) continue // the pig walks under
      if (!penetrates(obstacle, x, z, wallReachOf(obstacle))) continue
      if (rampLeadsTo(here, obstacle, x, z)) continue
      return true
    }
    return false
  }

  /**
   * Whether a RAMP over this spot delivers the pig to that box's top — in
   * which case the box is where the ramp GOES and not a wall across it.
   *
   * The envelope is measured from the pig's feet, and a pig on a slope has its
   * feet PIG_RADIUS behind its own body: 160 further up a 45° ramp is 160
   * higher, which no step-up allows. So everything flush with a ramp reads as
   * a wall from a stride away — measured on CAMP, a pig stalls 96 units short
   * of the join between the two ramp pieces and again 204 short of the deck at
   * the top, both times against something exactly level with the ramp under
   * its own feet. The test is therefore the surface at the box's own EDGE,
   * where the pig will be standing when it touches: level with the box's top
   * or above it, and the box is the end of the climb.
   *
   * What it costs is written down: a pig can walk through the pillars UNDER a
   * bridge, since their tops are under the same walkway. Nothing in the exe
   * has been read either way — a ramp is bodiless there and this whole surface
   * is the remake's (lib/game/ramps.ts).
   */

  solid(x: number, y: number, z: number): boolean {
    for (const obstacle of this.near(x, z)) {
      // Y counts DOWN, so inside is between the top and the bottom that way
      // round. A point has no radius of its own.
      if (y < topAt(obstacle, x, z) || y > obstacle.bottom) continue
      if (penetrates(obstacle, x, z, 0)) return true
    }
    return false
  }
}

function rampLeadsTo(near: Obstacle[], box: Obstacle, x: number, z: number): boolean {
  if (box.sloped) return false
  const edge = nearestOn(box, x, z)
  return near.some(
    (ramp) => ramp.sloped && penetrates(ramp, x, z, 0) && topAt(ramp, edge.x, edge.z) <= box.top
  )
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
    },
    // The pigs are not part of this one: a bullet resolves a body itself, so
    // that it can hurt it (three/shots.ts).
    solid: (x, y, z) => field.solid(x, y, z)
  }
}
