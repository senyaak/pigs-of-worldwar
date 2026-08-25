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
import { blastReach } from './grenade'
import { originY } from './body'
import type { Charge } from './blast'
import type { Point } from './pose'
import type { Anim } from './anim'
import type { Emit } from './events'
import type { Pig } from './game'
import type { TerrainQuery } from './terrain'

/**
 * **THE CORPSE'S OWN BLAST**, out of the death dispatcher's four arms
 * (`finish` carries the whole read and the addresses). A land death is the
 * hard one — twenty points at a tight range — and the water death and the
 * gib are both half that over twice the ground.
 *
 * Damage is in 128ths like every other charge (lib/game/health.ts); the
 * ranges are `[effect+0x60]` and go through `blastReach`, which is the exe's
 * own `+ collider − 512` divisor.
 */
export const LAND_DEATH_DAMAGE = 0xa00
export const LAND_DEATH_RANGE = 0x400
export const WET_DEATH_DAMAGE = 0x500
export const WET_DEATH_RANGE = 0x800
/** The effect ids the arms name: 0x56 on land and for a gib (parameter row
 * 7), 0x5B in the water (row 8). Neither row is transcribed, so the picture
 * falls back on the grenade's (lib/game/effectField.ts). */
export const DEATH_EFFECT = 0x56
export const WET_DEATH_EFFECT = 0x5b

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

/**
 * The QUIET the dying waits out once the stage is still — play's own beat:
 * "в оригинале сначала заканчиваются все анимации, потом секунда … и она
 * умирает". Without it the release was the same STEP the stage went still
 * in — a plain rifle kill mid-turn had nothing in flight by the time the
 * damage landed, so the dying started at the blow ("умирание происходит
 * сразу же после попадания"). The second is `[play]`'s; the exe's own hold
 * between its modes is the fifteen-quiet-frames wait every beat runs
 * (0x415420, lib/game/aftermath.ts), and any interruption — a late tumble,
 * a swimmer — starts the count afresh, exactly as that counter resets.
 */
export const DEATH_QUIET = 1

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
  /** Seconds of stage-still quiet still owed before the dying starts
   * (DEATH_QUIET). Reset whenever anything moves again. */
  quiet: number
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
  /**
   * How many of those have their DYING actually ON — riding corpses excluded.
   * The distinction is what breaks the deadlock between the death and the
   * turn's wind-down: a RIDING corpse is motionless by definition and must
   * not hold the beats that lead to the stillness it is itself waiting for
   * (`settling`, lib/game/battle.ts), while a PLAYING one holds them exactly
   * the way the exe's mode 16 does.
   */
  playing(): number
  /**
   * The body whose DYING is on right now — where it lies THIS step, or null
   * while nobody's clip plays. The exe's mode 16, WATCHING DYING PIG: the
   * battle mirrors this onto the aftermath camera every frame, the way it
   * follows a crate down (lib/game/battle.ts), because a wet death SINKS and
   * a static point would watch the surface while the body left it. Several
   * dying at once: the first claimed is the one watched — the exe's own
   * 0x497760 is singular too, and all the clips run out together anyway.
   */
  watching(): { x: number; y: number; z: number } | null
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
    /** The battle's one random stream (lib/game/random.ts) — the dying clip
     * is ROLLED, seventeen of them, the exe's own `rand() % 0x11 + 0x39`. */
    roll: () => number
    /** Which side fields this pig — what the `dying` event carries so the
     * voice bank can speak with the squad's own voice. */
    sideOf: (pig: Pig) => number
    /**
     * Set the corpse's own bang off — a REAL blast, damage and all
     * (lib/game/blast.ts, `burst`, which emits the picture itself).
     *
     * It is a port rather than a call because a corpse knows nothing about
     * who else is standing about; the engine hands it the same blast world
     * every grenade uses.
     */
    blast: (at: Point, charge: Charge) => void
  },
  emit: Emit
): Corpses {
  const dying: Corpse[] = []

  /**
   * The end of it: the bang, the boots, and the pig is off the map for good.
   *
   * **THE CORPSE'S BANG IS A REAL BLAST** — read out of the exe 2026-08-25
   * after play asked "взрыв свина не дамажит никого?", because it did not.
   * The death dispatcher is `0x4680E0(kind)`, reached for an ordinary death
   * from the state-7 arm at `0x46fb88` and for an overkill from `0x467d10`,
   * and every kind allocates an effect and calls
   * `0x487AD0(x, z, id, RANGE, 1, ?, DAMAGE)`:
   *
   * | death | id | range | damage |
   * | ----- | -- | ----- | ------ |
   * | on land (`0x4688ad`) | 0x56 | 0x400 | 0xA00 — twenty points |
   * | in water (`0x468927`) | 0x5B | 0x800 | 0x500 — ten |
   * | GIBBED (`0x468a5f`) | 0x56 | 0x800 | 0x500 — ten |
   *
   * The id is what makes it hurt: Effect::Init's tail (`0x489493`) gates on
   * `0x41 <= id <= 0x63` and only then writes the damage, the range and the
   * phantom collision sphere — and `Pig::OnHitObject`'s effect arm
   * (`0x4778ae` → `0x477c22`) runs the ordinary falloff and calls
   * `TakeDamage(amount, 0)`. Kind 0, so a corpse's blast can overkill the
   * next pig and GIB it in turn. It cannot touch the dead: `TakeDamage`
   * returns at once for states 6, 7 and 8 (`0x467ac9`), and `burst` skips
   * `isDead` for the same reason.
   *
   * Two things are NOT the exe's and both are already this engine's rule.
   * The exe's corpse blast writes no impulse at all — neither velocity
   * primitive is called anywhere in `0x4680E0..0x468B70` or in the blast arm
   * — but in this remake every blast throws, which is `[play]`'s own
   * override (lib/game/blast.ts says where it came from). And the PICTURE
   * stays the grenade's row: 0x56 reads parameter row 7 and 0x5B row 8,
   * neither transcribed, so `effectField` falls back on row 0.
   */
  const finish = (pig: Pig, how: 'land' | 'water' | 'gibbed' | null): void => {
    if (how !== null) {
      // Centred on the body rather than its soles. Underwater it goes off
      // underwater, which the see-through sheet shows (three/terrain.ts).
      const at: Point = {
        x: pig.position.x,
        y: originY(pig.position.y, pig.body),
        z: pig.position.z
      }
      const charge: Charge =
        how === 'land'
          ? { damage: LAND_DEATH_DAMAGE, reach: blastReach(LAND_DEATH_RANGE), effect: DEATH_EFFECT }
          : how === 'water'
            ? {
                damage: WET_DEATH_DAMAGE,
                reach: blastReach(WET_DEATH_RANGE),
                effect: WET_DEATH_EFFECT
              }
            : { damage: WET_DEATH_DAMAGE, reach: blastReach(WET_DEATH_RANGE), effect: DEATH_EFFECT }
      world.blast(at, charge)
    }
    pig.gone = true
    emit({ kind: 'remains', pig: pig.id, at: { ...pig.position }, heading: pig.heading })
  }

  return {
    claim(pig, gibbed) {
      if (pig.gone || dying.some((one) => one.pig === pig)) return
      if (gibbed) {
        // Overkill: the body comes apart on the spot — no dying clip, and
        // the bang is the GIB's own, which is a wider and weaker one than a
        // whole body's (0x467d10 → 0x4680E0(3) → 0x468a5f: id 0x56 at range
        // 0x800 for 0x500, ten points over twice a grenade's reach). That
        // arm used to be written off as "what its scatterer spawns is not
        // read"; it is read now, and the blast is the readable half.
        finish(pig, 'gibbed')
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
      dying.push({ pig, wet: false, riding: true, quiet: DEATH_QUIET })
    },

    update(delta) {
      for (let i = dying.length - 1; i >= 0; i--) {
        const one = dying[i]
        const { pig } = one
        if (one.riding) {
          // Still the blow's business — its own flight first, then the rest
          // of the world: the swimmers ashore, everything at rest. Anything
          // still moving starts the quiet over.
          if (world.tumbling(pig) || !world.cleared()) {
            one.quiet = DEATH_QUIET
            continue
          }
          // …and then the beat of QUIET on top of the stillness, which is
          // what separates the blow from the dying (DEATH_QUIET above).
          one.quiet -= delta
          if (one.quiet > 0) continue
          one.riding = false
          // WHERE it ended is what it dies in: a body thrown off a deck
          // drowns in the bay, not on the bridge it was hit on.
          one.wet = inWater(world.query, pig.position.x, pig.position.z, pig.position.y)
          emit({
            kind: 'dying',
            pig: pig.id,
            player: world.sideOf(pig),
            voice: pig.voice,
            wet: one.wet
          })
          // Which fall this pig takes is ROLLED off the battle's own stream —
          // seventeen of them, the exe's `rand() % 0x11 + 0x39` at the same
          // edge (lib/game/locomotion.ts, DEATHS) — so a lockstep battle
          // still buries everyone the same way.
          world.anim.playOnce(
            pig,
            one.wet
              ? ANIM.DROWNING
              : ANIM.DEATHS[Math.floor(world.roll() * ANIM.DEATHS.length) % ANIM.DEATHS.length]
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
        // one, which the see-through sheet shows, and the exe gives that one
        // its own weaker-but-wider charge (see `finish`).
        finish(pig, one.wet ? 'water' : 'land')
        dying.splice(i, 1)
      }
    },

    live: () => dying.length,
    playing: () => dying.reduce((count, one) => count + (one.riding ? 0 : 1), 0),
    watching: () => {
      const one = dying.find((corpse) => !corpse.riding)
      return one
        ? { x: one.pig.position.x, y: one.pig.position.y, z: one.pig.position.z }
        : null
    },
    clear: () => {
      dying.length = 0
    }
  }
}
