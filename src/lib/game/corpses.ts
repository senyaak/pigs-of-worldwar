// What becomes of a body: it RIDES the blow out first, the dying plays only
// once the world is still, the corpse BLOWS UP, and a pair of boots is all
// that stays on the spot.
//
// The death is TWO phases, and the order is play's and the exe's both. Play:
// "сначала идёт урон, потом когда все остановились, выплыли из воды — тогда
// только идёт анимация умирания." The exe agrees in its state machine
// (`weapons/fire.md`, `[pig+0x2EC]`): health hitting zero is a STATE CHANGE
// and no clip at all — state 6, "dead, corpse still in the world", rides the
// physics body wearing clip 29 while it still slides — and the dying clip is
// set only at the 6 → 7 edge, once the body is at rest and the turn manager
// has noticed (0x46f732; in water it is clip 74 there). WHEN the world
// counts as still is the battle's answer (`stageStill`, lib/game/battle.ts —
// the walk-away's swimmers included). Then the clip runs through, the corpse
// explodes, and only the boots are left — a death in the water sinks while
// its clip plays and goes off under the surface; an overkill (`gibbed`,
// lib/game/health.ts) skips all of it, the body simply goes.
//
// Pure, like the rest of lib/game: pigs, the clips' state and a terrain query
// in; `dying`, `blasted` and `remains` out. What the boots LOOK like is the
// renderer's (three/remains.ts).

import { ANIM, inWater } from './locomotion'
import { BLAST_EFFECT } from './effects'
import { originY } from './body'
import type { Anim } from './anim'
import type { Emit } from './events'
import type { Pig } from './game'
import type { TerrainQuery } from './terrain'

/**
 * How fast a dead pig goes under, game units a second. `[CHECK — remake]`:
 * nothing about the sink was read out of the exe — the number is sized so a
 * body of ~320 units is gone in about two seconds. Correct it in play.
 *
 * The descent runs for the DROWNING clip's own length and is NOT clamped to
 * the terrain: the shipped maps' beds sit AT the waterline (measured for
 * the grenade, lib/game/grenade.ts, "the bed is AT the water line"), so a
 * clamp popped the body 140 units UP to the surface and burst it there on
 * the first step — the exact opposite of play's "должен тонуть и уходить
 * вниз и там внизу взрываться". The doused grenade's own sink through the
 * bed is the precedent.
 */
export const SINK_SPEED = 160

interface Corpse {
  pig: Pig
  /** Whether it is DYING in the water — the sink-and-drown arm. Decided at
   * the moment the dying starts, not the moment of death: a blast throws
   * bodies, and where one ENDS is what it drowns or lies in. */
  wet: boolean
  /** Still riding the blow out — the exe's state 6. The dying clip has not
   * started; the body wears the WOUNDED pose and the world has yet to
   * settle. */
  riding: boolean
}

export interface Corpses {
  /**
   * This pig has just been killed: start its death playing out. `gibbed` is
   * the overkill (lib/game/health.ts, GIB_BELOW) — no clip and no corpse
   * blast of its own, the weapon's was the whole show.
   */
  claim(pig: Pig, gibbed: boolean): void
  /** Burn the deaths down; once a step, after the tumbles — a corpse a blast
   * threw finishes its flight before it finishes its death. */
  update(delta: number): void
  /** How many bodies are still playing out — what a spec can wait on. */
  live(): number
  /** Drop everything: a new battle. */
  clear(): void
}

export function createCorpses(
  world: {
    anim: Anim
    query: TerrainQuery
    /** Whether a blast still has this body in the air (lib/game/tumble.ts). */
    tumbling: (pig: Pig) => boolean
    /** Whether the STAGE IS STILL — nothing in flight anywhere, nobody
     * swimming for the shore — the battle's word (`stageStill`,
     * lib/game/battle.ts), and the gate the dying clip waits behind. */
    cleared: () => boolean
  },
  emit: Emit
): Corpses {
  const dying: Corpse[] = []

  /** The end of it: the bang (unless overkilled away), the boots, and the pig
   * is off the map for good. */
  const finish = (pig: Pig, blast: boolean): void => {
    if (blast) {
      // The corpse's own explosion — the ordinary blast picture and noise,
      // centred on the body rather than its soles. Underwater it goes off
      // underwater, which the see-through sheet shows (three/terrain.ts).
      emit({
        kind: 'blasted',
        at: { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z },
        effect: BLAST_EFFECT.id
      })
    }
    pig.gone = true
    emit({ kind: 'remains', pig: pig.id, at: { ...pig.position }, heading: pig.heading })
  }

  return {
    claim(pig, gibbed) {
      if (pig.gone || dying.some((one) => one.pig === pig)) return
      if (gibbed) {
        // Overkill: the body comes apart on the spot — no dying clip, no
        // second bang. The exe's own gib branch (0x467cb1 → 0x4680E0(3));
        // what its scatterer spawns is not read, and play asks only for the
        // boots.
        finish(pig, false)
        return
      }
      // The aiming ARMS come down with the pig: the weapon overlay owns the
      // upper body and nothing else clears it on a corpse — without this a
      // body fell over still sighting down its rifle.
      world.anim.overlay(pig, -1, 0)
      // Death is a STATE CHANGE, not a clip: the body rides whatever the
      // blow does to it in the WOUNDED pose (the exe's state 6, clip 29),
      // and the dying starts in `update`, once the stage is still.
      world.anim.setClip(pig, ANIM.WOUNDED)
      dying.push({ pig, wet: false, riding: true })
    },

    update(delta) {
      for (let i = dying.length - 1; i >= 0; i--) {
        const one = dying[i]
        const { pig } = one
        if (one.riding) {
          // Still the blow's business — its own flight first, then the rest
          // of the world: the swimmers ashore, everything at rest.
          if (world.tumbling(pig) || !world.cleared()) continue
          one.riding = false
          // WHERE it ended is what it dies in: a body thrown off a deck
          // drowns in the bay, not on the bridge it was hit on.
          one.wet = inWater(world.query, pig.position.x, pig.position.z, pig.position.y)
          emit({ kind: 'dying', pig: pig.id, wet: one.wet })
          // Which of the three falls this pig takes is its own id's pick —
          // deterministic, so a lockstep battle buries everyone the same way
          // (lib/game/locomotion.ts, DEATHS).
          world.anim.playOnce(
            pig,
            one.wet ? ANIM.DROWNING : ANIM.DEATHS[pig.id % ANIM.DEATHS.length]
          )
          continue
        }
        // A wet death SINKS while its clip plays — clip 74 is a lying body
        // carried downward, and the position goes with it. Y-DOWN: down is
        // a larger y, and there is deliberately no floor under this (see
        // SINK_SPEED — the shipped beds sit at the waterline).
        if (one.wet) pig.position.y += SINK_SPEED * delta
        // The clip holds its last frame when it is done (lib/game/anim.ts),
        // and a blast can throw even a dying body again: its new flight
        // finishes before its death does.
        if (world.anim.animating(pig) || world.tumbling(pig)) continue
        // The bang, where the body ENDED — under the surface for a drowned
        // one, which the see-through sheet shows.
        finish(pig, true)
        dying.splice(i, 1)
      }
    },

    live: () => dying.length,
    clear: () => {
      dying.length = 0
    }
  }
}
