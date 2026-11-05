// A pig thrown past the line WALKS HOME.
//
// Play, 2026-08-26: "там можно чтобы взрывом отбросило за проходимую границу
// вроде - но потом обратно свин сам бежит." The exe's whole of it is
// `terrain/boundary.md` in the disasm repo:
//
// - the counter, `[pig+0x1A8]`, in the pig's per-frame update on every frame of
//   every pig, 0x46CD20..0x46CEB0: frames outside the box, zero in the air and
//   riding, and on any damage (0x467BF4);
// - past 0x32 of them the shore search, `Pig::MakeForShore` 0x472DD0 (`homeFrom`
//   below), for any pig but the acting one, and for that one in mode 13 only;
// - state 2, 0x46DCEB..0x46E10A: turn on the spot, then the pig's ordinary walk
//   along the bearing, out on the first step on dry, clear ground inside the box;
// - the wait: every frame of the counter and of the walk raises `[0x537FC0]`, the
//   first test of the wait a turn ends through (0x495288, `waiting` below).
//
// What the mechanism under it is, is ours: a walking pig has a locomotion state
// of its own and takes the same step the driven pig does (lib/game/locomotion.ts,
// `goingHome`), which is what the exe's `Pig::Walk` amounts to.
//
// **THE KILL IS NOT HERE.** Past ±0x3DFF, still out after 500 frames, or no ray
// finding a tile: the exe kills the pig, and that is senyaak/pigs-of-worldwar#32.
// Until it lands, all three take the training ground's arm of the same test (x and
// z clamped to ±12288, 0x46D0B5..0x46D17C), so that no pig is left out there with
// the turn waiting on it. `putOnTheLine` below; the flight's half is `flightStep`
// in lib/game/locomotion.ts.
//
// Pure: pigs, a terrain query and a clock in, positions out.

import { FRAME_SECONDS } from './ballistics'
import { TILE_STEP, TILE_WALL, TILE_WATER } from '../formats/pmg'
import type { Pig } from './game'
import { isDead, woundBand } from './health'
import { ANIM, createLocomotion, inWater, restingY, updateLocomotion } from './locomotion'
import type { Intent, LocomotionState } from './locomotion'
import { withPigs } from './obstacles'
import type { Obstruction } from './obstacles'
import { WORLD_LIMIT, clampToWorld } from './terrain'
import type { TerrainQuery } from './terrain'
import type { Tumbles } from './tumble'
import { RAYS, RAY_TILES } from './walkAway'

/** How long a pig stands outside before it looks for home: past this many frames
 * of the counter (`cmp [pig+0x1A8],0x32`, 0x46CE84). */
export const STAND_OUTSIDE = 0x32 * FRAME_SECONDS

/** How long it may be out at all: `[game+0x4E0]`, written once (0x48F2F4) and read
 * once (0x46CEDC). */
export const OUT_TOO_LONG = 0x1f4 * FRAME_SECONDS

/** Standing to turn, how far off the bearing it may set off: 0x40 of a 4096 turn
 * (`cmp eax,0x40`, 0x46DEBB). */
export const FACING_HOME = (0x40 / 4096) * 2 * Math.PI

/** Within this of the target on BOTH x and z, the walk has arrived (`cmp eax,0x4C`,
 * 0x46DD64, 0x46DD9F). */
export const ARRIVED = 0x4c

/** The tiles a target may be on: 8..0x37 on either axis (0x472EC9). */
const inTheBox = (tile: number): boolean => tile >= 8 && tile < 0x38

/** The two masked types water is passed over on (0x472F65..0x472F6F). */
const WATER_TYPES = new Set([4, 11])

/**
 * The box test of the counter: ±0x3000 inclusive is inside (`jl`/`jg`,
 * 0x46CD4C..0x46CE24).
 */
export const insideTheBox = (x: number, z: number): boolean =>
  Math.abs(x) <= WORLD_LIMIT && Math.abs(z) <= WORLD_LIMIT

/**
 * The walk's own test is one unit stricter: ±0x3000 itself still keeps it walking
 * (`jle`/`jge`, 0x46E04B..0x46E0CB).
 */
const clearOfTheLine = (x: number, z: number): boolean =>
  Math.abs(x) < WORLD_LIMIT && Math.abs(z) < WORLD_LIMIT

/**
 * `Pig::MakeForShore` (0x472DD0, `water/notes.md`, `terrain/boundary.md`): the tile
 * centre a pig at (x, z) makes for, or null when no ray found anything.
 *
 * Eight rays of sixteen tiles from the pig's own tile. A tile off the map ends a ray
 * and one outside the box is skipped, so a wall ring at ring 7 is never read. A wall
 * tile ends it, except on the training ground (0x472F40; its clip test asks for the
 * swim and the drowning, which no pig on dry land is wearing). A water tile is passed
 * over. Any other tile is the ray's candidate if `accepts` says a pig fits there
 * (0x478B80), and the ray goes on if not.
 *
 * The smallest dx² + dz² wins and the lower-numbered ray a tie (0x47322D..0x473244).
 * **A ray that found nothing still competes**: its record starts as the pig's own col
 * and row (0x472E49), and the compare does not ask. So near the map's low corner the
 * target comes out at (2·col, 2·row), often still outside, and the pig comes home in
 * hops that double.
 */
export function homeFrom(
  query: TerrainQuery,
  x: number,
  z: number,
  accepts: (x: number, z: number) => boolean,
  training: boolean
): { x: number; z: number } | null {
  const here = query.tileCentre(x, z)
  if (here === null) return null
  const { col, row } = here
  /** The world position of the tile (col + dx, row + dz): (col << 9) − 0x3F00, the
   * centre, off the pig's own (0x4732B0..0x4732D4). */
  const centre = (dx: number, dz: number): { x: number; z: number } => ({
    x: here.x + dx * TILE_STEP,
    z: here.z + dz * TILE_STEP
  })
  let found = false
  let nearest = Infinity
  let target = centre(0, 0)
  for (const [dx, dz] of RAYS) {
    let offset: readonly [number, number] = [col, row]
    for (let step = 1; step <= RAY_TILES; step++) {
      const c = col + dx * step
      const r = row + dz * step
      if (c < 0 || c > 0x3f || r < 0 || r > 0x3f) break
      if (!inTheBox(c) || !inTheBox(r)) continue
      const at = centre(dx * step, dz * step)
      const tile = query.tileAddress(at.x, at.z)
      if (tile === null) break
      if ((tile.type & TILE_WALL) !== 0 && !training) break
      if ((tile.type & TILE_WATER) !== 0 && WATER_TYPES.has(tile.type & 0x1f)) continue
      if (!accepts(at.x, at.z)) continue
      offset = [dx * step, dz * step]
      found = true
      break
    }
    const away = offset[0] * offset[0] + offset[1] * offset[1]
    if (away < nearest) {
      nearest = away
      target = centre(offset[0], offset[1])
    }
  }
  return found ? target : null
}

/** One pig outside the box. */
interface Out {
  /** `[pig+0x1A8]`, as time. */
  seconds: number
  /** Its health last step: any damage at all zeroes the counter (0x467BF4). */
  health: number
  /** State 2, or null while it stands. */
  walk: Walk | null
}

/** State 2. */
interface Walk {
  /** `[pig+0x306]`, `[pig+0x30A]`. */
  target: { x: number; z: number }
  /** `[pig+0x1BC]`: facing it, and walking. */
  moving: boolean
  loco: LocomotionState
}

export interface WalkHome {
  /**
   * One step, over every pig on the map, in every mode.
   *
   * `acting` is the pig whose turn it is, `walkAway` is mode 13, the only mode that
   * pig goes home in (0x46CE8D..0x46CE9F), and `aloft` is whether it is in the air.
   * `fall` takes the state of an acting pig that has walked off an edge: its flight
   * is the battle's, where everybody else's goes to the tumbles.
   */
  update(
    delta: number,
    where: {
      acting: Pig | null
      walkAway: boolean
      aloft: boolean
      fall: (loco: LocomotionState) => void
    }
  ): void
  /** A blow landed on this pig: the walk is over and the wait starts again
   * (0x467C47..0x467C50, 0x467BF4). */
  struck(pig: Pig['id']): void
  /** Whether this pig is on its way home, which nothing else may dress or move. */
  walking(pig: Pig): boolean
  /**
   * How many pigs the turn's end is waiting to see home — `[0x537FC0]`.
   *
   * The acting pig counts only in mode 13. In the exe a blow on it IS mode 13
   * (0x467C6B); this engine cashes that on the quiet after the blow, and the quiet
   * cannot wait for a walk that only the beat after it can start.
   */
  waiting(): number
}

export function createWalkHome(world: {
  pigs: () => Pig[]
  query: TerrainQuery
  /** The map's objects: what a pig cannot walk through, and a target must be clear of. */
  obstacles: Obstruction
  training: boolean
  /** A pig inside a mount is riding, states 3 and 4 (0x46CE70): not out at all. */
  riding: (pig: Pig) => boolean
  tumbles: Pick<Tumbles, 'has' | 'aloft' | 'adopt'>
  /** Put a clip on a pig. */
  wear: (pig: Pig, clip: number) => void
}): WalkHome {
  const { query } = world
  const out = new Map<Pig['id'], Out>()
  let waited = 0

  const others = (pig: Pig): { x: number; y: number; z: number }[] =>
    world.pigs()
      .filter((one) => one !== pig && !isDead(one) && !one.gone)
      .map((one) => ({ ...one.position }))

  /** The stand a pig is left in, the same pick as everybody else's
   * (lib/game/battle/dress.ts). */
  const stand = (pig: Pig): void => {
    world.wear(pig, woundBand(pig.health) === 2 ? ANIM.WOUNDED : ANIM.IDLE)
  }

  /** `#32`'s stand-in: see the top of this file. */
  const putOnTheLine = (pig: Pig): void => {
    const { x, z } = clampToWorld(pig.position.x, pig.position.z)
    pig.position = { x, y: restingY(query, x, z), z }
    out.delete(pig.id)
    stand(pig)
  }

  /** The search: `accepts` is 0x478B80, a pig's body clear of the map's objects and
   * every other pig; the landscape it may touch. */
  const setOff = (pig: Pig, record: Out): void => {
    const clear = withPigs(world.obstacles, others(pig))
    const target = homeFrom(
      query,
      pig.position.x,
      pig.position.z,
      (x, z) => !clear.blocks(x, z, query.height(x, z), 0),
      world.training
    )
    if (target === null) {
      putOnTheLine(pig)
      return
    }
    const loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading, {
      y: pig.position.y,
      obstruction: world.obstacles
    })
    loco.heldAtLimit = false
    loco.goingHome = true
    record.walk = { target, moving: false, loco }
  }

  /** The walk over: the old state back (0x46E0D4). If it is still outside, the
   * counter is still over 0x32 and the next step searches again. */
  const stopWalking = (pig: Pig, record: Out): void => {
    record.walk = null
    stand(pig)
  }

  /** One step of the pig's own legs, and what became of it. */
  const stride = (
    pig: Pig,
    record: Out,
    walk: Walk,
    intent: Intent,
    delta: number,
    fall: (loco: LocomotionState) => void
  ): void => {
    const { loco } = walk
    loco.x = pig.position.x
    loco.y = pig.position.y
    loco.z = pig.position.z
    loco.wounded = woundBand(pig.health)
    const inTheWay = withPigs(world.obstacles, others(pig), { ...pig.position })
    updateLocomotion(loco, query, intent, delta, inTheWay)
    const stopped = intent.walk !== 0 && loco.x === pig.position.x && loco.z === pig.position.z
    pig.position = { x: loco.x, y: loco.y, z: loco.z }
    pig.heading = loco.heading
    if (loco.airborne !== null) {
      // Ground falling away starts a fall (`TryMove` returning 2, 0x46B969); state 5
      // zeroes the counter, so it stands the fifty frames again where it lands.
      loco.goingHome = false
      record.walk = null
      record.seconds = 0
      fall(loco)
      return
    }
    world.wear(pig, loco.clip)
    // An object it can neither step up nor sidestep ends the walk (`TryMove` returning
    // 1, 0x46B8CC..0x46B8DB), and the counter, still over 0x32, searches again next frame.
    if (stopped) stopWalking(pig, record)
  }

  /** State 2, one step: 0x46DD22..0x46E10A. */
  const walkOn = (
    pig: Pig,
    record: Out,
    walk: Walk,
    delta: number,
    fall: (loco: LocomotionState) => void
  ): void => {
    const toX = walk.target.x - pig.position.x
    const toZ = walk.target.z - pig.position.z
    walk.loco.heading = pig.heading
    if (Math.abs(toX) < ARRIVED && Math.abs(toZ) < ARRIVED) {
      // One more `Pig::Walk(0x40)` and out (0x46DDB1).
      stride(pig, record, walk, { walk: 1, turn: 0, jump: false }, delta, fall)
      if (record.walk !== null) stopWalking(pig, record)
      return
    }
    const bearing = Math.atan2(toX, toZ)
    if (!walk.moving) {
      let off = bearing - pig.heading
      while (off > Math.PI) off -= 2 * Math.PI
      while (off < -Math.PI) off += 2 * Math.PI
      if (Math.abs(off) > FACING_HOME) {
        // `Pig::Turn(±0x20)`, and that is the frame (0x46DEC8). The turn rate is the
        // driven pig's, the same routine's (`TURN_SPEED`).
        stride(pig, record, walk, { walk: 0, turn: Math.sign(off), jump: false }, delta, fall)
        return
      }
      walk.moving = true
      return
    }
    const { x, z } = pig.position
    // Dry, free ground inside the box lets it out, on the first step that lands
    // there (0x46DFBC..0x46E0CD). It walks on to the tile's centre only if that
    // ground is water or wall. `isWater` is the remake's one water verdict, where
    // the exe's reads the type (4 or 11) and 0x4A6FA0.
    if (!query.isWater(x, z) && query.walkable(x, z) && clearOfTheLine(x, z)) {
      stopWalking(pig, record)
      return
    }
    // The yaw set to the bearing, and `Pig::Walk(0x40)` (0x46E0F0..0x46E10A).
    walk.loco.heading = bearing
    stride(pig, record, walk, { walk: 1, turn: 0, jump: false }, delta, fall)
  }

  return {
    update(delta, { acting, walkAway, aloft, fall: actingFalls }) {
      waited = 0
      for (const pig of world.pigs()) {
        const fall =
          pig === acting ? actingFalls : (loco: LocomotionState): void => world.tumbles.adopt(pig, loco)
        const inTheAir = pig === acting ? aloft : world.tumbles.aloft(pig)
        // Dead, riding, off the field or in the air, the counter is at zero
        // (0x46CE66..0x46CEAA), and a walk the physics has taken back is over
        // (0x46DCEB).
        if (isDead(pig) || pig.gone || world.riding(pig) || inTheAir) {
          out.delete(pig.id)
          continue
        }
        const held = out.get(pig.id)
        const { x, y, z } = pig.position
        // Inside the box the counter is zero and nothing here happens — but a walk
        // already under way runs to its own end (0x46CE26, then the state switch).
        if (insideTheBox(x, z) && (held === undefined || held.walk === null)) {
          out.delete(pig.id)
          continue
        }
        const record: Out = held ?? { seconds: 0, health: pig.health, walk: null }
        out.set(pig.id, record)
        if (pig.health < record.health) record.seconds = 0
        record.health = pig.health
        record.seconds = insideTheBox(x, z) ? 0 : record.seconds + delta
        // A get-up is the flight's last act, and the tumbles still own the body.
        if (world.tumbles.has(pig)) continue
        // Standing in the water out there the bite restarts the counter every frame
        // (0x467BF4), and it is the water's own search that gets it out, in the beat
        // at the end of the turn (lib/game/walkAway.ts). That beat waits for it itself.
        if (record.walk === null && inWater(query, x, z, y)) {
          record.seconds = 0
          continue
        }
        if (pig !== acting || walkAway) waited++
        if (record.seconds > OUT_TOO_LONG) {
          putOnTheLine(pig)
          continue
        }
        if (
          record.walk === null &&
          record.seconds > STAND_OUTSIDE &&
          (pig !== acting || walkAway)
        ) {
          setOff(pig, record)
        }
        if (record.walk !== null) walkOn(pig, record, record.walk, delta, fall)
      }
    },
    struck(id) {
      const record = out.get(id)
      if (record === undefined) return
      record.seconds = 0
      if (record.walk === null) return
      const pig = world.pigs().find((one) => one.id === id)
      if (pig === undefined) {
        console.warn(`a struck pig ${id} is not on the map`)
        return
      }
      record.walk = null
      if (!isDead(pig)) stand(pig)
    },
    walking(pig) {
      const record = out.get(pig.id)
      return record !== undefined && record.walk !== null
    },
    waiting: () => waited
  }
}
