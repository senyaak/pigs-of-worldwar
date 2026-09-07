// THE BRAIN'S GROUND — the five questions a brain asks, answered against one
// copy of the map.
//
// This file exists because the brain does not have to be in the tick any
// more. `AiFacts` (lib/game/ai.ts) is data and crosses a pipe; `AiOracles`
// is four terrain lookups and a random stream, and the searches behind them
// ask the map tens of thousands of times per plan — which is a model to keep,
// never a message to send. So each side keeps its own model and builds its
// oracles HERE, from the same function, and they cannot drift apart: the
// engine's seat calls it (lib/game/battle.ts) and so does the brain process
// (src/brain/index.ts).
//
// Nothing in here decides anything. It is the world answering.
//
// Pure, game space, Y-DOWN — like the rest of lib/game.

import { flood, route } from './pathfind'
import type { RouteAsk, WaterMemo } from './pathgrid'
import type { TerrainQuery } from './terrain'
import type { ObstacleField } from './obstacles'
import type { AiFacts, AiOracles } from './ai'

/**
 * One battle's world model, as the searches need it.
 *
 * The obstacles are BOTH the walls and the walkways — a bridge deck is stood
 * on the way the walk stands on it — and the water memo is battle-long on
 * purpose: its thirteen texel probes a cell are what made a turn's first
 * decision a 130 ms hitch before it existed (lib/game/pathgrid.ts).
 */
export interface AiGround {
  query: TerrainQuery
  obstacles: ObstacleField
  water: WaterMemo
}

/**
 * Whether a pig HERE would be IN the water — the tile's word, overruled by a
 * DECK it could stand on.
 *
 * The path grid already walks bridges (lib/game/pathgrid.ts asks `standOn`
 * before the water probes), and the machine's price list and hands must not
 * veto what its own legs can do: a foe mid-bridge had every melee mark round
 * it discarded as "wet" and the last pig passed its turn on the spot (play,
 * 2026-08-28). The reach is unbounded because the question is "is there
 * ANYTHING standable here", not "can these feet climb to it" — the flood
 * prices the climb.
 */
export function swimAtOn(ground: AiGround, x: number, z: number): boolean {
  if (!ground.query.isWater(x, z)) return false
  return ground.obstacles.standOn(x, z, ground.query.surface(x, z), Number.POSITIVE_INFINITY) === null
}

/**
 * The five oracles for ONE decision, over `ground`, for the pig `facts` is
 * about.
 *
 * The ask is rebuilt per call rather than held, exactly as the seat used to
 * build it: `bodies` and the start move between one search and the next.
 *
 * **THE SQUAD IS IN THE ASK.** Play watched what leaving it out costs: "он не
 * обходит свина, а толкается в него". Only OUR OWN pigs, though — a foe is
 * what the walk is aimed AT, and a body you mean to reach cannot be a wall —
 * and the actuator's `blocked` still guards the difference between the plan
 * and the ground truth. `friends` IS that list: everybody alive on this side
 * bar the actor, which is what the seat filtered twice before.
 */
export function oraclesFor(ground: AiGround, facts: AiFacts, roll: () => number): AiOracles {
  const here = (): { x: number; z: number; y: number } => ({
    x: facts.acting.x,
    z: facts.acting.z,
    y: facts.acting.y
  })
  const ask = (): RouteAsk => ({
    ground: ground.query,
    obstruction: ground.obstacles,
    // The pig's CLASS (lib/game/drowning.ts): a swimmer's route may cross
    // water, priced at the swim's own slowness, where a grunt's never does.
    swims: facts.swims,
    water: ground.water,
    bodies: facts.friends.map((one) => ({ x: one.x, z: one.z }))
  })
  return {
    roll,
    route: (to) => route(ask(), here(), to),
    reach: (budget) => flood(ask(), here(), budget),
    // What a dry-run throw lands against: over water that is the SURFACE,
    // not the seabed under it — the engine douses a lob at the waterline
    // (lib/game/grenade.ts), and a dry run that flew on to the basin floor
    // once priced an 8700-unit "arc" off a clifftop and threw grenades into
    // the bay every turn for a simulated hour.
    groundAt: (x, z) =>
      ground.query.isWater(x, z) ? ground.query.surface(x, z) : ground.query.height(x, z),
    wet: (x, z) => swimAtOn(ground, x, z)
  }
}
