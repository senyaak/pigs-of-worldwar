// What the map has standing on it, and what happens to it.
//
// Three things that are really one: the crates a pig walks into, the map's
// SCRIPT — every record may carry one command, and the objects ARE the program
// (lib/game/script.ts) — and the collision world they share. Breaking a dummy
// runs its command, which places what was waiting on it, which is either
// switched on where it stands or dropped in under a canopy; collecting a crate
// does the same from the other end.
//
// It all lived in `three/battle.ts` because it needed the props' meshes for
// two things: where a record stands, and hiding one. The first is arithmetic
// on the record itself (`restingPlaceOf`), and the second is the only part
// that was ever presentation — so it is announced and everything else is here.

import { pickupsOf, reached, worthOf } from './pickups'
import type { Pickup } from './pickups'
import { createScript } from './script'
import { ObstacleField } from './obstacles'
import { amountOf, clearSlots, give } from './inventory'
import type { GiveResult } from './inventory'
import { heal } from './health'
import { originY } from './body'
import { HEIGHT_SCALE } from './terrain'
import type { Point } from './pose'
import type { Pig } from './game'
import type { MapObject } from '../formats/pog'
import type { Emit } from './events'

/**
 * Where a record's art stands, in game space.
 *
 * The stored y is an ELEVATION in the PMG's own height space, so it rides
 * `HEIGHT_SCALE` exactly as the ground does; game space is Y-down, hence the
 * negation. `three/props.ts` places every mesh by this and nothing else, which
 * is why the domain can work it out rather than ask.
 */
export const restingPlaceOf = (object: MapObject): Point => ({
  x: object.x,
  y: -object.y * HEIGHT_SCALE,
  z: object.z
})

/**
 * A crate the acting pig has just walked into, as the briefing bar needs it —
 * the two events (`collected`, `refused`) carry the same fields and the view
 * says one line for either (ui/battle.ts).
 */
export interface Collected {
  /** Skill id, or null on a health crate (lib/game/skills.ts). */
  skill: number | null
  /** What the crate held — the map's own count, before the training ground
   * makes it unlimited. */
  amount: number
  /** What the pig actually got: its slot's new amount, or the health. */
  given: number
  /** Whether the pig had room for it (lib/game/inventory.ts). */
  result: GiveResult
  /** Who picked it up. */
  pig: number
}

export interface Scenery {
  /** The map's boxes, as things to walk into. */
  readonly obstacles: ObstacleField
  /** Whether the script is still holding this record back. */
  absent(id: number): boolean
  /** Every record the script has not placed yet. */
  waiting(): number[]
  /** Hand over any crate this pig is standing in. */
  collect(pig: Pig): void
  /**
   * Something has been finished — a crate collected, a dummy broken — so run
   * its command and put on the map whatever was waiting on it.
   *
   * `fromY` is the FINISHER's height, because that is what the exe measures a
   * canopy drop from rather than the crate's own ground (0x4aa755).
   */
  advance(id: number, fromY: number): void
  /** Take a broken record off the map and out of the collision world. */
  remove(id: number): void
  /** Where a record rests, or null if the map carries no such object. */
  restingY(id: number): number | null
  /** …and where it stands. */
  at(id: number): Point | null
}

export function createScenery(
  objects: MapObject[],
  /** The training ground hands out its crates on its own terms
   * (lib/game/pickups.ts). */
  training: boolean,
  /** Whose inventory a placed crate clears — the acting pig. */
  actingPig: () => Pig,
  /** Send a record down under a canopy from `fromY` (lib/game/airDrop.ts).
   * A domain call rather than an event: the descent is part of the game, and
   * the battle waits on it. */
  drop: (id: number, fromY: number) => void,
  emit: Emit
): Scenery {
  const obstacles = new ObstacleField(objects)
  /** The crates that carry something. A collected one is spliced out, so the
   * list is what is still on the ground. */
  const pickups: Pickup[] = pickupsOf(objects)
  const script = createScript(objects)
  const places = new Map<number, Point>()
  for (const object of objects) places.set(object.id, restingPlaceOf(object))
  /** Crates a full pig has already been told it cannot carry: the refusal is
   * said once, not once a frame while it stands there. */
  const refused = new Set<number>()

  // Most of what CAMP carries is not on its ground at the start — eight
  // dummies, the second bridge, and every crate but the first three.
  for (const id of script.waiting()) {
    emit({ kind: 'shown', id, visible: false })
    // Off the map means off it entirely: an invisible dummy is not something
    // to walk into either.
    obstacles.remove(id)
  }

  const advance = (id: number, fromY: number): void => {
    const placed = script.finish(id)
    // Putting a CRATE down takes everything off the acting pig: the exe calls
    // `Pig::ClearInventory` (0x468f50) from the placement arms — but only on
    // the pickup branch, the one that drops the thing in under a canopy
    // (0x4aa6cb; the dummy branch jumps clean over it at 0x4aa659). That is
    // why the bayonet goes missing the moment the first dummy falls: the step
    // is over, the rifle is on its way down, and the tutorial hands you one
    // weapon at a time (lib/game/inventory.ts).
    //
    // Clearing what it HOLDS is the remake's own line: the exe leaves
    // `[pig+0x2f4]` pointing at a weapon the pig no longer owns.
    if (placed.some((one) => one.parachute)) {
      const pig = actingPig()
      clearSlots(pig.carrying)
      pig.holding = null
    }
    for (const one of placed) {
      if (one.parachute) {
        // The collision world waits for the landing; a crate still in the air
        // is not standing anywhere.
        drop(one.id, fromY)
        // …and this is the moment the training ground's script talks at. The
        // exe announces it from the same arm, between setting the crate's own
        // "just placed" byte and clearing the pig (0x4aa69c..0x4aa6b7), and
        // what it says is about the crate's CONTENTS — so the event carries
        // them (lib/game/tutorial.ts).
        const crate = pickups.find((each) => each.id === one.id)
        if (crate) {
          emit({ kind: 'placed', id: one.id, skill: crate.skill, amount: crate.amount })
        }
        continue
      }
      emit({ kind: 'shown', id: one.id, visible: true })
      obstacles.restore(one.id)
    }
  }

  return {
    obstacles,
    absent: (id) => script.absent(id),
    waiting: () => script.waiting(),
    advance,
    remove(id) {
      emit({ kind: 'taken', id })
      obstacles.remove(id)
    },
    restingY: (id) => places.get(id)?.y ?? null,
    at: (id) => places.get(id) ?? null,
    collect(pig) {
      for (let i = pickups.length - 1; i >= 0; i--) {
        const pickup = pickups[i]
        // A crate the script has not placed yet is not there to be walked into.
        if (script.absent(pickup.id)) continue
        if (!reached(pickup, pig.position.x, pig.position.z)) continue
        const worth = worthOf(pickup, training)
        let result: GiveResult = 'taken'
        let given = worth
        // **A WEAPON CRATE TAKES WHAT YOU WERE CARRYING — A MEDKIT DOES NOT.**
        //
        // The medkit half was this repo READING PLAY BACKWARDS. "Тнт не
        // забирается когда аптечку в доме подбираешь… должен" was taken for a
        // request that it be taken; it was a report that it survives, and that
        // it should. Play, after the training ground dead-ended on it — "если
        // сломать не дверь динамитом — туториал багуется — я сломал стену, взял
        // аптечку, и там пропал динамит и не появилась базука", then flatly:
        // **"должен оставаться — я сказал"**. A heal is not a weapon swap.
        //
        // What stands for a WEAPON crate is the tutorial's own shape, one weapon
        // at a time — and it is still the remake's own, since the exe clears on
        // PLACEMENT alone.
        //
        // The arithmetic behind that, and it is all read: CAMP's own door
        // (record 45, `STW04_D2`) is the ONE piece of the house with a health of
        // its own — **50**, exactly TNT's damage at the core, where every wall
        // beside it takes the table's 60 — and it is the only one carrying a
        // command (opcode 22, waiting on label 89 and signalling 7). The bazooka
        // (record 18) and the health crate inside the house (55) are what wait on
        // that 7. Break a WALL instead and nothing is placed, which is correct;
        // but on the training ground every skill is UNLIMITED (`worthOf`), so the
        // player still has the TNT and can go and blow the door — unless a
        // medkit has quietly emptied their pockets. There is no second TNT crate:
        // record 52 is the only one, and it waits on label 6.
        //
        // The exe never clears on a collection at all — `Pig::ClearInventory`
        // (0x468f50, and it is unconditional, no training-ground guard) is called
        // from the PLACEMENT arm (0x4aa6cb; the dummy branch jumps over it at
        // 0x4aa659), which is the half `advance` below does. So the clear is
        // play's addition on top of the exe, and the narrowest cut that keeps it
        // while unbreaking the level is this: a crate with a SKILL in it swaps
        // your weapon, a crate with none is a heal and leaves you armed.
        if (pickup.skill !== null) {
          clearSlots(pig.carrying)
          pig.holding = null
        }
        if (pickup.skill === null) {
          // No ceiling: the original's heal adds and stops (lib/game/health.ts).
          heal(pig, worth)
          given = pig.health
          // …and it is not silent. `Pig::Heal` converts the pig's own position
          // and hands it to 0x487B90 — the SAME floating-number spawner
          // `Pig::TakeDamage` uses (0x468081, against 0x467b73) — then plays
          // sound 0x53 at 100/100 (0x468089). The only difference is the
          // spawner's fifth argument: a hit passes 0 and takes the team's
          // colour out of the records at 0x4CF1E0, a heal passes 1 and gets the
          // fixed 0x6405 (0x487c19). Nothing here carries a colour, because the
          // number is drawn in the game's own letters (ui/hud.ts).
          emit({
            kind: 'healed',
            at: { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z },
            amount: worth,
            pig: pig.id
          })
        } else {
          result = give(pig.carrying, pickup.skill, worth)
          // A pig with fifteen skills already leaves the crate where it is.
          if (result === 'full') {
            if (!refused.has(pickup.id)) {
              refused.add(pickup.id)
              emit({ kind: 'refused', skill: pickup.skill, amount: pickup.amount, pig: pig.id })
            }
            continue
          }
          given = amountOf(pig.carrying, pickup.skill)
        }
        pickups.splice(i, 1)
        emit({ kind: 'taken', id: pickup.id })
        // It was something to push against a frame ago; leaving it in the
        // collision world would leave an invisible crate behind.
        obstacles.remove(pickup.id)
        // A collected crate runs its own command — the exe does it from inside
        // the pickup class (0x464633).
        advance(pickup.id, places.get(pickup.id)?.y ?? 0)
        emit({ kind: 'collected', skill: pickup.skill, amount: pickup.amount, given, pig: pig.id })
      }
    }
  }
}
