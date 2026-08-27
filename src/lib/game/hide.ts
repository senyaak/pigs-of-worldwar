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
// The decoy is REAL COVER — the manual's "extra protection", read to the
// numbers (2026-08-27, the ctor at 0x48D092): its hit points come off the
// generic object-health table at 0x4D6D18 by model id, so what you hide as
// is how much you can take — a CRATE 40 points, a BUSH 50, a TREE or a
// CACTUS 80. What the decoy catches is a PROJECTILE (its damage handler
// 0x48DB58 shows the floating number, and when its health drops under a
// point hands the REMAINDER to the pig and reveals); a BLAST never asks it —
// the blast arm sheds the disguise BEFORE dealing its damage (0x477C2F) —
// and a blade knocks on wood for nothing (lib/game/strikes.ts). `absorb`
// below is that handler; lib/game/bullets.ts is its one caller.
//
// One deliberate departure, said here: the exe hides at the END of a gesture
// clip (81); this hides AT THE PRESS. The turn ends with the use and the
// walk-away beat dresses every pig — a gesture on a body that is about to
// stop being drawn buys nothing. `[deliberate]`. And the GAS washes over a
// disguise onto the pig directly — whether the exe's cloud sweep catches the
// decoy body first is unread. `[gap]`.
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

/**
 * What each disguise can TAKE before it breaks — the object-health table at
 * 0x4D6D18, by model id, in the 128ths the exe counts: 5120, 6400 and 10240
 * over 128. The cover you pick is the cover you get.
 */
export const DECOY_HEALTH: Record<string, number> = {
  CRATE4: 40,
  BUSH1: 50,
  BUSH2: 50,
  BUSH3: 50,
  TREEB: 80,
  TREEG: 80,
  TREEP: 80,
  TREEPA: 80,
  TREEW: 80,
  CACTUS: 80,
  CACT2: 80
}

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
  /** What it has left to take (DECOY_HEALTH). */
  health: number
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
  /**
   * A PROJECTILE arrived on a hidden pig: the decoy takes what it can and
   * the REMAINDER comes back to land on the pig — 0 while the cover holds.
   * A broken decoy reveals (the exe's 0x48DB58/0x48D779). Full damage back,
   * untouched, for a pig that is not hiding.
   */
  absorb(pig: Pig, amount: number): number
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
      const model = nearestDisguise(world.objects, pig.position)
      standing.set(pig.id, {
        pig: pig.id,
        model,
        x: pig.position.x,
        y: pig.position.y,
        z: pig.position.z,
        yaw: pig.heading,
        health: DECOY_HEALTH[model] ?? DECOY_HEALTH[DECOY_FALLBACK]
      })
      emit({ kind: 'hid', pig: pig.id })
      return true
    },
    reveal,
    absorb(pig, amount) {
      if (!pig.hidden) return amount
      const decoy = standing.get(pig.id)
      if (!decoy) return amount
      const took = Math.min(decoy.health, amount)
      decoy.health -= took
      // The number floats off the COVER, the exe's own show (0x48DB58's call
      // to the same spawner a hit uses) — `structure` so it prints without
      // naming a pig nothing can see.
      emit({
        kind: 'damaged',
        at: { x: decoy.x, y: decoy.y, z: decoy.z },
        amount: took,
        structure: true
      })
      if (decoy.health <= 0) reveal(pig.id)
      return amount - took
    },
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
