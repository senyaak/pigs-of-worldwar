// HIDE — skill 55, the espionage careers' disguise, read end to end
// (`weapons/espionage.md` in the disasm repo, 2026-08-27).
//
// The pig does not fade: it BECOMES A BUSH. `Pig::SetHidden` (0x47D080)
// stops the pig being submitted to the renderer at all — no model, no name
// plate, no scanner blip — and stands a DECOY scenery object where it was:
// the nearest disguisable prop within 0x2000 (8192) units, out of a fixed
// list of model names (filter 0x47D450), **CRATE4 when nothing is near**.
// The flag `[pig+0x3B2]` is what `Team::BuildTargetList` (0x44A7D0) skips —
// a hidden pig cannot be targeted — and a melee strike on one diverts whole
// to a KNOCK ON WOOD, no damage (lib/game/strikes.ts).
//
// The flag's writers are enumerated in the read, and its life is short:
// - it drops BY ITSELF at the start of the pig's own next turn — the same
//   per-turn pass that ticks the poison (0x470425 in 0x4703A0). The
//   duration is ONE ROUND, and using it ENDS the turn (record +0x1C/+0x1D);
// - any damage reveals (TakeDamage's tail), a blast reveals, any
//   knockdown/fling reveals (0x470C80), death reveals;
// - MADNESS gas knocks it off (0x477A3B) — that status is not built;
// - the exe's AI espionage pigs START the battle hidden (the Map::Load tail
//   sweep, 0x47D790) — mirrored at engine build.
//
// Two deliberate departures, both said here:
// - the exe hides at the END of a gesture clip (81); this hides AT THE
//   PRESS. The turn ends with the use and the walk-away beat dresses every
//   pig — a gesture on a body that is about to stop being drawn buys
//   nothing, and holding the turn open for it buys a beat of machinery.
//   `[deliberate]`.
// - the exe's decoy SOAKS damage before the pig (its own hit points,
//   unread) — here the decoy is art, damage lands on the pig and reveals
//   it. `[gap]` until the decoy's HP is read.
//
// Pure, like the rest of lib/game.

import { amountOf, spend } from './inventory'
import { SKILL } from './skills'
import type { MapObject } from '../formats/pog'
import type { Emit, PigId } from './events'
import type { Pig } from './game'

/**
 * The models a pig may pass for — the filter 0x47D450's own list, BY NAME
 * (the exe checks model ids 42, 104-106, 109-115; these are their names in
 * the shipped archives, the same convention every name table in this engine
 * uses, lib/game/endOfGame.ts).
 */
export const DISGUISE_MODELS = new Set([
  'CRATE4',
  'BUSH1',
  'BUSH2',
  'BUSH3',
  'TREEB',
  'TREEG',
  'TREEP',
  'TREEPA',
  'TREEW',
  'CACTUS',
  'CACT2'
])

/** How far the disguise scout looks — 0x2000, sixteen tiles. */
export const DECOY_REACH = 8192

/** …and what a pig passes for when nothing is near: the exe's own fallback. */
export const DECOY_FALLBACK = 'CRATE4'

/** The nearest disguisable prop's model name, or the crate. */
export function nearestDisguise(
  objects: MapObject[],
  at: { x: number; z: number }
): string {
  let name = DECOY_FALLBACK
  let nearest = DECOY_REACH
  for (const object of objects) {
    if (!DISGUISE_MODELS.has(object.name.toUpperCase())) continue
    const away = Math.hypot(object.x - at.x, object.z - at.z)
    if (away >= nearest) continue
    nearest = away
    name = object.name.toUpperCase()
  }
  return name
}

/** One standing disguise — what the renderer draws instead of the pig.
 * `y` is the pig's SOLES; the art lifts by the model's own extent, the way
 * the boots do (three/decoyArt.ts). */
export interface Decoy {
  pig: PigId
  model: string
  x: number
  y: number
  z: number
  yaw: number
}

export interface Hides {
  /** Take the disguise: the pig vanishes and the prop stands up. False when
   * already hidden. The turn's end is the caller's — the record says the use
   * spends it (lib/game/spend.ts). */
  begin(pig: Pig): boolean
  /** Shed it — damage, a fling, death, or the wearer's own next turn.
   * Idempotent; quiet when the pig was not hiding. */
  reveal(pig: PigId): void
  /** The acting pig's own turn has begun: the exe's per-turn pass drops the
   * disguise unconditionally (0x470425). Called at the handover, beside the
   * poison's tick. */
  turnStarted(pig: Pig): void
  /** Every disguise standing — what the snapshot carries. */
  decoys(): readonly Decoy[]
  clear(): void
}

export interface HideWorld {
  pigs: () => Pig[]
  /** The map's own records — where the disguise scout looks. */
  objects: MapObject[]
}

export function createHide(world: HideWorld, emit: Emit): Hides {
  const standing = new Map<number, Decoy>()

  const reveal = (pig: PigId): void => {
    if (!standing.delete(pig)) return
    const one = world.pigs().find((each) => each.id === pig)
    if (one) one.hidden = false
    emit({ kind: 'revealed', pig })
  }

  return {
    begin(pig) {
      if (pig.hidden) return false
      // The generic charge — moot for the Scout's unlimited slot, honest for
      // anyone who found one in a crate.
      spend(pig.carrying, SKILL.HIDE)
      pig.hidden = true
      standing.set(pig.id, {
        pig: pig.id,
        model: nearestDisguise(world.objects, pig.position),
        x: pig.position.x,
        y: pig.position.y,
        z: pig.position.z,
        yaw: pig.heading
      })
      emit({ kind: 'hid', pig: pig.id })
      return true
    },
    reveal,
    turnStarted(pig) {
      if (pig.hidden) reveal(pig.id)
    },
    decoys: () => [...standing.values()],
    clear() {
      for (const decoy of standing.values()) {
        const one = world.pigs().find((each) => each.id === decoy.pig)
        if (one) one.hidden = false
      }
      standing.clear()
    }
  }
}

/** Whether this pig would start the battle hidden — the exe's Map::Load tail
 * sweep (0x47D790): a MACHINE side's pig holding HIDE. Asked by the engine
 * at build, once per pig. */
export const startsHidden = (pig: Pig, machineSide: boolean): boolean =>
  machineSide && amountOf(pig.carrying, SKILL.HIDE) !== 0
