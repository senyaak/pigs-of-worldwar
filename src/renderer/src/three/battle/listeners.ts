// What the SCENE hears on the battle's bus.

import { HEAL_EFFECT_ID } from '../../../../lib/game/blast'
import { handling } from '../../../../lib/game/events'
import type { BattleBus } from '../../../../lib/game/events'
import type { Collected } from '../../../../lib/game/scenery'
import type { AirDropArt } from '../airDrop'
import type { Chase } from '../chase'
import type { DropInArt } from '../dropIn'
import type { Faces } from '../faces'
import type { MapProps } from '../props'
import type { RemainsArt } from '../remains'
import type { Squad } from '../squad'
import type { Subject } from './subject'

/** What the scene's listeners act on — hung before the engine is built, so
 * before most of the scene's core exists (`listen`). */
export interface SceneListeners {
  bus: BattleBus
  props: MapProps
  dropInArt: DropInArt
  faces: Faces
  squad: Squad
  chase: Chase
  airDropArt: AirDropArt
  onCollected: (collected: Collected) => void
  subject: Subject
  /** Built after the engine, and asked for only when a death has finished. */
  remainsArt: () => RemainsArt
}

/**
 * The SCENE's subscription: everything the engine announces that has to be
 * SHOWN, and nothing that has to be remembered.
 *
 * Hung BEFORE the engine is built, because the engine announces while it is
 * still building — a record the map's script holds back is announced hidden
 * inside `createScenery`, and a canopy opens inside `createDropIn`. A
 * listener hung afterwards misses both, and the map comes up with the eight
 * dummies standing on it that the script has not placed yet.
 */
export const listen = (scene: SceneListeners): void => {
  const { bus, props, dropInArt, faces, squad, chase, airDropArt, onCollected, subject, remainsArt } = scene
  bus.on(
    handling({
      shown: ({ id, visible }) => props.show(id, visible),
      taken: ({ id }) => props.take(id),
      dropOpened: ({ pig }) => {
        dropInArt.open(pig)
        faces.scare(pig)
      },
      // The canopy goes on a CUT and on the ground alike; the face only calms
      // on landing — a pig falling free has even more to be scared of.
      dropCut: ({ pig }) => dropInArt.cut(pig),
      dropLanded: ({ pig }) => faces.calm(pig),
      // A DYING has begun: the camera comes to the pig's FACE for the length
      // of the clip — play's word on the original ("камера на свинью С ЛИЦА,
      // и она умирает"). The exe re-points its subject the same way (mode 16,
      // WATCHING DYING PIG); the FRAMING is play's, on the rig the canopy
      // already uses. The frame loop reads this id (see `watch`).
      dying: ({ pig }) => {
        subject.dyingWatch = pig
        subject.dyingFor = 0
        // A death outranks a fling, and a dying pig is usually both.
        subject.flungWatch = null
      },
      // A BLOW HAS THROWN A BODY: the camera goes with it (see `flungWatch`).
      // The newest throw wins — a blast that catches two pigs is watched on
      // the last one it reached, which is the one still moving.
      flung: ({ pig, at }) => {
        if (pig === subject.dyingWatch) return
        subject.flungWatch = { pig, x: at.x, z: at.z, still: 0, age: 0 }
        subject.sawFling = true
      },
      // A death has finished playing out: the body comes off the scene for
      // good and the boots go down where it lay (lib/game/corpses.ts). The
      // blast that goes with it arrives as an ordinary `blasted`.
      remains: ({ pig, at, heading }) => {
        if (subject.dyingWatch === pig) subject.dyingWatch = null
        squad.bury(pig)
        remainsArt().leave(at, heading)
      },
      // A BANG SHAKES THE LENS, and this is the exe's own reaction to an
      // explosion — the only one it has (three/chase.ts, `SHAKE_REACH`).
      // …and the MEDICINE BALL's 0x60 does not: a heal is not a bang — its
      // effect carries no force at all (lib/game/blast.ts, `mend`).
      blasted: ({ at, effect }) => {
        if (effect !== HEAL_EFFECT_ID) chase.shake(at)
      },
      crateSent: ({ id }) => airDropArt.open(id),
      crateLanded: ({ id }) => airDropArt.land(id),
      canopiesCut: () => airDropArt.cutAll(),
      cameraReset: () => chase.reset(),
      collected: (one) => onCollected({ ...one, result: 'taken' }),
      refused: (one) => onCollected({ ...one, given: 0, result: 'full' })
    })
  )
}
