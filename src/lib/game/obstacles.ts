// What a pig runs into: the map's objects, and the other pigs.
//
// Pure, like the rest of lib/game. Everything here is in the game's Y-DOWN
// space, so a smaller y is HIGHER and an obstacle's `top` is less than its
// `bottom`.
//
// The shapes come out of the .POG, which stores a collision box on every
// record — counts of BOX_UNIT in the order (z, y, x), a COLLIDER rather than the
// art, since a tree's is its trunk (docs/formats.md). The PIG's is not in there:
// the loader jumps the box build for a pig outright (0x4a61ad), and its body
// comes off the engine's own shape table instead (`PIG_RADIUS`).
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
import { MODEL_SCALE } from './scale'
import { isSpawnMarker } from './spawns'
import { HEIGHT_SCALE } from './terrain'
import { surfaceOf } from './underfoot'

/**
 * **The pig's own body: a SPHERE of radius 0xAA = 170, and it is READ.**
 *
 * This was half the spawn marker's 5×5×5 — a guess, and one the loader
 * contradicts: `if ([obj+0x38] == 0x1357) goto` past the box build (0x4a61ad)
 * means a pig NEVER takes a collider from its record, so that 5×5×5 is not a
 * collider anywhere in the original.
 *
 * What a body's shape actually is comes off the type-keyed table at 0x4a90cc,
 * entered at 0x4a8ece with `type - 0x1357`. Slot 0 is the pig:
 *
 * ```
 * 4a8f02  edx = 2        ; shape kind 2 -- a sphere
 * 4a8f07  esi = 0xAA     ; ...of radius 170
 * ```
 *
 * The same table's slot 7 gives the blast effect the radius 35 this engine
 * already uses (`weapons/fire.md`), which is the check that the units are the
 * world's.
 *
 * **And it is a MODEL-space length, so it halves** — the same conversion the
 * bayonet's 460 takes to 230 (`lib/game/melee.ts`), and two measurements agree on
 * it. The pig as DRAWN, bone offsets resolved and `MODEL_SCALE` applied, is
 * **182 across the shoulders** (`pcgru_hi`; 185 for `gr_hi`, 195 for the heavy) by
 * 326 tall and 393 nose to tail. Half its width is 91, and 170 × ½ is 85: the
 * exe's own sphere and the visible pig come out the same size.
 *
 * Which is what play was feeling with the raw 170: "надо что-то делать с раздутой
 * свиньёй — очень сильно заметно что цепляет всё невидимыми боками." A radius of
 * 170 round a body 182 wide is a cylinder twice the pig, and every wall in the
 * game stood that far off it.
 *
 * The WIDTH and not the length: a cylinder cannot fit both, and 393 of snout and
 * tail poking a few units into a wall is nothing beside being held 170 away from
 * it.
 *
 * Used as a CYLINDER of that radius rather than a sphere: the vertical is the
 * step-up's business, and a walking body's contact is rounded off in the
 * original's solver anyway.
 */
export const PIG_RADIUS = 0xaa * MODEL_SCALE

/**
 * **…and how far past an EDGE it is still held up: half its own LENGTH, 196.**
 *
 * One cylinder cannot be a pig. The drawn body is 182 across and **393 nose to
 * tail** (`pcgru_hi`, bone offsets resolved and halved), and the two numbers answer
 * two different questions:
 *
 * - **How near a wall may it stand?** Its SIDES — `PIG_RADIUS`, and taking the
 *   length here is what play felt: "цепляет всё невидимыми боками."
 * - **How far over a drop is it still standing?** Its LENGTH along the ground,
 *   because a body is held while any part of it is over the edge.
 *
 * The tutorial is what forces the second one, and it is the same argument this
 * class was built on: the GAP in CAMP's first bridge is 512 and a running jump
 * carries 303, so nothing narrower than 104 either side can cross it — and the
 * tutorial's own words are JUMP THE GAP. Half the pig's length is 196, which
 * clears it; half its width is 91, which cannot.
 */
export const PIG_HOLD = 393 / 2
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

/**
 * The PROMOTION POINT, object type 395 — the campaign's own currency lying on
 * the ground, and the one thing on a map that is walked into and is not a
 * crate.
 *
 * Eleven records over the 61 shipped maps and ten of them live: DESVAL and
 * EMPLACE carry two each, MASHED, GUNS, LIBERATE, FJORDS, EYRIE and TESTER one
 * each, and BAY's is inert because its field 14 is 0 rather than the 19 that
 * means a record hands something over. All ten live ones are IDENTICAL —
 * field 15 reads `weapon 1, link 0` and field 16 is 1 — so nothing in the
 * record says how much it is worth and every one of them is worth the same.
 */
export const PROPOINT_TYPE = 395

/** Something walked into rather than round: a crate with something in it, or
 * a promotion point. */
export const isPickup = (object: MapObject): boolean =>
  (CRATE_TYPES.has(object.type) || object.type === PROPOINT_TYPE) && object.contents !== null

/**
 * **What is too small to stop a pig — measured on the FOOTPRINT, not on the
 * thinnest side.**
 *
 * Play: "дом бестелесен." He could walk through the house, and this line was
 * why: it asked that BOTH horizontal extents reach two box units, and every wall
 * piece in the game is **one unit thick** (STW04PPP is 64×512×512, STW07PWW
 * 64×512×2048). A wall is thin — that is what a wall is.
 *
 * So the test is now on the footprint as a whole: a box stops a pig unless it is
 * a single unit square, which over the shipped data is exactly the tufts and the
 * livestock — GRASS, GRASS1, GRASS2, FLOWERS, FLOWERS2 all 64×128×64, FISH
 * 64×64×64, LAMP 64×320×64, CHIM 64×128×64 — while everything with any real
 * footprint keeps its collider, down to a SIGN's 64×512×256 and a DUMMY's
 * 128×512×256.
 *
 * Which records are in the exe's collision world is still NOT decoded — the test
 * itself (0x406bb0) is an open thread — so the line is the remake's own, drawn
 * where the data draws one.
 */
export const MIN_SOLID = BOX_UNIT

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
  // A single unit SQUARE is scenery to walk through; anything longer than it is
  // wide in either direction is not.
  if (object.box.y <= 0) return false
  return object.box.x > MIN_SOLID || object.box.z > MIN_SOLID
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
  /**
   * What this face SOUNDS like, as a terrain type — or null for "ask the
   * ground", which is every record but a bridge (lib/game/underfoot.ts).
   */
  surface: number | null
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
  /**
   * …and WHICH record stopped it, or null for nothing in the way.
   *
   * A bullet needs the id, not the yes/no: half the boxes on a map belong to
   * something BREAKABLE, and a shot that is swallowed by a dummy's collider
   * without hurting the dummy is a shot that hit and did nothing. Play found
   * exactly that — "пуля врезается в манекен и ничего не происходит"
   * (lib/game/bullets.ts).
   */
  stopper(x: number, y: number, z: number): number | null
  /**
   * What the pig's feet are ON, as a terrain type, where that is one of OUR
   * faces and it has a material of its own — null everywhere else, and the
   * landscape's own tile answers instead (lib/game/underfoot.ts).
   *
   * The test is `standing`'s, not `standOn`'s: the face has to come back LEVEL
   * with the feet. A deck the pig is falling past is not what it is standing
   * on, and neither is the one under a ramp it is climbing.
   */
  underfoot(x: number, z: number, footY: number): number | null
}

/** Nothing in the way — the default when a map's objects failed to load. */
export const NO_OBSTACLES: Obstruction = {
  standOn: () => null,
  blocks: () => false,
  solid: () => false,
  stopper: () => null,
  underfoot: () => null
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
  const across = TRANSPOSED_BOX.has(object.name.toUpperCase())
  return {
    id: object.id,
    x: object.x,
    z: object.z,
    top: centre - object.box.y / 2,
    bottom: centre + object.box.y / 2,
    halfX: (across ? object.box.z : object.box.x) / 2,
    halfZ: (across ? object.box.x : object.box.z) / 2,
    turn: modelRotationY(object.yaw),
    sloped: isRamp(object.name),
    surface: surfaceOf(object.name)
  }
}

/**
 * **Models whose stored extents lie ACROSS their own art**, so the footprint has
 * to be transposed to match what the player can see.
 *
 * Play: "моделька больше чем текстуры — с лицевой стороны и задней силовое поле —
 * нельзя подойти вплотную." Measured over every shipped map: of the 1113
 * box-shaped records whose extents ARE their model's own footprint, all but
 * sixteen match as stored — and **fourteen of those sixteen are the SHELTER**.
 * Every SHELTER in the game, at all four yaws (CAMP 270°, MASHED 0°, KEEP 180°,
 * HILLBASE 90°, …), carries 832×640 for art that measures 640×832. So it is not
 * the turn and it is not the reading: this one model's record data is the other
 * way round, in all fourteen places it is used.
 *
 * What play felt is the arithmetic: 96 units of collider hanging past the art on
 * two faces (an invisible wall you stop 96 further out from, on top of the pig's
 * own radius) and 96 units SHORT on the other two, which is the pair you could
 * walk into.
 *
 * A named exception rather than a rule, because the measurement says it is one.
 */
const TRANSPOSED_BOX = new Set(['SHELTER'])

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

/** …and how far out it is HELD UP by one: its own length rather than its width
 * (`PIG_HOLD`). A slope still holds a pig by the feet alone. */
const holdReachOf = (obstacle: Obstacle): number => (obstacle.sloped ? 0 : PIG_HOLD)

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

/**
 * How near a face has to come to the feet to BE what they are standing on.
 *
 * One unit of a world whose tile is 512 and whose pig is 320 tall: this is the
 * "same height" test and nothing more, so it stays a unit rather than becoming
 * a tolerance anybody is tempted to tune.
 */
export const STANDING_ON = 1

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
   * What holds the pig up is its OWN BODY resting on something — `PIG_HOLD`, half
   * the length of the drawn pig — so it is held while any part of it is over the
   * edge, the way a box on a ledge is.
   *
   * That was tried the other way, by the feet alone, and the tutorial says no:
   * the GAP in CAMP's first bridge is 512 and a running jump carries 303, so the
   * only way over it is to reach the far side with one's own body — 512 less the
   * 196 either side is 120, which a jump clears easily. Held by the feet, the step
   * is impossible. The cost is that a pig stands up to 196 units out over a drop
   * before it falls, and that is what a box on a ledge does in a solver that cannot
   * tip it.
   *
   * A RAMP still gets none of it — see `wallReachOf` for why a slope has to
   * hold a pig by its feet.
   */
  standOn(x: number, z: number, footY: number, reach: number): number | null {
    const on = this.highestUnder(x, z, footY, reach)
    return on === null ? null : topAt(on, x, z)
  }

  /** …and WHICH box that top belongs to. Y counts down, so the highest face is
   * the smallest number. */
  private highestUnder(x: number, z: number, footY: number, reach: number): Obstacle | null {
    let best: Obstacle | null = null
    let bestTop = 0
    for (const obstacle of this.near(x, z)) {
      const top = topAt(obstacle, x, z)
      if (top < footY - reach) continue // too tall to step onto
      if (!penetrates(obstacle, x, z, holdReachOf(obstacle))) continue
      if (best === null || top < bestTop) {
        best = obstacle
        bestTop = top
      }
    }
    return best
  }

  underfoot(x: number, z: number, footY: number): number | null {
    const on = this.highestUnder(x, z, footY, 0)
    if (on === null) return null
    return Math.abs(topAt(on, x, z) - footY) < STANDING_ON ? on.surface : null
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
    return this.stopper(x, y, z) !== null
  }

  stopper(x: number, y: number, z: number): number | null {
    for (const obstacle of this.near(x, z)) {
      // Y counts DOWN, so inside is between the top and the bottom that way
      // round. A point has no radius of its own.
      if (y < topAt(obstacle, x, z) || y > obstacle.bottom) continue
      if (penetrates(obstacle, x, z, 0)) return obstacle.id
    }
    return null
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

/** Whether two bodies are standing in each other — the same test `withPigs`
 * blocks a step by, asked about a pair rather than about a destination. */
export const bodiesOverlap = (a: PigBody, b: PigBody): boolean => {
  if (a.y - PIG_HEIGHT >= b.y || a.y <= b.y - PIG_HEIGHT) return false
  const dx = a.x - b.x
  const dz = a.z - b.z
  return dx * dx + dz * dz <= (PIG_RADIUS * 2) * (PIG_RADIUS * 2)
}

/**
 * The static field plus the pigs that are not the one moving. A pig is
 * never something to stand on: its top is a whole body height up, which no
 * step-up envelope reaches, so it can only ever be in the way.
 *
 * **`at` is where the moving body IS, and every pig it is ALREADY inside is
 * dropped from the list.** Without it a body that overlaps another is held
 * there for good: `blocks` is a test on the DESTINATION alone, the flight
 * zeroes its horizontal velocity the first frame one comes back true
 * (lib/game/locomotion.ts), and every direction out of an overlap is still
 * inside it. Play found what that costs on a BAYONET — "свинья будто на месте
 * летит пол секунды вместо настоящего отбрасывания" — and the arithmetic says
 * it could never have worked: a walking pig is stopped at exactly `2·
 * PIG_RADIUS` from the one it is walking at, which is the same distance this
 * blocks at, so a body struck at melee range starts its flight already on the
 * boundary. A blast catching two pigs shoulder to shoulder is the same trap,
 * which is the other half of what play saw ("граната тоже както странно
 * отбросила").
 *
 * A body cannot be pushed further INTO the pig it overlaps by this, because it
 * cannot be pushed at all — the only thing being dropped is a refusal that had
 * no way out.
 */
export function withPigs(field: Obstruction, pigs: PigBody[], at?: PigBody): Obstruction {
  const inTheWay = at ? pigs.filter((pig) => !bodiesOverlap(pig, at)) : pigs
  return {
    standOn: (x, z, footY, reach) => field.standOn(x, z, footY, reach),
    blocks(x, z, footY, reach) {
      if (field.blocks(x, z, footY, reach)) return true
      for (const pig of inTheWay) {
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
    solid: (x, y, z) => field.solid(x, y, z),
    // A PIG is not a record and has no id, so it can never be the stopper: a
    // bullet is resolved against bodies by its own test (lib/game/bullets.ts).
    stopper: (x, y, z) => field.stopper(x, y, z),
    // …and a pig is not a surface either: nothing stands on one.
    underfoot: (x, z, footY) => field.underfoot(x, z, footY)
  }
}
