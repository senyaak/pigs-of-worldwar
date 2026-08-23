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
  /** A blade going through the air, before it reaches anything. */
  | { kind: 'whoosh' }
  /** …and it landed on a body: the weapon's own impact noise and its rings. */
  | { kind: 'struck'; skill: number; at: Point }
  /** Something took points here — the number that floats off it. `pig` is
   * present when the body is a PIG — the hurt noise is his; a dummy or a
   * prop takes its points in silence (audio/battleAudio.ts). */
  | { kind: 'damaged'; at: Point; amount: number; pig?: PigId }
  /** This pig has just gone down. `by` is the pig whose weapon did it — the
   * bullet's firer, the lob's thrower, the blade's swinger — the same attacker
   * the exe's damage handler tallies kills against (0x467c30, 0x467E11).
   * Water, a minefield and the nowhere-to-swim drown have no attacker and
   * carry none. `gibbed` is the messier death — sixty points PAST dead
   * (lib/game/health.ts, GIB_BELOW): no dying clip, the body simply goes
   * (lib/game/corpses.ts). */
  | { kind: 'killed'; pig: PigId; by?: PigId; gibbed?: boolean; drowned?: boolean }
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
  /** …or met water: every water contact reports this first, and then which of
   * the two it was (`Projectile::OnHitLandscape`, 0x4377d0). */
  | { kind: 'splashed'; at: Point }
  | { kind: 'skimmed'; at: Point }
  | { kind: 'doused'; at: Point }

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
  /** …or had no room for: "THIS LITTLE PIG ALREADY HAS TOO MANY TOYS". */
  | { kind: 'refused'; skill: number | null; amount: number; pig: PigId }
  /**
   * A PROMOTION POINT taken off the ground — the campaign's own currency,
   * which is a pickup and not a crate (lib/game/pickups.ts). `total` is how
   * many this battle has yielded so far, so the debrief can pay them out
   * without counting anything of its own.
   */
  | { kind: 'promotionPoint'; pig: PigId; total: number }

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
  /** …and something came OUT of it, into the pig's hands. The training
   * ground's script counts these (lib/game/tutorial.ts). */
  | { kind: 'chose'; skill: number }
  /** The acting pig says a firing line, per squad. */
  | { kind: 'bark'; player: number }
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
  | { kind: 'turnBegan'; player: number; computer: boolean; health: number }

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
