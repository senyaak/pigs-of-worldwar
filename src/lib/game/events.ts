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

import type { Pig } from './game'
import type { Point } from './pose'
import type { Target } from './targets'

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
  | { kind: 'killed'; pig: Pig }
  /** A grenade went off here. */
  | { kind: 'blasted'; at: Point }
  /** …or met water: every water contact reports this first, and then which of
   * the two it was (`Projectile::OnHitLandscape`, 0x4377d0). */
  | { kind: 'splashed'; at: Point }
  | { kind: 'skimmed'; at: Point }
  | { kind: 'doused'; at: Point }

  // ——— the map ———
  /** Something on it has been knocked down. */
  | { kind: 'broke'; target: Target }
  /** Whether a record's art is on the map at all. */
  | { kind: 'shown'; id: number; visible: boolean }
  /** …and this one is gone for good: collected. */
  | { kind: 'taken'; id: number }
  /** A crate the pig walked into — `given` is what it actually got. */
  | { kind: 'collected'; skill: number | null; amount: number; given: number; pig: Pig }
  /** …or had no room for: "THIS LITTLE PIG ALREADY HAS TOO MANY TOYS". */
  | { kind: 'refused'; skill: number | null; amount: number; pig: Pig }

  // ——— things coming down ———
  /** A crate is on its way: the aeroplane, and a canopy to hang over it. */
  | { kind: 'crateSent'; id: number }
  /** …its canopy opened, a beat behind the plane. */
  | { kind: 'crateChuted'; id: number }
  /** …and it is down. */
  | { kind: 'crateLanded'; id: number; at: Point }
  /** A pig arrives by parachute: hang one over it. */
  | { kind: 'dropOpened'; pig: Pig }
  /** …cut, by the ground or by the player. */
  | { kind: 'dropCut'; pig: Pig }
  /** …and it has touched down. */
  | { kind: 'dropLanded'; pig: Pig }
  /** Every canopy still up goes now: the jump key. */
  | { kind: 'canopiesCut' }

  // ——— the frame ———
  /** Wear this clip; `once` plays it through and holds the last frame. */
  | { kind: 'clip'; pig: Pig; index: number; once: boolean }
  /** Put the camera behind the pig NOW — it teleports rather than flying. */
  | { kind: 'cameraReset' }
  /** SKIP TURN was used. */
  | { kind: 'skillUsed' }
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
