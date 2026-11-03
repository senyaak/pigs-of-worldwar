// The battle's CORE: the parts it was built from, the rigs every phase of the
// frame shares — the sights, the fire button, the machine's hands and its
// brain — and the battle's own state (`state.ts`). Every phase in this folder
// takes it whole and reads what it needs.

import { createActuator } from '../actuator'
import type { Actuator } from '../actuator'
import { createAttack } from '../attack'
import type { Attack } from '../attack'
import { barrelMuzzle } from '../barrel'
import type { BattleParts } from '../battle'
import { localBrain } from '../brainPort'
import type { BrainPort } from '../brainPort'
import { drowns } from '../drowning'
import type { Emit } from '../events'
import type { Pig } from '../game'
import { createGruntBrain } from '../grunt'
import { mountArmed } from '../mounts'
import { createWaterMemo } from '../pathfind'
import { DEFAULT_SEED, seeded } from '../random'
import { createSights } from '../sights'
import type { Sights } from '../sights'
import { createState } from './state'
import type { BattleState } from './state'

export interface BattleCore extends BattleParts {
  /** The bus's emitter (`BattleParts.bus`). */
  emit: Emit
  /** Which sides the machine plays — `BattleParts.computer`, nobody's when left out. */
  computer: (side: number) => boolean
  /** Whether the machine has THIS turn, latched at its start (`state.machineTurn`). */
  computerTurn: () => boolean
  /** Every pig on the map. */
  everyone: () => Pig[]
  /** The walk and the turn the keys, or the machine's hands, last asked for. */
  intent: { walk: number; turn: number }
  sights: Sights
  attack: Attack
  actuator: Actuator
  brain: BrainPort
  state: BattleState
}

export function createCore(parts: BattleParts): BattleCore {
  const {
    game,
    query,
    scenery,
    indoors,
    anim,
    shots,
    grenades,
    mines,
    swings,
    heals,
    pockets,
    hides,
    sacrifice
  } = parts
  const emit = parts.bus.emit

  /** Which sides the machine plays, and the brain that plays them — the
   * GRUNT: nearest foe, close to range, do not shoot through a friend, fire
   * (lib/game/grunt.ts; the seat's shape is lib/game/ai.ts). */
  const computer = parts.computer ?? (() => false)
  const state = createState(game, query, computer)
  const computerTurn = (): boolean => state.machineTurn

  /** Every pig on the map, as bodies to walk into. */
  const everyone = (): Pig[] => game.players.flatMap((player) => player.pigs)

  const intent = { walk: 0, turn: 0 }
  /** Where the weapon points, the tremor that rides it and the sniper's zoom —
   * one thing, because they only ever move together (lib/game/sights.ts). */
  const sights = createSights(parts.random)
  /** The fire button and everything one press sets going: the gauge, the fuse
   * and which weapon answers (lib/game/attack.ts). */
  const attack = createAttack({
    shots,
    grenades,
    swings,
    heals,
    pockets,
    hides,
    sacrifice,
    mines,
    sights,
    // An EMPLACED gun is the BUILDING's, so its round is born outside the box
    // the pig is sitting in rather than at the hand bone (lib/game/barrel.ts).
    mount: (pig) => {
      const housing = indoors.inside(pig)
      if (!housing || !mountArmed(housing.mount, housing.kind)) return null
      return barrelMuzzle(housing.box, pig.heading)
    },
    anim,
    clips: parts.clips,
    bark: () =>
      emit({
        kind: 'bark',
        player: game.players.indexOf(game.currentPlayer),
        voice: game.currentPig.voice
      })
  })
  /**
   * The FIRE button's one write, shared by the player's verb (`setFiring`)
   * and the machine's rig below so both take the same refusal.
   *
   * **NOTHING IS FIRED FROM THE AIR.** Play: "можно во время прыжка начать
   * заряжать оружие — баг." `Pig::MayAct` refuses it outright — `[pig+0x2EC]`
   * is the pig's own mode and 5 is being airborne, the same value
   * `UpdateMovement` returns on so that a flying pig is neither walked nor
   * turned (0x467a28, 0x46b205). The whole press is dropped rather than the
   * hold alone, or a gauge already filling would loose on the way up.
   */
  const applyFiring = (held: boolean, pressed: boolean): void => {
    if (state.loco.airborne !== null) {
      attack.swallow()
      attack.hold(false)
      return
    }
    // The PRESS is what a gun and a blade answer to; the gauge wants the
    // whole hold, and the frame it ends.
    if (pressed) attack.press()
    attack.hold(held)
  }
  /**
   * Whether a pig HERE would be IN the water — the tile's word, overruled by
   * a DECK it could stand on. The path grid already walks bridges
   * (lib/game/pathgrid.ts asks `standOn` before the water probes), and the
   * machine's price list and hands must not veto what its own legs can do:
   * a foe mid-bridge had every melee mark round it discarded as "wet" and
   * the last pig passed its turn on the spot (play, 2026-08-28). The reach
   * is unbounded because the question is "is there ANYTHING standable
   * here", not "can these feet climb to it" — the flood prices the climb.
   */
  const swimAt = (x: number, z: number): boolean => {
    if (!query.isWater(x, z)) return false
    return (
      scenery.obstacles.standOn(x, z, query.surface(x, z), Number.POSITIVE_INFINITY) === null
    )
  }
  /** The machine's HANDS (lib/game/actuator.ts): a brain's order becomes the
   * same inputs the player's keys write, and nothing else — every read on
   * this rig is something the screen shows anyway. */
  const actuator = createActuator({
    at: () => ({
      x: game.currentPig.position.x,
      z: game.currentPig.position.z,
      heading: game.currentPig.heading
    }),
    wet: swimAt,
    swims: () => !drowns(game.currentPig.pigClass),
    aim: () => sights.angle(),
    gauge: () => attack.gauge(game.currentPig.holding),
    intent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    aimStep: sights.push,
    fire: applyFiring,
    hold(skill) {
      game.currentPig.holding = skill
    }
  })
  /** The battle's one water memo for the machine's routes — water never
   * changes inside a battle (lib/game/pathfind.ts, `WaterMemo`). */
  const waterMemo = createWaterMemo()
  /**
   * **THE BRAIN'S SEAT**, and it is a PORT now rather than a call
   * (lib/game/brainPort.ts).
   *
   * Left out by the caller, one is seated here that thinks on the step it is
   * asked — which is exactly what the engine did before the brain got a
   * process of its own, so every headless run reads the same. The app hands
   * in a port to that process instead.
   */
  const brain: BrainPort =
    parts.brain ??
    localBrain(
      createGruntBrain(),
      { query, obstacles: scenery.obstacles, water: waterMemo },
      seeded(parts.brainSeed ?? DEFAULT_SEED)
    )

  return {
    ...parts,
    emit,
    computer,
    computerTurn,
    everyone,
    intent,
    sights,
    attack,
    actuator,
    brain,
    state
  }
}
