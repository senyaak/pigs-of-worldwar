// DRIVING INTO SOMEBODY — the one thing a vehicle does that a building cannot.
//
// The manual states both halves and the exe splits them on the kind:
//
// > Be careful who you drive into when you are in a tank, because friend or foe
// > it'll give them a nasty knock.
//
// > The troop carriers can be handy for picking up a group of your chums…
// > just drive into one of your team-mates and he will oblige by jumping in
// > with you.
//
// `Pig::OnHit`'s arm for a body of type 0x1358 (0x478061) is the gate, and it
// is four refusals before anything happens: the pig hit must not BE the driver,
// the driver must be in a vehicle, it must be THIS vehicle, and
// **`[veh+0xC0]` — the motion register — must be non-zero.** A parked vehicle
// touches nobody. Then it switches on the kind through the five-entry table at
// 0x478580, and the split is exactly capacity: AMLAUNCH and CARRY, the two that
// hold ten, take 0x4781F3; AM_TANK, BOAT and TANK take 0x4780BB.
//
// Pure, game space, Y-down.

import { PIG_RADIUS } from './obstacles'
import type { Obstacle } from './obstacles'
import { hurt, isDead } from './health'
import { originY } from './body'
import { vehicleCarries } from './vehicles'
import type { Pig } from './game'
import type { Emit } from './events'
import type { Velocity } from './tumble'

/**
 * **Twenty points**, which is a rifle round — `push 0xA00` into the pig's own
 * `vtable+0x34` at 0x4781A5, in the engine's 128ths.
 */
export const RAM_DAMAGE = 2560

/**
 * …and the throw behind it: `0x4781C9` pushes **0x78 = 120** units a frame at
 * **0x200**, forty-five degrees up, along the bearing from the hull to the pig.
 *
 * For scale, a rifle bullet's own shove is 48 and a knife's 125. Being run
 * over is very nearly the hardest single knock in the game that is not a
 * blast.
 */
export const RAM_SHOVE = 120

/** The angle it throws at, in the 4096-unit circle — 0x200 is 45°. */
export const RAM_RISE = 0x200

/**
 * How far outside the hull counts as being hit.
 *
 * `[remake]`: the exe asks its physics world, which reports a CONTACT between
 * two bodies and has the pig's own shape to do it with. Here the hull is a box
 * and the pig a radius, so the box is grown by one.
 */
export const RAM_REACH = PIG_RADIUS

/** Whether this pig is inside the hull's footprint, in the box's own frame. */
export function rammed(box: Obstacle, pig: Pig): boolean {
  const dx = pig.position.x - box.x
  const dz = pig.position.z - box.z
  const cos = Math.cos(box.turn)
  const sin = Math.sin(box.turn)
  const localX = dx * cos - dz * sin
  const localZ = dx * sin + dz * cos
  return (
    Math.abs(localX) <= box.halfX + RAM_REACH && Math.abs(localZ) <= box.halfZ + RAM_REACH
  )
}

export interface RamWorld {
  pigs: () => Pig[]
  training: boolean
  /** Throw a pig — the blast's own hook, and the same one (lib/game/tumble.ts). */
  fling?: (pig: Pig, velocity: Velocity) => void
  /** Put a pig INSIDE the vehicle. False when it would not fit — a carrier
   * holds ten and the tenth is the last (lib/game/indoors.ts). */
  board?: (pig: Pig) => boolean
  /**
   * Whether this pig is on the DRIVER's own side.
   *
   * A predicate rather than a field, because this engine keeps the side on the
   * player and not on the pig — where the exe has `[pig+0x194]` to compare
   * (0x4781F9). Only a carrier asks: a tank knocks **friend or foe**.
   */
  friendly?: (pig: Pig) => boolean
}

/** What one frame of a MOVING hull did to whoever it touched. */
export interface RamOutcome {
  /** Pigs knocked flying, with what they took. */
  struck: number[]
  /** …and pigs a carrier took aboard. */
  boarded: number[]
}

/**
 * Run the hull over whoever is under it.
 *
 * Call this only on a frame the vehicle actually MOVED — that is the exe's own
 * `[veh+0xC0]` test and it is the difference between a tank and a wall.
 *
 * `driver` is the pig at the controls: it is never its own victim, and for a
 * carrier it is whose SIDE decides. The exe compares `[pig+0x194]` against the
 * driver's (0x4781F9) and refuses a pig from the other team outright — so a
 * carrier picks up chums and nobody else, where a tank knocks **friend or
 * foe**, which the manual says in those words.
 */
export function ramOver(
  box: Obstacle,
  kind: number,
  driver: Pig,
  world: RamWorld,
  emit: Emit
): RamOutcome {
  const out: RamOutcome = { struck: [], boarded: [] }
  const carries = vehicleCarries(kind)
  for (const pig of world.pigs()) {
    if (pig === driver || isDead(pig)) continue
    if (!rammed(box, pig)) continue
    const at = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
    if (carries) {
      // Same side only, which is the whole of what separates being picked up
      // from being run over.
      if (!(world.friendly?.(pig) ?? false)) continue
      if (world.board?.(pig)) out.boarded.push(pig.id)
      continue
    }
    const outcome = hurt(pig, RAM_DAMAGE / 128, world.training)
    emit({ kind: 'damaged', at, amount: RAM_DAMAGE / 128, pig: pig.id, blow: true })
    if (outcome === 'died' || outcome === 'gibbed')
      emit({ kind: 'killed', pig: pig.id, by: driver.id, gibbed: outcome === 'gibbed' })
    // Away from the hull, at forty-five degrees — the bearing the exe takes
    // from the vehicle to the pig.
    const dx = pig.position.x - box.x
    const dz = pig.position.z - box.z
    const away = Math.hypot(dx, dz) || 1
    const flat = Math.cos((RAM_RISE / 4096) * 2 * Math.PI) * RAM_SHOVE
    world.fling?.(pig, {
      vx: (dx / away) * flat,
      vy: -Math.sin((RAM_RISE / 4096) * 2 * Math.PI) * RAM_SHOVE,
      vz: (dz / away) * flat
    })
    out.struck.push(pig.id)
  }
  return out
}

/**
 * **Whether this frame's ram counts as the turn's BLOW** — and therefore ends
 * the turn, the way firing a weapon does.
 *
 * Play, of driving into somebody: "будет урон и конец хода — считается
 * атакой." Nothing about a ram goes through `attack.ts` — there is no skill in
 * hand, no `used` answer and the fire ladder never runs — so the rule has to
 * be stated here or it would silently not exist.
 *
 * **Picking a chum up is not a blow**, and the manual is the reason: "the
 * troop carriers can be handy for picking up a group of your chums and driving
 * them all across the map in one go." A group, in one go — so the first pickup
 * cannot be the end of the turn. `[play]` + `[manual]`.
 */
export const ramWasAttack = (out: RamOutcome): boolean => out.struck.length > 0
