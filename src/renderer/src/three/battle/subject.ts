// WHO THE CAMERA IS ON when it is not simply the acting pig: a pig dying, a
// body a blow threw, a shot in the air, the survivors of a mission that is
// over — and the latches the bus sets for the first two (`listeners.ts`).

import { ANIM } from '../../../../lib/game/locomotion'
import type { FlightShot } from '../../../../lib/game/snapshot'
import type { Soldier } from '../squad'
import type { SceneCore } from './core'
import { watch } from './watch'

export interface Subject {
  /** The pig whose DYING the camera is on — set by the `dying` event, cleared
   * by its `remains`. One at a time, like the engine's own watch
   * (lib/game/corpses.ts, `watching`). */
  dyingWatch: number | null
  /** …and how long it has been on it, seconds: the death view walks BACKWARDS
   * out of the face while the clip runs (three/chase.ts, `DYING_DRIFT`). */
  dyingFor: number
  /**
   * The pig an ATTACK has just thrown, and how long it has been still since.
   *
   * **The camera goes with a body a blow moves** — `[play]`, 2026-08-25: "если
   * атака как-то передвигает свина — камера к нему прицепляется." That is not
   * where the camera was: the subject is the ACTING pig, so a grenade that
   * threw somebody across the beach was watched from the thrower, and the
   * acting pig's own fling was watched from a rig deliberately PARKED for half
   * a second (`chase.hold`).
   *
   * The engine announces the throw (`flung`) and nothing announces the
   * landing, so the settle is measured here, where it is a camera question
   * rather than a rule: the body is followed until it has held still for
   * `FLUNG_SETTLE`, and never past `FLUNG_LIMIT` whatever it is doing — a roll
   * that will not end must not take the turn's camera with it for ever.
   */
  flungWatch: { pig: number; x: number; z: number; still: number; age: number } | null
  /**
   * Whether THIS blow threw somebody. The aftermath ride is the camera going
   * back to where the blow happened (mode 0 on the crate), and when a body
   * flew there is nothing there any more — an empty crater after the thing
   * worth watching has already landed. Cleared when the aftermath is.
   */
  sawFling: boolean
}

export const createSubject = (): Subject => ({
  dyingWatch: null,
  dyingFor: 0,
  flungWatch: null,
  sawFling: false
})

const FLUNG_SETTLE = 0.4
/**
 * …and how long the camera STAYS on the body after it has stopped moving.
 * Play, 2026-08-25: "ты показываешь место взрыва гранаты после того, как
 * свинки перестали летать — лучше задерживай камеру на секунду на свине и
 * потом иди дальше, без возвращения к месту взрыва пустому."
 */
const FLUNG_LINGER = 1
const FLUNG_LIMIT = 6
/** How far a body may drift in a second and still count as settled — under
 * the bleed the engine calls a stop (lib/game/tumble.ts). */
const FLUNG_CREEP = 40

/**
 * The shot in the air the camera would ride, or null when nothing is flying.
 *
 * Something of the acting pig's is in the air, and the two families answer
 * differently — the whole table is `TRACKS_ITS_SHOT` in three/chase.ts. A
 * GUN asks for mode 1, which stands still and TURNS after the bullet; a
 * THROWN weapon asks for mode 0x0B, whose handler this build has lost and
 * whose row is 3000 straight behind at the flight's own height. The NEWEST
 * bullet is the one it answers for; which LOB is the engine's own call
 * (`tracked`, lib/game/lobs.ts `head`), because after a cluster bursts the
 * exe re-seats on the VERTICAL bomblet and that one is pushed first — play
 * caught the camera taking the tail instead and parking on the burst:
 * "при разлетании не следует за гранатками… а остаётся на месте взрыва".
 *
 * It is asked TWICE a frame: once here, and once by the subject chain, which
 * refuses to hand the camera to a flung body while this is not null. The one
 * function is the point — the two must never disagree about what is flying.
 */
export const inFlight = ({ state }: SceneCore): FlightShot | null =>
  state.now.firing?.phase !== 'flight'
    ? null
    : state.now.bullets.length > 0
      ? (state.now.bullets[state.now.bullets.length - 1] ?? null)
      : (state.now.lobs.find((one) => one.id === state.now.tracked) ?? null)

/** The flung watch run on, then the camera handed to whoever outranks the
 * acting pig this frame. */
export const followSubject = (core: SceneCore, active: Soldier, delta: number): void => {
  const { squad, subject, state } = core
  // **THE MISSION IS OVER**, and the camera is no longer the acting pig's: the
  // exe's END OF GAME walks the survivors, one every two seconds, and hands
  // each to the camera as its subject (lib/game/endOfGame.ts). Which pig is the
  // engine's to say; all this does is point the ordinary chase at it.
  // A BODY A BLOW THREW settles, and the camera lets it go when it does
  // (`flungWatch`). Measured off the snapshot, which is where a thrown pig's
  // position honestly is (the engine writes it every step), and in the
  // FRAME's own time so a pause holds the shot instead of ending it.
  // The blow is over: the next one gets its aftermath back.
  if (!state.now.aftermath) subject.sawFling = false
  if (subject.flungWatch) {
    const body = state.now.pigs.find((one) => one.id === subject.flungWatch?.pig)
    const step = delta ?? 0
    if (!body) subject.flungWatch = null
    else {
      const moved = Math.hypot(body.x - subject.flungWatch.x, body.z - subject.flungWatch.z)
      subject.flungWatch.x = body.x
      subject.flungWatch.z = body.z
      subject.flungWatch.age += step
      // A body KNOCKED INTO THE WATER stops moving sideways the instant it
      // splashes down, which read as "settled" and the camera walked off a
      // pig still afloat (play: "надо чтобы за свином камера следовала
      // дальше"). Swimming is not settled — the still clock holds while the
      // SWIM clip is on — and only the hard cap (FLUNG_LIMIT) still ends
      // the watch, because a floater that neither drowns nor swims off is
      // not a show; a drowning hands the camera to the dying watch anyway.
      const afloat = body.clip === ANIM.SWIM
      subject.flungWatch.still = afloat || moved > FLUNG_CREEP * step ? 0 : subject.flungWatch.still + step
      // The settle is the flight ending; the LINGER on top is play's second
      // (FLUNG_LINGER), and the camera holds the body through it.
      if (subject.flungWatch.still >= FLUNG_SETTLE + FLUNG_LINGER || subject.flungWatch.age >= FLUNG_LIMIT) {
        subject.flungWatch = null
      }
    }
  }
  watch(core, 
    (state.now.ending ? squad.of(state.now.ending.watching) : null) ??
      // …and under a DYING the subject is the dying pig itself — the exe's
      // mode 16 subject swap. `remains` buries it and hands the camera back.
      (subject.dyingWatch !== null ? squad.of(subject.dyingWatch) : null) ??
      // …under a FLING, the body in the air — play's rule, above — but ONLY
      // once the sky is empty. A cluster's first bomblet hurts somebody
      // while four more are still falling, and the body was stealing the
      // camera off them: "когда они дамажат кого-то — камера перехватывается
      // свином которого побили — а это должно происходить только когда нет
      // прожектайлов которые можно взорвать". So the latch is KEPT (it goes
      // on ageing, and takes the camera the moment the last one lands) and
      // merely outranked while `inFlight()` still names a shot.
      (subject.flungWatch !== null && inFlight(core) === null ? squad.of(subject.flungWatch.pig) : null) ??
      active,
    delta
  )
}
