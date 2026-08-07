// The map's script — and it is not a file or a loop. Every POG record may
// carry ONE command, and the objects are the program.
//
// The loader builds the command out of the record's fields and hangs it on the
// object at `+0x48` (exe 0x4a6287); `Object::RunScript` (0x4aa170) runs it when
// the object is FINISHED — a dummy breaking (0x48d972, the last thing its death
// handler does) or a crate being collected (0x464633). So the script is a chain
// of "and then", one link per object.
//
// `../../../pigs-disasm/script/notes.md` is the read.
//
// Pure: records in, verdicts out. WHEN something finishes is the battle's.

import { isPickup } from './obstacles'
import type { MapObject } from '../formats/pog'

/** Field 14 on a record that hands something over — `formats/pog.ts` calls it
 * CARRIES and reads its contents by it. */
export const CRATE = 19

/**
 * The two opcodes the loader answers by taking the object OFF the map:
 * `[obj+0x30] = 0` and the body's no-draw bit set (0x4a62f2). CAMP's field-14
 * of 23 is the one play remembers — the eight dummies and the whole second
 * bridge, which do not exist until the script places them.
 */
export const ABSENT_OPCODES = [21, 23]

/**
 * The opcodes whose arm is GUARDED — 22 and 23, the ones that run 0x4aa6e7
 * rather than the plain 0x4aa619. Its guard is the first thing it does:
 *
 * ```
 * 4aa6f5  for every other object with a command:
 * 4aa700    if ([other->cmd + 2] == [runner->cmd + 2]) -> place NOTHING
 * ```
 *
 * — `+2` on both sides, so the test is "is anyone else still waiting on the
 * label I waited on". Two dummies raised by the same signal are a PAIR: the
 * first one to fall finds the second still holding its command and does
 * nothing, and the second finds nobody and places the next step. **That is
 * why the sniper rifle wants BOTH near dummies down and not one.**
 */
export const GUARDED_OPCODES = [22, 23]

export interface Command {
  /** The record's own id. */
  id: number
  /** Field 14. */
  opcode: number
  /** The label this object WAITS for — field 15's LOW byte, which the loader
   * puts at `[cmd+2]` and the placer matches on (0x4aa63f). */
  waits: number
  /**
   * The label it SIGNALS when it is finished — field 15's HIGH byte at
   * `[cmd+3]` (0x4aa63c).
   *
   * **Zero on a crate**, and that is the exe and not a simplification: the
   * crate arm of the loader builds `0x4a7130(21, lowByte, 0, …)` and never
   * passes the high one, because on a crate the high byte is the CONTENTS —
   * the skill it carries. One byte, two jobs, told apart by field 14.
   */
  signals: number
  /**
   * Whether it comes down under a canopy rather than simply appearing.
   *
   * The placer's own test is the waiting object's BODY TYPE: `0x135b` gets
   * lifted 0xC00 above the thing that signalled and falls, anything else is
   * just switched on (0x4aa64a). 0x135b is what the PICKUP constructor writes
   * (0x4641bd) — so it is the crates, and only the crates, that parachute in.
   */
  parachute: boolean
}

/** The command a record carries, or null for the ones that carry none. */
export function commandOf(object: MapObject): Command | null {
  const opcode = object.fields[14]
  if (!opcode) return null
  const label = object.fields[15]
  return {
    id: object.id,
    opcode,
    waits: label & 0xff,
    signals: opcode === CRATE ? 0 : (label >> 8) & 0xff,
    parachute: isPickup(object)
  }
}

/**
 * Whether the map starts without this object on it.
 *
 * The two opcodes are READ. The crate is an INFERENCE and worth saying so:
 * the loader's own hide is only for 21 and 23, but a crate with a wait label
 * gets a command all the same (opcode 21, 0x4a62c2) and the placer's job is
 * to switch it on — which would be nothing to do if it had never been off. A
 * crate with no wait label is on the map from the first frame, which is what
 * CAMP's bayonet crate is.
 */
export function startsAbsent(object: MapObject): boolean {
  const opcode = object.fields[14]
  if (ABSENT_OPCODES.includes(opcode)) return true
  return opcode === CRATE && (object.fields[15] & 0xff) !== 0
}

/** What one signal puts on the map. */
export interface Placement {
  id: number
  parachute: boolean
}

export interface MapScript {
  /** Whether this record is still off the map. */
  absent(id: number): boolean
  /** Every id that starts off it. */
  waiting(): number[]
  /**
   * Object `id` has finished — it broke, or it was collected. Returns what
   * that puts on the map, which is every absent object waiting on the label
   * this one signals.
   *
   * The exe walks the whole object list and places EVERY match rather than
   * the first, which is how CAMP's second bridge arrives — seven records, all
   * waiting on the same 6 (`../../../pigs-disasm/script/notes.md`).
   *
   * Empty is a perfectly ordinary answer: an object whose arm is guarded and
   * whose partners are still standing places nothing at all.
   */
  finish(id: number): Placement[]
}

export function createScript(objects: MapObject[]): MapScript {
  const commands = new Map<number, Command>()
  const absent = new Set<number>()
  /**
   * Objects whose command no longer counts — the exe's `[obj+0x48] == 0`.
   *
   * Two things spend one. Placing a PICKUP clears the crate's own command
   * (0x4aa6d0, and note the branch: the dummy path jumps over that line at
   * 0x4aa659, so a placed DUMMY keeps its script and goes on to signal —
   * which is the whole of how the chain runs more than one step deep). And
   * finishing something takes it off the object list altogether, which the
   * guard below cannot tell from a spent command and does not need to.
   */
  const spent = new Set<number>()
  for (const object of objects) {
    const command = commandOf(object)
    if (command) commands.set(object.id, command)
    if (startsAbsent(object)) absent.add(object.id)
  }

  /** Whether anyone ELSE is still waiting on the label this one waited on. */
  const partnered = (id: number, command: Command): boolean => {
    for (const [other, waiting] of commands) {
      if (other === id || spent.has(other)) continue
      if (waiting.waits === command.waits) return true
    }
    return false
  }

  return {
    absent: (id) => absent.has(id),
    waiting: () => [...absent],
    finish(id) {
      const command = commands.get(id)
      // A label of zero signals nothing. Every crate is one of those, and so
      // is any record the loader gave no command at all.
      if (!command || command.signals === 0) return []
      // Gone, whatever else happens: a broken dummy is off the list before
      // the next one asks who is left.
      spent.add(id)
      // …and the guarded arm waits for the rest of its own group.
      if (GUARDED_OPCODES.includes(command.opcode) && partnered(id, command)) return []
      const placed: Placement[] = []
      for (const [other, waiting] of commands) {
        if (!absent.has(other)) continue
        if (waiting.waits !== command.signals) continue
        absent.delete(other)
        // A placed crate loses its command; a placed dummy keeps it.
        if (waiting.parachute) spent.add(other)
        placed.push({ id: other, parachute: waiting.parachute })
      }
      return placed
    }
  }
}
