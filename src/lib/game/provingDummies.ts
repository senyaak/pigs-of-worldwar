// THE PROVING GROUND'S DUMMIES COME BACK.
//
// `[play]`, 2026-11-02 (docs/facts/proving-ground.md): they "stand up at full
// health at the start of a turn", so that reactions, deaths and damage numbers
// get tested. The original has no such thing and neither does its death: the
// dying plays out whole, by the same rules as anywhere (lib/game/corpses.ts),
// and only a body that has finished it comes back.
//
// WHERE it comes back is not in play's words. The map's layout is the remake's
// own, so it is the dummy's own place on the strip: the ranges down the strip
// stay what they were laid out to be, and a body that drowned or was thrown has
// no other safe spot to return to.
//
// The asking is the handover's, on this map alone (lib/game/battle/handover.ts).
// Pure, like the rest of lib/game.

import type { Emit, PigId } from './events'
import type { Anim } from './anim'
import type { Game, Pig } from './game'
import { maxHealthFor } from './health'
import { outfit } from './kits'
import { ANIM } from './locomotion'
import type { Tumbles } from './tumble'

/**
 * Every side but the first is a side of dummies: side 0 is the player's
 * (`spawnTeams` orders it first off the map's player bit, lib/game/spawns.ts),
 * and the proving ground fields one other (lib/game/provingGround.ts).
 */
export const isDummySide = (side: number): boolean => side > 0

export interface DummyWorld {
  game: Game
  anim: Anim
  /** Whether a blow still has this body in the air (lib/game/tumble.ts). */
  tumbles: Pick<Tumbles, 'has'>
  /** A fall poisoned is not carried back up (lib/game/poison.ts). */
  poison: { cure(pig: PigId): void }
}

export interface ProvingDummies {
  /**
   * A turn is starting: every dummy whose death has finished is on its feet, as
   * it was when the battle began.
   *
   * One still dying waits for the first turn start after it has finished, and
   * one only wounded is none of this module's: play's words are about a dummy
   * that went down.
   */
  standUp(): void
}

export function createProvingDummies(world: DummyWorld, emit: Emit): ProvingDummies {
  const { game, anim, tumbles, poison } = world
  /** Each dummy and where it stands, taken the moment the battle is built. */
  const places = game.players
    .filter((_, side) => isDummySide(side))
    .flatMap((player) => player.pigs)
    .map((pig) => ({ pig, at: { ...pig.position }, heading: pig.heading }))

  const raise = (pig: Pig, at: Pig['position'], heading: number): void => {
    pig.position = { ...at }
    pig.heading = heading
    pig.health = maxHealthFor(pig.pigClass)
    pig.carrying = outfit(pig.pigClass)
    pig.holding = null
    pig.gone = false
    poison.cure(pig.id)
    // It wore its dying clip's last frame, and the aiming arms came down with
    // the death. No getting-up clip is asked for: it is simply standing there.
    anim.setClip(pig, ANIM.IDLE)
    anim.overlay(pig, -1, 0)
    emit({ kind: 'stoodUp', pig: pig.id, at: { ...at }, heading })
  }

  return {
    standUp() {
      for (const { pig, at, heading } of places) {
        if (pig.gone && !tumbles.has(pig)) raise(pig, at, heading)
      }
    }
  }
}
