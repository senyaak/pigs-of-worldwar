// What becomes of a body: the dying plays out, the corpse BLOWS UP, and a
// pair of boots is all that stays on the spot.
//
// The exe's own death is a state change and a clip (`damage/notes.md`,
// 0x467d8c writes DEAD), and its roster writeback knows a further state 8 —
// "gone" — that empties the slot (`debrief/notes.md`); what moves a body from
// one to the other was never read. The SHAPE here is play's ruling, which is
// what the disassembly is for (`behaviour, not code`): the dying clip runs
// through, the corpse explodes, and only the boots are left — a death in the
// water sinks first and goes off under the surface; an overkill (`gibbed`,
// lib/game/health.ts) skips the clip and the bang, the body simply goes.
//
// Pure, like the rest of lib/game: pigs, the clips' state and a terrain query
// in; `blasted` and `remains` out. What the boots LOOK like is the
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
 */
export const SINK_SPEED = 160

interface Corpse {
  pig: Pig
  /** Whether it died IN the water — the sink-and-drown arm. */
  wet: boolean
  /** The clip has run out and the body is on its way down. */
  sinking: boolean
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
      const wet = inWater(world.query, pig.position.x, pig.position.z, pig.position.y)
      if (gibbed) {
        // Overkill: the body comes apart on the spot — no dying clip, no
        // second bang. The exe's own gib branch (0x467cb1 → 0x4680E0(3));
        // what its scatterer spawns is not read, and play asks only for the
        // boots.
        finish(pig, false)
        return
      }
      world.anim.playOnce(pig, wet ? ANIM.DROWNING : ANIM.DYING)
      dying.push({ pig, wet, sinking: false })
    },

    update(delta) {
      for (let i = dying.length - 1; i >= 0; i--) {
        const one = dying[i]
        const { pig } = one
        if (!one.sinking) {
          // The clip holds its last frame when it is done (lib/game/anim.ts),
          // and a body a blast threw lands first: exploding in mid-air reads
          // as the blast doing it twice.
          if (world.anim.animating(pig) || world.tumbling(pig)) continue
          if (!one.wet) {
            finish(pig, true)
            dying.splice(i, 1)
            continue
          }
          one.sinking = true
        }
        // Under it goes — game space is Y-DOWN, so down is a LARGER y, and
        // the bottom is the ground itself: `height` is the terrain with no
        // water sheet over it (lib/game/terrain.ts).
        const floor = world.query.height(pig.position.x, pig.position.z)
        pig.position.y = Math.min(pig.position.y + SINK_SPEED * delta, floor)
        if (pig.position.y >= floor) {
          finish(pig, true)
          dying.splice(i, 1)
        }
      }
    },

    live: () => dying.length,
    clear: () => {
      dying.length = 0
    }
  }
}
