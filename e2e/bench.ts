// THE BENCH — a skill fired at a dummy through the real attack, and what came of
// it: the proving ground's automated half (docs/todo/proving-ground.md).
//
// The real map and the real engine with nothing else up, built the way the app
// builds them (e2e/000/proving-ground-headless.spec.ts): `loadProvingGround` →
// `musterGame` → `createEngine`. The skill goes into the hand of the player's own
// pig and the fire key goes down through `battle.setFiring`, which is the door
// the keys use (input/battleInput.ts), so the whole ladder, the fuse and the
// muzzle off a posed bone are the game's own. What is read is the bus, the same
// events the presentation reads.
//
// `openBench` and its verbs are for every bench; `fireAtDummy` is the guns' report
// on top of them, and a bench's own report otherwise lives in its spec.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect } from '@playwright/test'

import { GAME_DIR } from './launch'
import { loadClips, loadGameText, loadModel } from '../src/main/assets'
import { loadProvingGround } from '../src/main/provingGround'
import { FRAME_SECONDS, fromExeSpeed } from '../src/lib/game/ballistics'
import { bodyExtent } from '../src/lib/game/body'
import { STEP_SECONDS, buildQuery, createEngine } from '../src/lib/game/engine'
import type { Engine } from '../src/lib/game/engine'
import { createBus } from '../src/lib/game/events'
import type { BattleEvent } from '../src/lib/game/events'
import type { Game, Pig } from '../src/lib/game/game'
import { give } from '../src/lib/game/inventory'
import { restingY } from '../src/lib/game/locomotion'
import { fielded, mapSquads, musterGame } from '../src/lib/game/muster'
import { PROVING_GROUND } from '../src/lib/game/provingGround'
import { nations } from '../src/lib/game/teams'

/** The default dress (three/soldiers.ts); the engine wants the measurement. */
const GRUNT = 'pcgru_me'
/** A sequence is given this many engine steps before the bench calls it stuck:
 * a whole minute, which the longest flight on the bench never comes near. */
const STEP_CAP = 60 * 60
/** Rounds in the hand: the bench is about what one press does, never about
 * running out. */
const ROUNDS_IN_HAND = 9
/** Where a dummy goes to be out of the line of fire: beside the strip, and short
 * of the pond (lib/game/provingTerrain.ts). */
export const OFF_THE_LINE_Z = -1500

/** A skill, as a pig holds it. */
type Skill = NonNullable<Pig['holding']>

export const benchInstalled = (): boolean => existsSync(path.join(GAME_DIR, 'warhogs_.exe'))

export interface Bench {
  engine: Engine
  game: Game
  /** Everything the bus said since the battle was built. */
  heard: BattleEvent[]
  /** The player's own pig, at the head of the strip, its turn running. */
  pig: Pig
  /** The second side, nearest first (`DUMMIES_AT`, lib/game/provingGround.ts). */
  dummies: Pig[]
}

/** What does not change from one battle to the next: read off the install once a
 * worker, since it is the battle that has to be fresh each time. */
const load = async () => {
  const chars = path.join(GAME_DIR, 'Chars')
  const map = await loadProvingGround((relPath) => path.join(GAME_DIR, relPath))
  return {
    map,
    clips: await loadClips(chars),
    teams: nations(await loadGameText(GAME_DIR, 'fetext')),
    art: await loadModel(path.join(chars, 'british.mad'), GRUNT)
  }
}
let loaded: ReturnType<typeof load> | null = null

/** A fresh battle on the proving ground, on the player's turn, off a fixed seed. */
export async function openBench(): Promise<Bench> {
  loaded ??= load()
  const { map, clips, teams, art } = await loaded
  const { blocks, textures } = map.terrain
  const objects = fielded(map.objects.objects)
  const query = buildQuery(blocks, textures)
  const game = musterGame({
    squads: mapSquads(objects, teams, []),
    map: PROVING_GROUND,
    ground: query,
    bodyOf: () => bodyExtent(art.model.positions)
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const engine = createEngine({
    world: {
      game,
      blocks,
      terrainArt: textures,
      objects,
      clips,
      skeleton: art.skeleton,
      map: PROVING_GROUND,
      parachutes: true
    },
    query,
    seed: 7,
    onChanged: () => {},
    bus,
    // The app's own sides (three/battle.ts): everyone but side 0 is the machine's.
    computer: (side) => side > 0
  })
  // The turn's first step puts the first card up, and the card is what is cut.
  engine.update(STEP_SECONDS)
  game.cutTurnStart()
  return { engine, game, heard, pig: game.players[0].pigs[0], dummies: game.players[1].pigs }
}

/** Step until `done`; a sequence that never gets there fails here, with `what`. */
export function stepUntil({ engine }: Bench, done: () => boolean, what: string, each: () => void = () => {}): void {
  let steps = 0
  while (!done()) {
    expect(steps++, what).toBeLessThan(STEP_CAP)
    engine.update(STEP_SECONDS)
    each()
  }
}

/** The skill in the pig's hand and the weapon up: the press is not answered while
 * it is still being readied. */
export function inHand(bench: Bench, skill: Skill): void {
  const { engine, pig } = bench
  give(pig.carrying, skill, ROUNDS_IN_HAND)
  pig.holding = skill
  engine.update(STEP_SECONDS)
  stepUntil(bench, () => engine.battle.view().readying <= 0, 'the weapon comes up')
}

/** One press of the fire key and its release, the way the keys make it. */
export function pressFire({ engine }: Bench): void {
  engine.battle.setFiring(true, true)
  engine.update(STEP_SECONDS)
  engine.battle.setFiring(false, false)
}

/** Stand a dummy at (x, z) on the ground there. */
export function standAt({ engine }: Bench, dummy: Pig, x: number, z: number): void {
  dummy.position = { x, y: restingY(engine.query, x, z), z }
}

const firedAny = (heard: BattleEvent[]): boolean => heard.some((event) => event.kind === 'fired')

/** A straight line in the world: where a press's rounds left from and the way
 * they went, as a unit vector. */
interface Line {
  x: number
  y: number
  z: number
  ux: number
  uz: number
}

/** A battle with no dummy in the way: what one press looses and how far it goes. */
async function flightOf(skill: Skill): Promise<{ rounds: number; reach: number; line: Line }> {
  const bench = await openBench()
  const { engine, heard, dummies } = bench
  for (const dummy of dummies) standAt(bench, dummy, dummy.position.x, OFF_THE_LINE_Z)
  inHand(bench, skill)
  pressFire(bench)

  let line: Line | null = null
  stepUntil(
    bench,
    () => firedAny(heard) && engine.shots.live().length === 0,
    `skill ${skill} goes off and its rounds come down`,
    () => {
      const live = engine.shots.live()
      if (line !== null || live.length === 0) return
      // Back along its own flight to where it left: `age` is in the exe's frames.
      const [first] = live
      const back = first.age * FRAME_SECONDS
      // A fan's jitter goes either side, so its middle is the line of the sights.
      const vx = live.reduce((sum, shot) => sum + shot.vx, 0)
      const vz = live.reduce((sum, shot) => sum + shot.vz, 0)
      const flat = Math.hypot(vx, vz)
      line = {
        x: first.x - first.vx * back,
        y: first.y - first.vy * back,
        z: first.z - first.vz * back,
        ux: vx / flat,
        uz: vz / flat
      }
    }
  )
  if (line === null) throw new Error(`skill ${skill} loosed nothing that flew`)
  const { x, y, z }: Line = line
  const landed = heard.flatMap((event) => (event.kind === 'shotLanded' ? [event] : []))
  // The end of its reach is the round that ended in thin air: a fan's low pellet
  // can meet the ground first.
  const spent = landed.filter((event) => event.hit === 'air')
  expect(spent.length, `a round of skill ${skill} flew its whole reach`).toBeGreaterThan(0)
  const reach = Math.max(...spent.map(({ at }) => Math.hypot(at.x - x, at.y - y, at.z - z)))
  return { rounds: landed.length, reach, line }
}

/** A battle with the nearest dummy on that line, at its own distance down the
 * strip, and the rest out of the way: what the press did to it. */
async function blowOf(skill: Skill, line: Line): Promise<{ damage: number[]; knock: number[]; lost: number }> {
  const bench = await openBench()
  const { engine, heard, dummies } = bench
  const [target, ...others] = dummies
  for (const dummy of others) standAt(bench, dummy, dummy.position.x, OFF_THE_LINE_Z)
  const along = (target.position.x - line.x) * line.ux + (target.position.z - line.z) * line.uz
  standAt(bench, target, line.x + line.ux * along, line.z + line.uz * along)
  const healthy = target.health
  inHand(bench, skill)
  pressFire(bench)
  stepUntil(
    bench,
    () => firedAny(heard) && engine.shots.live().length === 0,
    `skill ${skill} goes off and its rounds come down`
  )
  return {
    damage: heard.flatMap((event) =>
      event.kind === 'damaged' && event.pig === target.id ? [event.amount] : []
    ),
    knock: heard.flatMap((event) =>
      event.kind === 'flung' && event.pig === target.id
        ? [Math.hypot(event.vx, event.vy, event.vz) / fromExeSpeed(1)]
        : []
    ),
    lost: healthy - target.health
  }
}

/** What one press of a gun came to. */
export interface GunReport {
  /** How many rounds that one press loosed. */
  rounds: number
  /** How far a round flies before it expires, in world units: an exe unit a frame
   * is one of these a frame, so this is the exe's speed × its life. */
  reach: number
  /** Each round's points off the dummy, in the order they landed, a round that
   * took none leaving no entry. */
  damage: number[]
  /** The points the dummy is down at the end: `damage` as its health has it. */
  lost: number
  /** The speed of each throw of the dummy, in exe units a frame. */
  knock: number[]
}

/** Fire this gun down the strip at a dummy, once to see its reach and once at the
 * dummy. Two battles on one seed, so both presses are the same press. */
export async function fireAtDummy(skill: Skill): Promise<GunReport> {
  const { rounds, reach, line } = await flightOf(skill)
  return { rounds, reach, ...(await blowOf(skill, line)) }
}
