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
// The disguise lands at the END of the gesture clip (81), the exe's own
// shape: both espionage skills resolve through the end-of-sequence path
// 0x473600, the clip carrying no event-65 keyframe. It hid AT THE PRESS for
// a while (`[deliberate]`, since revoked in play: "свин тоже анимацию
// делает … а потом только прячется"). The clip's SOUND is decoded now
// (2026-08-28, the DLL's keyframe table + the exe's event switch,
// anim/audio-events.md): two keyframes — phase 1078 a winded breath, gated
// on the fatigue counter `[pig+0x1B8]` being over 201, which this engine
// does not model, so a fresh pig is silent there exactly as in the exe;
// and phase 2310 event 43, a COIN-FLIP FART (P_FART1-3, half the plays
// silent) — `strained` below, the gag the gesture is. And the GAS washes
// over a disguise onto the pig directly — whether the exe's cloud sweep
// catches the decoy body first is unread. `[gap]`.
//
// Pure, like the rest of lib/game.

import { amountOf, spend } from './inventory'
import { SKILL } from './skills'
import { weaponOf } from './weapons'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
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
  /** The press: the charge goes, the gesture clip (81) starts, and the
   * disguise lands at its END. False when already hidden or mid-gesture.
   * The turn's end is the caller's — the record says the use spends it
   * (lib/game/spend.ts). */
  begin(pig: Pig): boolean
  /** Take the disguise NOW, no gesture — the Map::Load tail sweep's own
   * instant path (0x47D790): the enemy's spies start the battle hidden and
   * nobody is watching them do it. */
  concealNow(pig: Pig): boolean
  /** Whether the gesture clip is still holding the pig. */
  running(): boolean
  /** One frame; `actor` is the pig taking cover. */
  update(delta: number, actor: Pig): void
  /** A turn ending or a warp mid-gesture: the disguise lands now — the
   * charge went at the press and the beat must not eat it. */
  reset(actor: Pig): void
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
  /** What times the gesture clip — empty in a bare spec's world, where the
   * disguise then lands at the press. */
  clips: ClipTiming[]
}

/** Where in clip 81 the STRAIN lands — the clip's own second keyframe:
 * phase 2310, event id 43, a coin-flip fart (anim/audio-events.md, read
 * 2026-08-28 out of the DLL's keyframe table). */
export const STRAIN_PHASE = 2310

/** …against the phase scale every clip event is authored in. */
const CLIP_PHASE_UNITS = 4096

export function createHide(world: HideWorld, emit: Emit): Hides {
  const standing = new Map<number, Decoy>()
  /** Seconds left of the gesture clip. */
  let playing = 0
  /** Who owes a disguise — the pig, held from the press to the clip's end. */
  let owing: Pig | null = null
  /** Seconds until the clip's strain keyframe — 0 once fired or none due. */
  let strainIn = 0

  const reveal = (pig: PigId): void => {
    if (!standing.delete(pig)) return
    const one = world.pigs().find((each) => each.id === pig)
    if (one) one.hidden = false
    emit({ kind: 'revealed', pig })
  }

  /** The disguise itself — the pig vanishes and the prop stands up. */
  const conceal = (pig: Pig): void => {
    if (pig.hidden) return
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
  }

  return {
    begin(pig) {
      if (pig.hidden || playing > 0) return false
      // The generic charge — moot for the Scout's unlimited slot, honest for
      // anyone who found one in a crate.
      spend(pig.carrying, SKILL.HIDE)
      const clip = weaponOf(SKILL.HIDE).attackClip
      emit({ kind: 'clip', pig: pig.id, index: clip, once: true })
      playing = clipSeconds(world.clips[clip])
      // The strain rides the clip to its own keyframe, the way the
      // pickpocket's whistle does.
      strainIn = (playing * STRAIN_PHASE) / CLIP_PHASE_UNITS
      owing = pig
      // A bare spec's world has no clips to time: the disguise lands now.
      if (playing <= 0) {
        owing = null
        conceal(pig)
      }
      return true
    },
    concealNow(pig) {
      if (pig.hidden) return false
      spend(pig.carrying, SKILL.HIDE)
      conceal(pig)
      return true
    },
    running: () => playing > 0,
    update(delta, actor) {
      if (playing <= 0) return
      if (strainIn > 0) {
        strainIn -= delta
        if (strainIn <= 0) {
          strainIn = 0
          emit({ kind: 'strained', pig: actor.id })
        }
      }
      playing -= delta
      if (playing > 0) return
      playing = 0
      owing = null
      conceal(actor)
    },
    reset(actor) {
      if (owing !== null) conceal(owing ?? actor)
      owing = null
      playing = 0
      strainIn = 0
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
