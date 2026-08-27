// What the battle ANNOUNCES, and the bus it announces on.
//
// The engine decides what happens; it does not know what any of it looks or
// sounds like. Every module of it — the bullets, the grenades, the blade, the
// crates, the descents, the frame itself — emits into one stream, and whoever
// is presenting the battle subscribes: the renderer for the art, the audio
// bank for the noise, and nothing stops a third listener (a replay log, a
// network mirror) from being added without any of them knowing.
//
// Before this, each module took its own object of callbacks and the SCENE
// filled them in — which meant the renderer was also where every sound in the
// game got played, and graphics and audio could not be separated at all.
//
// Positions are game space (Y-down).

import type { Point } from './pose'
import type { Order } from './orders'
import type { Thought } from './ai'
import type { Outcome, Refusal } from './actuator'

/**
 * A pig, as it travels: its id and nothing else (lib/game/game.ts).
 *
 * Everything on this bus is DATA. It used to carry `Pig` and `Target` objects,
 * which is free in one process and impossible across a port — and the moment
 * one listener held a live object it could reach past what it was told and
 * change the battle.
 */
export type PigId = number

export type BattleEvent =
  // ——— weapons ———
  /** A gun went off: the report is per weapon. */
  | { kind: 'fired'; skill: number }
  /** The weapon went AWAY — the turn's end holsters whatever was still in
   * hand (lib/game/battle.ts, `endTurnBeat`). The sound is S_UNHOLS
   * (audio/battle.ts). */
  | { kind: 'holstered'; pig: PigId }
  /** A blade going through the air, before it reaches anything. */
  | { kind: 'whoosh' }
  /** …and it landed on a body: the weapon's own impact noise and its rings. */
  | { kind: 'struck'; skill: number; at: Point }
  /** …and a swing that caught NOTHING — the blade's own miss, which is what
   * `I_SWMISS` is (audio/battle.ts). `at` is where the swinger stands. */
  | { kind: 'swungWide'; at: { x: number; z: number } }
  /** Something took points here — the number that floats off it. `pig` is
   * present when the body is a PIG — the hurt noise is his; a dummy or a
   * prop takes its points in silence (audio/battleAudio.ts). */
  | {
      kind: 'damaged'
      at: Point
      amount: number
      pig?: PigId
      structure?: boolean
      /** A METAL thing took it — a gun, a machine, a drum — which is what
       * `I_METAL` is (play: "взрыв по танку, пушке и прочему"). */
      metal?: boolean
    }
  /** This pig has just gone down. `by` is the pig whose weapon did it — the
   * bullet's firer, the lob's thrower, the blade's swinger — the same attacker
   * the exe's damage handler tallies kills against (0x467c30, 0x467E11).
   * Water, a minefield and the nowhere-to-swim drown have no attacker and
   * carry none. `gibbed` is the messier death — sixty points PAST dead
   * (lib/game/health.ts, GIB_BELOW): no dying clip, the body simply goes
   * (lib/game/corpses.ts). */
  | { kind: 'killed'; pig: PigId; by?: PigId; gibbed?: boolean; drowned?: boolean }
  /** …and now — everything at rest, everyone out of the water — its DYING
   * CLIP has started (lib/game/corpses.ts). The moment is the exe's own state
   * 6 → 7 edge: death at `killed` is a state change and a ragdoll, the dying
   * is played out here, later. `wet` is the sink-and-drown arm — what the
   * audio hangs the drown gurgle on. The DEATH LINE is the pig's OWN
   * (`voice`), spoken in the tongue `player` picks — the same pair `bark`
   * carries (audio/pigVoice.ts). */
  | { kind: 'dying'; pig: PigId; player: number; voice: number; wet: boolean }
  /** …and its body is DONE: the corpse has blown up (or been overkilled away)
   * and what is left on the spot is a pair of boots (lib/game/corpses.ts).
   * `at` is the soles, `heading` the way the pig faced — where and which way
   * the boots stand. The pig stops being drawn from here. */
  | { kind: 'remains'; pig: PigId; at: Point; heading: number }
  /** Something went off here, and WHICH effect id it spawns: a grenade and a
   * mine do not look alike (lib/game/blast.ts, `Charge.effect`). */
  | { kind: 'blasted'; at: Point; effect: number }
  /** A pig was THROWN — a blast's, a melee's or an eject's fling, with the
   * velocity it left at (game space, up is −Y). Announced at the one seam
   * every throw crosses (lib/game/battle.ts `fling`), and put on the bus for
   * telemetry first: play reported flings that visibly went nowhere, and a
   * session log that says what the launch actually was settles in one line
   * what three headless probes could not. */
  | { kind: 'flung'; pig: PigId; at: Point; vx: number; vy: number; vz: number }
  /** A BULLET is done, wherever it ended — a body, the ground, a box, or the
   * end of its reach (lib/game/bullets.ts). What the beat after a blow hangs
   * off for a gun: the exe's wait runs after EVERY weapon use, not only the
   * ones that break something (`turns/aftermath.md`). */
  | { kind: 'shotLanded'; at: Point; hit: 'flesh' | 'hard' | 'air' }
  /** This pig has JUMPED INTO a building, and stops being drawn from here
   * (lib/game/indoors.ts). */
  | { kind: 'wentIn'; pig: PigId; building: number }
  /** …and back out onto the spot it jumped from. */
  | { kind: 'cameOut'; pig: PigId; building: number }
  /** A pig has just found a MINE with its foot. The CLICK, not the bang — the
   * blast is four tenths of a second behind it and arrives as `blasted` like any
   * other (lib/game/mines.ts). */
  | { kind: 'mineTripped'; at: Point }
  /** A LAID mine finished arming — the L_MINETR click off the projectile
   * state machine (0x43699d), before it beds into the ground
   * (lib/game/mines.ts). */
  | { kind: 'mineArmed'; at: Point }
  /** …or met water: every water contact reports this first, and then which of
   * the two it was (`Projectile::OnHitLandscape`, 0x4377d0). */
  | { kind: 'splashed'; at: Point }
  | { kind: 'skimmed'; at: Point }
  | { kind: 'doused'; at: Point }
  /** A GAS canister opened its valve — frame 15 of the flight, where the exe
   * starts BG_GAS on the projectile (0x4365e8). Once per throw; the hiss
   * itself is a POLL like the fuse's tick (contracts/sound.ts). */
  | { kind: 'gasStreaming'; at: Point }
  /** …one little cloud let go — every 5th frame while the canister lives, and
   * once more at the pop (lib/game/gas.ts). The picture, not the touch. */
  | { kind: 'gasPuffed'; at: Point }
  /** …and the canister's own end: one last puff and a pop — the exe plays
   * I_BULIT1 at half volume there (0x432d83) and there is NO blast. */
  | { kind: 'gasPopped'; at: Point }
  /** The gas TOUCHED this pig — the once-per-throw service: fifteen points
   * flat, the Sneeze, and the poison bit (lib/game/gas.ts). The damage
   * itself rides `damaged` as usual; this is the moment for anything that
   * wants the cough. */
  | { kind: 'gassed'; pig: PigId; at: Point }
  /** …and the POISON went ON — the status newly set, not a refresh
   * (lib/game/poison.ts). Ten points at every one of this pig's own turns
   * until something heals it. */
  | { kind: 'poisoned'; pig: PigId }
  /** A POCKET was PICKED: the whole slot crossed, the victim none the wiser
   * — no reaction is the exe's own shape (lib/game/pickpocket.ts). The
   * thief's laugh hangs here (P_LAUGH1-3 at 60, the arm's own roll). */
  | { kind: 'stole'; thief: PigId; victim: PigId; skill: number; amount: number }
  /** …or came up empty: nobody in the cone (`reach` — "Your arms don't
   * reach that far...") or a victim with nothing left (`nothing`). P_OWW,
   * the exe's own two exits. */
  | { kind: 'stealFailed'; pig: PigId; at: Point; reason: 'reach' | 'nothing' }

  // ——— the map ———
  /** Something on it has been knocked down. */
  | { kind: 'broke'; target: number; at: Point }
  /** Whether a record's art is on the map at all. */
  | { kind: 'shown'; id: number; visible: boolean }
  /** …and this one is gone for good: collected. */
  | { kind: 'taken'; id: number }
  /** The script has just PUT a crate on the map — what it holds, before it has
   * come down. The training ground's own script speaks off this and nothing
   * else (lib/game/tutorial.ts); `shown`/`crateSent` say the same moment for
   * the art. */
  | { kind: 'placed'; id: number; skill: number | null; amount: number }
  /** A crate the pig walked into — `given` is what it actually got. */
  | { kind: 'collected'; skill: number | null; amount: number; given: number; pig: PigId }
  /** …and points went BACK in: the number floats off the pig and it sighs.
   * `Pig::Heal` (0x467fd0) is not silent — it shows the same floating number a
   * hit does and plays a sound of its own (damage/notes.md). */
  | { kind: 'healed'; at: Point; amount: number; pig: PigId }
  /** The HEALING HANDS going ON — the act itself, before any points move.
   * The exe plays P_HEAL here, at the charge's own decrement (0x47be0f);
   * the points land later, at the clip's own beat (lib/game/healing.ts,
   * HEAL_PHASE). `at` is the healer. */
  | { kind: 'healBegan'; pig: PigId; at: Point }
  /** …and a press with nothing to lay on — nobody in the cone, or a body at
   * its ceiling: the exe's failure exit plays P_OWW (0x47c6f0) and spends
   * nothing. `at` is the healer. */
  | { kind: 'healFailed'; pig: PigId; at: Point }
  /** …or had no room for: "THIS LITTLE PIG ALREADY HAS TOO MANY TOYS". */
  | { kind: 'refused'; skill: number | null; amount: number; pig: PigId }
  /**
   * A PROMOTION POINT taken off the ground — the campaign's own currency,
   * which is a pickup and not a crate (lib/game/pickups.ts). `total` is how
   * many this battle has yielded so far, so the debrief can pay them out
   * without counting anything of its own.
   */
  /** `id` is the map object's own - a SPECIAL BONUS medal is recorded
   *  against it, so a replay knows which one is still out there. */
  | { kind: 'promotionPoint'; pig: PigId; id: number; total: number }

  // ——— things coming down ———
  /** A crate is on its way: the aeroplane, and a canopy to hang over it. */
  | { kind: 'crateSent'; id: number }
  /** …its canopy opened, a beat behind the plane. */
  | { kind: 'crateChuted'; id: number }
  /** …and it is down. */
  | { kind: 'crateLanded'; id: number; at: Point }
  /** A pig arrives by parachute: hang one over it. */
  | { kind: 'dropOpened'; pig: PigId }
  /** …cut, by the ground or by the player. */
  | { kind: 'dropCut'; pig: PigId }
  /** …and it has touched down. */
  | { kind: 'dropLanded'; pig: PigId }
  /** Every canopy still up goes now: the jump key. */
  | { kind: 'canopiesCut' }

  // ——— the frame ———
  /** Wear this clip; `once` plays it through and holds the last frame. */
  | { kind: 'clip'; pig: PigId; index: number; once: boolean }
  /**
   * A HOOF has landed — the clip's own key-frame event, not a timer
   * (lib/game/footsteps.ts). `surface` is the tile's terrain type, which is
   * what picks the sound: the exe's footstep handler switches on exactly that
   * and plays one of the bank's thirteen `FT_*` (audio/battle.ts).
   *
   * The mix is on the event because the exe authors it per row: `foot` 0/1/2
   * is which hoof and pitches it, `soft` is the quiet arm.
   */
  | { kind: 'stepped'; at: Point; surface: number; foot: number; soft: boolean }
  /** Put the camera behind the pig NOW — it teleports rather than flying. */
  | { kind: 'cameraReset' }
  /** SKIP TURN was used. */
  | { kind: 'skillUsed' }
  /**
   * The turn's CLOCK ran out with no weapon used all turn — the exe counts them
   * in `[gameMode+0x334]` and the training ground has a line for it
   * (lib/game/tutorial.ts). Only where there is a script to say it.
   */
  | { kind: 'turnWasted' }
  /** The turn clock has crossed its HURRY mark (lib/game/turns.ts,
   * `CLOCK_WARNING`) — once a turn, and what S_CLOCK sounds on. */
  | { kind: 'clockLow'; secondsLeft: number }
  /**
   * THE MISSION IS OVER — asked at the handover and nowhere else, which is where
   * the exe asks it (lib/game/endOfGame.ts). `turns` is how many were played, and
   * the training ground's sergeant picks his closing line by it.
   */
  | { kind: 'missionOver'; won: boolean; turns: number }
  /** …and the beat that showed it has run out: put the battle away. */
  | { kind: 'missionEnded' }
  /**
   * The pig's inventory came open — R, and it drives in from the right.
   *
   * `first` is what sits in the menu's FIRST CELL, or null for an empty one:
   * the training ground's script reads exactly that (lib/game/tutorial.ts), and
   * so does the exe, off the very same place — the cells ARE the game object's
   * first 0x300 bytes.
   */
  | { kind: 'menuOpened'; first: number | null }
  /** …and the CURSOR stepped inside it — the tick the highlight moves on.
   * Play: "нет звука когда в инвентаре перемещаешь выделение вообще". */
  | { kind: 'menuMoved' }
  /** …and something came OUT of it, into the pig's hands. The training
   * ground's script counts these (lib/game/tutorial.ts). */
  | { kind: 'chose'; skill: number }
  /** The acting pig says a firing line — in ITS OWN voice (`voice`, 1..9)
   * and its side's tongue, which `player` picks (audio/pigVoice.ts). */
  | { kind: 'bark'; player: number; voice: number }
  /**
   * THE SERGEANT SAYS SOMETHING — a section and a line of
   * `Speech/Sku1/Sarge/` (lib/game/sergeant.ts).
   *
   * The one this engine emits is the end-of-turn remark: well done for a KILL
   * while your side leads, commiserations for a LOSS while it trails. The
   * other nineteen sections are decoded and unbuilt.
   */
  | { kind: 'sergeant'; section: number; line: number }
  /**
   * A TURN HAS BEGUN — the exe's mode 4 going up, the GET READY card, and the
   * one moment two different noises hang off (audio/battleSound.ts).
   *
   * The mode's entry runs `Pig::React(7)` on the acting pig (0x4911f8) and
   * then splits on whose controller it is (`cmp eax,2` at 0x49120b): the LOCAL
   * HUMAN's pig only grunts, and the side's music steps instead; anybody
   * else's SAYS a line, picked off its own health.
   *
   * `computer` is that split — whoever is not on the keyboard this turn — and
   * `health` is the acting pig's, which is what chooses the line.
   */
  | { kind: 'turnBegan'; player: number; computer: boolean; health: number; voice: number }
  /**
   * THE MACHINE DECIDED SOMETHING — the AI seat's one announcement, made per
   * decision (about once a second, lib/game/battle.ts's machine block).
   *
   * Telemetry first, like `flung` before it: play reports the machine "acting
   * stupid" and a session log that shows what it weighed and what refused it
   * settles in one line what watching the screen cannot. `previous`/`refusal`
   * are how the LAST order ended (the brain's `blocked` cue and the wall it
   * hit); `order` is what it wants now; `thought` is the account — the ladder
   * rung, every candidate priced, the winner (lib/game/ai.ts). Nothing in the
   * engine listens to this; it must never steer play.
   */
  | {
      kind: 'aiDecided'
      pig: PigId
      name: string
      at: Point
      heading: number
      health: number
      previous: Outcome | null
      refusal: Refusal | null
      order: Order
      thought: Thought | null
    }

/** What a module of the engine is handed: somewhere to say what happened. */
export type Emit = (event: BattleEvent) => void

export interface BattleBus {
  emit: Emit
  /** Listen. Returns a function that stops listening. */
  on(listener: Emit): () => void
}

export function createBus(): BattleBus {
  const listeners: Emit[] = []
  return {
    emit(event) {
      // Iterated over a copy: a listener that unsubscribes on the event it is
      // handling must not shift the ones behind it.
      for (const listener of [...listeners]) listener(event)
    },
    on(listener) {
      listeners.push(listener)
      return () => {
        const at = listeners.indexOf(listener)
        if (at >= 0) listeners.splice(at, 1)
      }
    }
  }
}

/**
 * A listener built from one handler per kind — what both the renderer and the
 * audio bank are. Anything not named is ignored.
 */
export function handling(handlers: {
  [K in BattleEvent['kind']]?: (event: Extract<BattleEvent, { kind: K }>) => void
}): Emit {
  return (event) => {
    const handler = handlers[event.kind] as ((one: BattleEvent) => void) | undefined
    handler?.(event)
  }
}
