// The level's opening: the squad coming down under canopies onto its own
// spawn markers.
//
// `parachute.ts` is one descent and its derivation; this is the PHASE — who is
// up there, and the fact that NOTHING else in the battle runs until they are
// all down. That last part is the original's too: the pig update's parachute
// branch (exe 0x46ed23) advances the clip and returns, so there is no clock
// and no input while a pig is under a canopy. The battle asks `running()` every
// frame, which is why this cannot live behind a renderer.
//
// Drop state lives HERE, keyed by pig, rather than as fields on the pig —
// arriving is a phase the battle passes through once, and nothing about
// standing and walking should carry a nullable canopy around forever.

import { ANIM, restingY } from './locomotion'
import { createDrop, cutChute, updateDrop } from './parachute'
import type { DropState } from './parachute'
import type { Pig } from './game'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

/** What a spec sees of the drop — a canopy coming down is not something an
 * assertion can watch. */
export interface DropInState {
  running: boolean
  pigs: { name: string; y: number; landed: boolean; canopy: boolean }[]
}

/** One pig on its way in. */
export interface Arrival {
  pig: Pig
  drop: DropState
  /** Whether a canopy is still over it. */
  chute: boolean
  done: boolean
}

export interface DropIn {
  /**
   * One frame. Returns whether the phase is still going — while it is, the
   * battle does nothing else.
   *
   * `cut` is the player asking for the canopy to go: the whole squad's, at
   * once, which is what the exe's own button does — its handler walks the pig
   * list (0x490c20).
   */
  update(delta: number, cut: boolean): boolean
  /** Whether this pig is still on a canopy — the camera looks a pig on one in
   * the face rather than following its shoulders. */
  underCanopy(pig: Pig): boolean
  /** Whether anyone is still coming down: what the opening card shows over. */
  running(): boolean
  /** Everyone still on their way in — what a renderer stands where the drop
   * says. A pig whose canopy has been CUT is still on this list: it is falling
   * free, and it still has to be drawn falling. */
  live(): readonly Arrival[]
  state(): DropInState
}

/** A drop-in that is already over: what a map whose markers all stand gets,
 * and what a map with no canopy art gets too. */
export const NO_DROP_IN: DropIn = {
  update: () => false,
  underCanopy: () => false,
  running: () => false,
  live: () => [],
  state: () => ({ running: false, pigs: [] })
}

/**
 * Lift every pig whose marker says so.
 *
 * `spread` is the exe's own `rand & 0x1ff` as a 0..1 fraction, so a squad
 * arrives over a beat rather than all together — injectable because a lockstep
 * battle cannot have each side rolling its own.
 */
export function createDropIn(
  pigs: Pig[],
  query: TerrainQuery,
  emit: Emit,
  spread: () => number = Math.random
): DropIn {
  const arriving = pigs.filter((pig) => pig.parachutes)
  if (arriving.length === 0) return NO_DROP_IN

  const arrivals: Arrival[] = arriving.map((pig) => {
    const drop = createDrop(restingY(query, pig.position.x, pig.position.z), spread())
    pig.position = { ...pig.position, y: drop.y }
    emit({ kind: 'dropOpened', pig: pig.id })
    emit({ kind: 'clip', pig: pig.id, index: ANIM.PARACHUTE, once: false })
    return { pig, drop, chute: true, done: false }
  })

  /** Take a canopy away, whether the player cut it or the ground did. */
  const furl = (arrival: Arrival): void => {
    if (!arrival.chute) return
    arrival.chute = false
    emit({ kind: 'dropCut', pig: arrival.pig.id })
  }

  return {
    update(delta, cut) {
      if (cut) {
        for (const arrival of arrivals) {
          if (arrival.done || !arrival.drop.chute) continue
          cutChute(arrival.drop)
          furl(arrival)
          // What 0x4678f0 plays: the flying clip, and it keeps it until
          // something stops the fall.
          emit({ kind: 'clip', pig: arrival.pig.id, index: ANIM.JUMP_MIDDLE, once: false })
        }
      }
      let busy = false
      for (const arrival of arrivals) {
        if (arrival.done) continue
        busy = true
        const { x, z } = arrival.pig.position
        updateDrop(arrival.drop, restingY(query, x, z), delta)
        arrival.pig.position = { x, y: arrival.drop.y, z }
        if (!arrival.drop.landed) continue
        // Touchdown: the canopy goes and the pig gets up, which is
        // `SetAnim(0x0a, 0, 1, 1)` at 0x4717f5 — clip 10, ONCE. The phase is
        // over for this pig the moment it is down; the get-up plays on over
        // the start of the turn, exactly as a committed clip does anywhere
        // else, because the renderer will not let the walking cut it short.
        furl(arrival)
        emit({ kind: 'clip', pig: arrival.pig.id, index: ANIM.LAND, once: true })
        emit({ kind: 'dropLanded', pig: arrival.pig.id })
        arrival.done = true
      }
      return busy
    },
    underCanopy: (pig) => arrivals.find((arrival) => arrival.pig === pig)?.chute === true,
    running: () => arrivals.some((arrival) => !arrival.done),
    live: () => arrivals.filter((arrival) => !arrival.done),
    state: () => ({
      running: arrivals.some((arrival) => !arrival.done),
      pigs: arrivals
        .filter((arrival) => !arrival.done)
        .map((arrival) => ({
          name: arrival.pig.name,
          y: arrival.pig.position.y,
          landed: arrival.drop.landed,
          canopy: arrival.chute
        }))
    })
  }
}
