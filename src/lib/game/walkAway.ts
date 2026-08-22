// The beat at the END of a turn — and the swim that happens in it.
//
// A turn does not hand over the moment the clock stops. `Game::EndTurn`
// (0x494430) takes the camera off the pig, plays a sound, remembers the mode it
// came from and goes to **mode 13**, whose name in the exe's own table
// (0x4d72b0, indexed by `[game+0x510]`) is **WALK AWAY MODE** — it even prints
// "RUN AWAY!!! %d" with a countdown while it runs (0x4d8bac, the branch at
// 0x491879). The turn clock does not tick in it (0x4900ff pauses modes
// 0x0B..0x10) and nobody is driving.
//
// What the mode is FOR is the pig that is in the water. The water block of the
// per-pig ground update calls `Pig::MakeForShore` (0x472DD0) for every pig that
// has been in it more than five frames — but for the ACTING pig only when the
// mode is 13 (0x47006d..0x470077). So the pig you were driving heads for dry
// land exactly when you stop driving it, which is what play remembers:
// "когда кончается ход — управление отключается и все кто в воде плывут к берегу
// ближайшим путём."
//
// `Pig::MakeForShore` itself, instruction for instruction:
//
// ```
// 472e44  eight (dx, dz) pairs off the table at 0x4D1010 — the compass
// 472e8b  each ray walked a TILE at a time, up to 0x10 of them (0x4730a3)
// 472ea9  off the map            -> that ray is done
// 472ec9  outside tiles 8..55    -> skip the tile, keep going
// 472f3e  a WALL tile            -> that ray is done (0x473092)
// 472f6f  type 4 or 11 with the water bit -> keep going, it is still water
// 473007  otherwise 0x478B80 validates it; on success the offset is kept and
//         the ray ends (0x473031)
// 47321f  the eight candidates are compared by dx*dx + dz*dz and the SMALLEST
//         wins ("Distance=%d", "Direction = %d", 0x473250)
// 4732c4  its tile centre goes to [pig+0x306], and the pig enters STATE 2 —
//         walk to a target — keeping its old state at [pig+0x2F0]
// 4731f5  nothing found at all -> 0x4680E0(2 on a type-11 tile, else 0): the
//         pig DROWNS, and the turn is handed on if it was the acting one
// ```
//
// Pure: pigs, a terrain query and a clock in, positions out.

import { FRAME_SECONDS } from './ballistics'
import { ANIM, SWIM_SPEED, TURN_SPEED, inWater, restingY } from './locomotion'
import { isDead } from './health'
import { WORLD_LIMIT, clampToWorld } from './terrain'
import { TILE_STEP } from '../formats/pmg'
import type { TerrainQuery } from './terrain'
import type { Pig } from './game'
import type { Emit } from './events'

/** The eight compass steps, in TILES — the pair table at 0x4D1010 read in
 * order, `(dx at +0, dz at +4)` every 8 bytes. */
export const RAYS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1]
]

/** How far along one ray the search looks (`cmp eax,10h`, 0x4730a3). */
export const RAY_TILES = 16

/**
 * How long a pig is in the water before it makes for the shore: more than five
 * frames of `[pig+0x384]` (`cmp dword ptr [esi+384h],5`, 0x47004a).
 */
export const SOAK_BEFORE_SHORE = 5 * FRAME_SECONDS

/**
 * The quiet the beat wants before the turn is handed on.
 *
 * The exe's mode 13 runs the same wait every other beat does — 0x495230, whose
 * tail is the fifteen QUIET frames of `0x415420` (turns/aftermath.md) — and its
 * own countdown `[game+0x4F0]` is zero for everything but the TNT-likes, whose
 * per-skill record carries 400 hundredths (0x4D7318, four seconds of ordinary
 * play instead). Fifteen frames is one second at the rate the exe ran, and a
 * second is exactly what play asked for: "конец хода наступает мгновенно — там
 * хотя бы секунду надо задержки между ходами."
 */
export const WALK_AWAY_QUIET = 1

/**
 * How nearly the pig has to be facing its shore before it swims at all: one of
 * the exe's OWN turning steps, 32/4096 of a circle — 2.8°.
 *
 * The rule behind it is play's — turn, then go — and the tolerance has to be at
 * least one step or the pig would stall a frame short of lined up.
 */
export const FACING = TURN_SPEED * FRAME_SECONDS

/**
 * The nearest dry land, or null if there is none within reach.
 *
 * Eight rays, a tile at a time: a wall ends a ray, water carries it on, and the
 * first dry walkable step is that ray's candidate. The nearest of the eight
 * wins, by squared distance, exactly as 0x47321f picks it.
 *
 * Two departures from the read, both deliberate. The exe aims at the tile's
 * CENTRE and this aims at the pig's own offset within that tile — the map grid's
 * origin is the query's business, and the point tested is then the point swum
 * to, so arriving there IS being out of the water. And dry is asked of
 * `isWater`, the per-texel verdict the rest of the engine uses, where the exe's
 * candidate test reads the tile's water FLAG and its masked type.
 */
export function shoreFrom(query: TerrainQuery, x: number, z: number): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let nearest = Infinity
  for (const [dx, dz] of RAYS) {
    for (let step = 1; step <= RAY_TILES; step++) {
      const at = { x: x + dx * step * TILE_STEP, z: z + dz * step * TILE_STEP }
      if (Math.abs(at.x) > WORLD_LIMIT || Math.abs(at.z) > WORLD_LIMIT) break
      // A wall ends this ray; water is what the pig is already in, so it
      // carries on through it.
      if (!query.walkable(at.x, at.z)) break
      if (query.isWater(at.x, at.z)) continue
      const away = step * step
      if (away < nearest) {
        nearest = away
        best = at
      }
      break
    }
  }
  return best
}

export interface WalkAway {
  /**
   * One step of the beat. True when it is over and the turn may be handed on.
   *
   * `busy` is whatever else the battle is still waiting for — the same list the
   * beat after a blow waits on (lib/game/aftermath.ts).
   */
  update(delta: number, busy: boolean): boolean
  /** How many pigs were still in the water as of the last step — what the beat
   * is holding for, and what a spec can read. */
  swimming(): number
}

/**
 * Begin the beat. `soaked` is how long each pig has been in the water — the
 * exe's `[pig+0x384]`, which the drowning already counts (lib/game/drowning.ts).
 */
export function beginWalkAway(world: {
  pigs: () => Pig[]
  query: TerrainQuery
  soaked: (pig: Pig) => number
  /** Put a clip on a pig — the swim, and standing about once it is out. */
  wear: (pig: Pig, clip: number) => void
  emit: Emit
}): WalkAway {
  /** Where each swimmer is going. A `null` is a pig that has already drowned
   * for want of anywhere to go, so the search is not run twice for it. */
  const going = new Map<number, { x: number; z: number } | null>()
  let quiet = WALK_AWAY_QUIET
  /** How many were in the water on the last step. */
  let wet = 0

  /** Nowhere to swim to: the exe kills the pig outright (0x4731f5) rather than
   * damaging it. Which of the dying clips its kind argument picks is not read,
   * so this takes the ordinary one the rest of the engine plays. */
  const drown = (pig: Pig): void => {
    pig.health = 0
    world.emit({ kind: 'killed', pig: pig.id, drowned: true })
  }

  const swim = (pig: Pig, target: { x: number; z: number }, delta: number): void => {
    const want = Math.atan2(target.x - pig.position.x, target.z - pig.position.z)
    // The SHORTER way round, always: the difference is brought into ±π before
    // anything turns by it.
    let turn = want - pig.heading
    while (turn > Math.PI) turn -= 2 * Math.PI
    while (turn < -Math.PI) turn += 2 * Math.PI
    const swept = Math.min(Math.abs(turn), TURN_SPEED * delta) * Math.sign(turn)
    pig.heading += swept
    world.wear(pig, ANIM.SWIM)
    // **TURN FIRST, THEN GO.** Play: "выплывает не по кратчайшему пути из-за
    // поворота — надо выбирать куда поворачиваться чтобы было короче, то есть
    // сначала поворот а потом вперёд, не одновременно плыть и поворачиваться."
    // Doing both at once curves the path, and a curve is longer than the
    // straight line the shore search measured — the search compares candidates
    // by dx²+dz², so the pig has to travel the distance it was picked for.
    if (Math.abs(turn) > FACING) return
    const stride = SWIM_SPEED * delta
    const to = clampToWorld(
      pig.position.x + Math.sin(pig.heading) * stride,
      pig.position.z + Math.cos(pig.heading) * stride
    )
    pig.position = { x: to.x, y: restingY(world.query, to.x, to.z), z: to.z }
  }

  return {
    update(delta, busy) {
      wet = 0
      for (const pig of world.pigs()) {
        if (isDead(pig)) {
          going.delete(pig.id)
          continue
        }
        // A pig on a BRIDGE is not in the water it crosses, whatever the tile
        // under it says (`inWater`). Without that test this beat took a pig
        // standing on CAMP's deck for a swimmer and dropped it to the waterline
        // — play: "кончился ход, я провалился на мосту в текстуры".
        if (!inWater(world.query, pig.position.x, pig.position.z, pig.position.y)) {
          // Out of it: the target is spent, and the pig stands about like every
          // other one the battle is not driving.
          if (going.delete(pig.id)) world.wear(pig, ANIM.IDLE)
          continue
        }
        wet++
        // The exe waits out the same five frames before it looks for a shore,
        // whether the pig fell in a moment ago or has been in all turn.
        if (world.soaked(pig) <= SOAK_BEFORE_SHORE) continue
        if (!going.has(pig.id)) {
          const shore = shoreFrom(world.query, pig.position.x, pig.position.z)
          going.set(pig.id, shore)
          if (shore === null) {
            drown(pig)
            continue
          }
        }
        const target = going.get(pig.id) ?? null
        if (target !== null) swim(pig, target, delta)
      }
      if (busy || wet > 0) {
        quiet = WALK_AWAY_QUIET
        return false
      }
      quiet -= delta
      return quiet <= 0
    },
    swimming: () => wet
  }
}
