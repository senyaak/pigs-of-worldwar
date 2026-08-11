// WHO IS INSIDE WHAT — the shelter a pig jumps into, and what it may do in there.
//
// Play: "бомбоубежище не работает — нельзя залезть внутрь", and then "свин должен
// запрыгивать внутрь. И видит бомбоубежище — в инвентаре скилы только постройки,
// и у бомбоубежища это только пропустить ход."
//
// The original keeps this on the objects themselves: a building has an occupant
// LIST at `[+0x80]` and a count at `[+0xe4]`, and the pig carries `[+0x170]` (the
// one it is in) beside `[+0x2ec]` (**3** a vehicle, **4** a building) and
// `[+0x314]` (the one it COULD get into, filled by a scan every frame). This is
// the same relation, kept in one place instead of on both ends, because nothing
// in the remake's pig wants a field for it.
//
// **Being inside means NOT BEING DRAWN**, and that is the exe's own rule rather
// than a choice: both doors — 0x469f60 in and 0x469b60 out, and the loader's own
// boarding at 0x47d717 — do the same two things to the pig, `[body+0x44] |= 1`
// and **`[pig+0x30] = 0`**, and that second byte is the gate the draw loop tests
// every object on (0x44e43e). So a pig in a shelter is gone from the picture, and
// there is nothing behind the wall to see through it (see `seeThrough.ts`, which
// is why the shelter is not faded).
//
// Pure, and game space (Y-down) like the rest of lib/game.

import { ENTER_REACH, buildingKind, buildingRoom, buildingSkills } from './buildings'
import { copyLocomotion } from './locomotion'
import type { LocomotionState } from './locomotion'
import { boxOf } from './obstacles'
import type { Obstacle } from './obstacles'
import type { MapObject } from '../formats/pog'
import type { Pig } from './game'
import type { Emit } from './events'

/** One building on the map, as the rules need it. */
export interface Building {
  /** The POG record's own id. */
  id: number
  /** 1..6 — the exe's own kind (lib/game/buildings.ts). */
  kind: number
  /** Its footprint, the same box the collision world uses. */
  box: Obstacle
}

/**
 * Where a pig stood before it went in, so leaving puts it back.
 *
 * The whole FOOTING and not just the spot — position, heading, and what it was
 * standing on. Coming out used to restore the three coordinates and let the
 * battle build a fresh locomotion state from them, which is a DERIVED answer
 * where a kept one was available: the rebuild runs `standOn` again and gives
 * back whatever that spot resolves to, which for a pig that walked in off
 * anything raised is not where it came from (lib/game/locomotion.ts,
 * `copyLocomotion`).
 *
 * NOT the cause of play's "из убежища выпрыгивает на крышу" — that was the
 * guess and it is measured wrong; see CLAUDE.md.
 */
interface Doorstep {
  building: number
  footing: LocomotionState
}

export interface Indoors {
  /** Every building on the map, in record order. */
  all(): readonly Building[]
  /** The one this pig could get into from where it stands, or null. */
  reachable(pig: Pig): Building | null
  /** Which building this pig is in, or null. */
  inside(pig: Pig): Building | null
  /** How many pigs are in this one. */
  occupants(id: number): number
  /**
   * Put the pig in, if it can go: something in reach with room in it. True when
   * it went. The pig is moved to the building's own middle, which is what the
   * exe does (0x469fde copies the building's transform onto the pig).
   *
   * `footing` is what it was standing on at the door, kept whole so that
   * leaving can put it back rather than derive a new one.
   */
  enter(pig: Pig, footing: LocomotionState): boolean
  /** …and back out, onto the footing it came from — which is handed back, so
   * the battle can stand on it again. Null when the pig was not inside. */
  leave(pig: Pig): LocomotionState | null
  /** Whatever the pig is standing in, gone — a pig that just died, or a battle
   * being torn down. */
  clear(pig?: Pig): void
}

export function createIndoors(objects: readonly MapObject[], emit: Emit): Indoors {
  const buildings: Building[] = []
  for (const object of objects) {
    const kind = buildingKind(object.name)
    if (kind === null) continue
    buildings.push({ id: object.id, kind, box: boxOf(object) })
  }
  const byId = new Map(buildings.map((one) => [one.id, one]))
  /** Where each pig inside came from, by pig id. */
  const held = new Map<number, Doorstep>()

  const countIn = (id: number): number => {
    let n = 0
    for (const step of held.values()) if (step.building === id) n++
    return n
  }

  /**
   * How far this pig is from the building's own footprint, on the flat.
   *
   * In the box's OWN frame, so a shelter turned three quarters round is the same
   * test as one that is not — the same reduction `obstacles.ts` makes.
   */
  const gapTo = (building: Building, pig: Pig): number => {
    const box = building.box
    const dx = pig.position.x - box.x
    const dz = pig.position.z - box.z
    const cos = Math.cos(box.turn)
    const sin = Math.sin(box.turn)
    const local = { x: dx * cos - dz * sin, z: dx * sin + dz * cos }
    return Math.max(
      Math.abs(local.x) - box.halfX,
      Math.abs(local.z) - box.halfZ
    )
  }

  const insideOf = (pig: Pig): Building | null => {
    const step = held.get(pig.id)
    return step ? (byId.get(step.building) ?? null) : null
  }

  return {
    all: () => buildings,
    occupants: countIn,
    inside: insideOf,
    reachable(pig) {
      if (held.has(pig.id)) return null
      let best: Building | null = null
      let nearest = ENTER_REACH
      for (const building of buildings) {
        if (countIn(building.id) >= buildingRoom(building.kind)) continue
        const gap = gapTo(building, pig)
        if (gap > nearest) continue
        nearest = gap
        best = building
      }
      return best
    },
    enter(pig, footing) {
      const building = this.reachable(pig)
      if (!building) return false
      held.set(pig.id, { building: building.id, footing: copyLocomotion(footing) })
      // Into the middle of it, the way the exe puts him on the building's own
      // transform. He is not drawn from here, so where exactly hardly shows —
      // but the CAMERA still watches this point, and the middle is what reads as
      // "he is in there".
      pig.position.x = building.box.x
      pig.position.z = building.box.z
      emit({ kind: 'wentIn', pig: pig.id, building: building.id })
      return true
    },
    leave(pig) {
      const step = held.get(pig.id)
      if (!step) return null
      held.delete(pig.id)
      pig.position.x = step.footing.x
      pig.position.y = step.footing.y
      pig.position.z = step.footing.z
      pig.heading = step.footing.heading
      emit({ kind: 'cameOut', pig: pig.id, building: step.building })
      return step.footing
    },
    clear(pig) {
      if (pig) held.delete(pig.id)
      else held.clear()
    }
  }
}

/**
 * **What the skill menu offers this pig.**
 *
 * Outside, what it is carrying — the menu adds SKIP TURN itself, since a pig with
 * empty hands still has that (`ui/skillMenu.ts`). Inside a building, the
 * building's own list instead, which for a SHELTER is nothing at all: so the menu
 * comes up with one entry in it and that entry is SKIP TURN.
 */
export const choosableIn = (
  carrying: readonly { skill: number; amount: number }[],
  inside: Building | null
): { skill: number; amount: number }[] =>
  inside === null
    ? [...carrying]
    : buildingSkills(inside.kind).map((skill) => ({ skill, amount: -1 }))
