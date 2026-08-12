// What the battle ANNOUNCES, and the bus it announces on.
//
// The engine decides what happens; it does not know what any of it looks or
// sounds like. Every module of it — the bullets, the grenades, the blade, the
// crates, the descents, the frame itself — emits into one stream, and whoever
// is presenting the battle subscribes: the renderer for the art, the audio
// bank for the noise, and nothing stops a third listener (a replay log, a
// network mirror) from being added without any of them knowing.
//
// Before this, each module took its own object of callbacks and the SCENE
// filled them in — which meant the renderer was also where every sound in the
// game got played, and graphics and audio could not be separated at all.
//
// Positions are game space (Y-down).

import type { Point } from './pose'

/**
 * A pig, as it travels: its id and nothing else (lib/game/game.ts).
 *
 * Everything on this bus is DATA. It used to carry `Pig` and `Target` objects,
 * which is free in one process and impossible across a port — and the moment
 * one listener held a live object it could reach past what it was told and
 * change the battle.
 */
export type PigId = number

export type BattleEvent =
  // ——— weapons ———
  /** A gun went off: the report is per weapon. */
  | { kind: 'fired'; skill: number }
  /** A blade going through the air, before it reaches anything. */
  | { kind: 'whoosh' }
  /** …and it landed on a body: the weapon's own impact noise and its rings. */
  | { kind: 'struck'; skill: number; at: Point }
  /** Something took points here — the number that floats off it. */
  | { kind: 'damaged'; at: Point; amount: number }
  /** This pig has just gone down. */
  | { kind: 'killed'; pig: PigId }
  /** Something went off here, and WHICH effect id it spawns: a grenade and a
   * mine do not look alike (lib/game/blast.ts, `Charge.effect`). */
  | { kind: 'blasted'; at: Point; effect: number }
  /** This pig has JUMPED INTO a building, and stops being drawn from here
   * (lib/game/indoors.ts). */
  | { kind: 'wentIn'; pig: PigId; building: number }
  /** …and back out onto the spot it jumped from. */
  | { kind: 'cameOut'; pig: PigId; building: number }
  /** A pig has just found a MINE with its foot. The CLICK, not the bang — the
   * blast is four tenths of a second behind it and arrives as `blasted` like any
   * other (lib/game/mines.ts). */
  | { kind: 'mineTripped'; at: Point }
  /** …or met water: every water contact reports this first, and then which of
   * the two it was (`Projectile::OnHitLandscape`, 0x4377d0). */
  | { kind: 'splashed'; at: Point }
  | { kind: 'skimmed'; at: Point }
  | { kind: 'doused'; at: Point }

  // ——— the map ———
  /** Something on it has been knocked down. */
  | { kind: 'broke'; target: number; at: Point }
  /** Whether a record's art is on the map at all. */
  | { kind: 'shown'; id: number; visible: boolean }
  /** …and this one is gone for good: collected. */
  | { kind: 'taken'; id: number }
  /** The script has just PUT a crate on the map — what it holds, before it has
   * come down. The training ground's own script speaks off this and nothing
   * else (lib/game/tutorial.ts); `shown`/`crateSent` say the same moment for
   * the art. */
  | { kind: 'placed'; id: number; skill: number | null; amount: number }
  /** A crate the pig walked into — `given` is what it actually got. */
  | { kind: 'collected'; skill: number | null; amount: number; given: number; pig: PigId }
  /** …and points went BACK in: the number floats off the pig and it sighs.
   * `Pig::Heal` (0x467fd0) is not silent — it shows the same floating number a
   * hit does and plays a sound of its own (damage/notes.md). */
  | { kind: 'healed'; at: Point; amount: number; pig: PigId }
  /** …or had no room for: "THIS LITTLE PIG ALREADY HAS TOO MANY TOYS". */
  | { kind: 'refused'; skill: number | null; amount: number; pig: PigId }

  // ——— things coming down ———
  /** A crate is on its way: the aeroplane, and a canopy to hang over it. */
  | { kind: 'crateSent'; id: number }
  /** …its canopy opened, a beat behind the plane. */
  | { kind: 'crateChuted'; id: number }
  /** …and it is down. */
  | { kind: 'crateLanded'; id: number; at: Point }
  /** A pig arrives by parachute: hang one over it. */
  | { kind: 'dropOpened'; pig: PigId }
  /** …cut, by the ground or by the player. */
  | { kind: 'dropCut'; pig: PigId }
  /** …and it has touched down. */
  | { kind: 'dropLanded'; pig: PigId }
  /** Every canopy still up goes now: the jump key. */
  | { kind: 'canopiesCut' }

  // ——— the frame ———
  /** Wear this clip; `once` plays it through and holds the last frame. */
  | { kind: 'clip'; pig: PigId; index: number; once: boolean }
  /** Put the camera behind the pig NOW — it teleports rather than flying. */
  | { kind: 'cameraReset' }
  /** SKIP TURN was used. */
  | { kind: 'skillUsed' }
  /**
   * The turn's CLOCK ran out with no weapon used all turn — the exe counts them
   * in `[gameMode+0x334]` and the training ground has a line for it
   * (lib/game/tutorial.ts). Only where there is a script to say it.
   */
  | { kind: 'turnWasted' }
  /**
   * THE MISSION IS OVER — asked at the handover and nowhere else, which is where
   * the exe asks it (lib/game/endOfGame.ts). `turns` is how many were played, and
   * the training ground's sergeant picks his closing line by it.
   */
  | { kind: 'missionOver'; won: boolean; turns: number }
  /** …and the beat that showed it has run out: put the battle away. */
  | { kind: 'missionEnded' }
  /**
   * The pig's inventory came open — R, and it drives in from the right.
   *
   * `first` is what sits in the menu's FIRST CELL, or null for an empty one:
   * the training ground's script reads exactly that (lib/game/tutorial.ts), and
   * so does the exe, off the very same place — the cells ARE the game object's
   * first 0x300 bytes.
   */
  | { kind: 'menuOpened'; first: number | null }
  /** …and something came OUT of it, into the pig's hands. The training
   * ground's script counts these (lib/game/tutorial.ts). */
  | { kind: 'chose'; skill: number }
  /** The acting pig says a firing line, per squad. */
  | { kind: 'bark'; player: number }

/** What a module of the engine is handed: somewhere to say what happened. */
export type Emit = (event: BattleEvent) => void

export interface BattleBus {
  emit: Emit
  /** Listen. Returns a function that stops listening. */
  on(listener: Emit): () => void
}

export function createBus(): BattleBus {
  const listeners: Emit[] = []
  return {
    emit(event) {
      // Iterated over a copy: a listener that unsubscribes on the event it is
      // handling must not shift the ones behind it.
      for (const listener of [...listeners]) listener(event)
    },
    on(listener) {
      listeners.push(listener)
      return () => {
        const at = listeners.indexOf(listener)
        if (at >= 0) listeners.splice(at, 1)
      }
    }
  }
}

/**
 * A listener built from one handler per kind — what both the renderer and the
 * audio bank are. Anything not named is ignored.
 */
export function handling(handlers: {
  [K in BattleEvent['kind']]?: (event: Extract<BattleEvent, { kind: K }>) => void
}): Emit {
  return (event) => {
    const handler = handlers[event.kind] as ((one: BattleEvent) => void) | undefined
    handler?.(event)
  }
}
