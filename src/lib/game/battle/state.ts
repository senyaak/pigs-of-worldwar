// The battle's own STATE: everything the frame remembers from one step to
// the next. It was thirty-odd `let`s in one closure; it is one object so that
// the phases of the frame (this folder) can each live in a module of their own.

import type { Aftermath } from '../aftermath'
import type { Carry } from '../doorway'
import type { EndOfGame } from '../endOfGame'
import type { Game, Pig } from '../game'
import { createLocomotion } from '../locomotion'
import type { LocomotionState } from '../locomotion'
import type { MountClass } from '../mounts'
import type { Order } from '../orders'
import { noTally } from '../sergeant'
import type { TurnTally } from '../sergeant'
import type { TerrainQuery } from '../terrain'
import type { WalkAway } from '../walkAway'

export interface BattleState {
  /** Whether the machine plays this turn (`BattleCore.computer`) — LATCHED at
   * the turn's start (`focus`), not re-asked every frame: whose
   * hands a turn is in is decided when it is handed over, so a mid-turn flip
   * of the predicate (`pow.hotseat`) waits for the next turn. Play's call. */
  machineTurn: boolean
  /** The JUMP key, latched for the step that answers it. */
  jumpRequested: boolean
  /** The DOOR key, latched the same way the jump is: it is answered inside the
   * step rather than wherever the input happened to be read (lib/game/indoors.ts). */
  doorRequested: boolean
  /** The pig part-way through the getting-IN clip, or null. It is not inside yet
   * — the clip has to run first (`INOUT_CLIP`, lib/game/buildings.ts) — and until
   * it has, nothing drives it and the turn cannot end. */
  climbing: Pig | null
  /** What the acting pig had chosen last frame — a change is what brings a
   * weapon out. */
  holding: number | null
  /** The seat's two pacing clocks (lib/game/ai.ts): how long the GET READY
   * card has hung, and how long the hands have been free since the last
   * order — both reset at every handover. */
  cardSeconds: number
  mullSeconds: number
  /** What the hands last took — a finished WALK chains straight into the
   * next corner of the route, no mull: the pause between thoughts is
   * theatre, the pause between strides of ONE plan was a stutter (play:
   * "ходил рывками"). */
  lastOrder: Order['kind'] | null
  /** Whether the opening drop was still running LAST step. The FIRST turn's
   * card goes up the frame this falls (`announceTurn`); every later one goes
   * up in `handOver`. */
  wasDropping: boolean
  /** The beat after a kill: the clock stops, the camera stays on the spot. */
  aftermath: Aftermath | null
  /** …and the beat at the END of a turn: the exe's mode 13, WALK AWAY. Nobody
   * is driving and anyone in the water is swimming out (lib/game/walkAway.ts). */
  walkAway: WalkAway | null
  /** …and the one past that: the MISSION being over, the exe's mode 2
   * (lib/game/endOfGame.ts). Once this is set nothing ever clears it — a battle
   * that has ended has ended, and what happens next is whoever is presenting it
   * putting it away. */
  ending: EndOfGame | null
  /** Whether the ending has already asked to be put away, so it asks once. */
  ended: boolean
  /** Who the ending's tour has already cheered — one celebration per pig,
   * fired the frame the camera arrives (the mode-2 block). */
  cheeredPigs: Set<number>
  /** A key pressed during the ending, latched for the step the way the jump is. */
  leaveRequested: boolean
  /** A script step owed to something that has broken, and not run until it has
   * finished breaking. One animation at a time. */
  pending: { id: number; y: number } | null
  /** The pig on its way back OUT of a mount, playing the last of the clip going
   * in plays whole (lib/game/doorway.ts), and which class of mount: the two let go
   * of it differently. */
  leaving: { pig: Pig; mount: MountClass } | null
  /** …and what the door is adding to its position this frame, either way. */
  carry: Carry | null
  /** The footing a pig going IN is leaving behind, kept whole for the door to
   * hand back — the glide's own end is the middle of a box and is not it. */
  doorstep: LocomotionState | null
  /** Whether the weapon in hand has been USED, and so the turn is over as soon
   * as the world it disturbed goes quiet (lib/game/spend.ts). */
  spent: boolean
  /**
   * …and whether a weapon has been used AT ALL this turn.
   *
   * **ONE BLOW A TURN.** Play, of the charges: "можно ставить много тнт подряд — а
   * после первого нельзя использовать оружие." It is the same rule the turn ending
   * is, seen from the side of the two skills that do NOT end it (lib/game/spend.ts):
   * a pig gets one use, and a planted charge spends it without handing the turn
   * over — the four seconds it gives back are for RUNNING, not for a second
   * charge. SKIP TURN is not a weapon and is never refused.
   */
  struck: boolean
  /** Mines laid THIS TURN — the exe's saturating byte at `[game+0x534]`,
   * zeroed every handover (0x48f539): the budget the mine branch below
   * spends. */
  minesLaid: number
  /**
   * How many weapons have been used this turn — the exe's `[gameMode+0x334]`,
   * and the whole of what the training ground's "you did nothing" line hangs on
   * (lib/game/tutorial.ts, `WASTED_TURN_LINE`).
   *
   * Three sites, all of them the exe's: the fire dispatcher increments it
   * (0x493E7A), the handover zeroes it but only from 1 or less (0x48F50C), and
   * the line itself writes **2** — which is the one value the reset refuses, so
   * it is said once a level.
   *
   * The exe also drops the line while the sergeant is still talking
   * (`0x43BB10`), and that half is NOT here: the engine has no speech, and the
   * clock running out is a moment nobody is being spoken to anyway. The listener
   * keeps its own guard (`ui/battle.ts`); what diverges is only that the exe
   * would let a dropped line come round on a later turn.
   */
  weaponUses: number
  /** Seconds left of the getting-it-out clip. */
  readying: number
  /** Seconds the acting pig has stood still, and where it stood. */
  still: number
  stillAt: { x: number; z: number; heading: number }
  /** The acting pig's frame-by-frame state. Reset whenever the acting pig
   * changes or is warped. */
  loco: LocomotionState
  /**
   * WHAT THIS TURN DID, by side — the exe's `[0x537F14]` and `[0x537F18]`,
   * which six separate death sites all step and which are cleared at the START
   * of every turn (0x48FD92). It is what the sergeant's end-of-turn remark is
   * decided by (lib/game/sergeant.ts).
   *
   * A pig that kills its OWN counts for both, because the exe steps the second
   * tally unconditionally after comparing the sides.
   */
  tally: TurnTally
  /** The sergeant's own rotation, one counter a section — the exe steps its
   * byte after the call and wraps past eight (0x498402), so the lines come
   * round in order rather than at random. */
  sargeLines: Map<number, number>
  /**
   * The beat the sergeant's remark holds, between the WALK AWAY and the
   * handover — the exe's state 13 (0x4978CD), which it stays in until the wav
   * is done (0x491192) with a floor of 125 ms under it (0x490CBD).
   *
   * The camera is on the ACTING pig for it: `0x49EC20` takes the current
   * squad's own pig as its subject, which is the one that took the shot, and
   * `0x49F740(3, 1)` is a mode of its own — not the turn's 4.
   */
  sarge: { floor: number } | null
  /** Whether the SERGEANT is still talking — the scene's poll, the same road
   * the firing bark's takes (contracts/sound.ts). */
  sargeSpeaking: boolean
  /** Seconds the BOOTS still hold the end-of-turn beat — set by `remains`,
   * play's own second (see the handler below). */
  bootsFor: number
}

export const createState = (
  game: Game,
  query: TerrainQuery,
  computer: (side: number) => boolean
): BattleState => ({
  machineTurn: computer(game.players.indexOf(game.currentPlayer)),
  jumpRequested: false,
  doorRequested: false,
  climbing: null,
  holding: null,
  cardSeconds: 0,
  mullSeconds: 0,
  lastOrder: null,
  wasDropping: true,
  aftermath: null,
  walkAway: null,
  ending: null,
  ended: false,
  cheeredPigs: new Set<number>(),
  leaveRequested: false,
  pending: null,
  leaving: null,
  carry: null,
  doorstep: null,
  spent: false,
  struck: false,
  minesLaid: 0,
  weaponUses: 0,
  readying: 0,
  still: 0,
  stillAt: { x: 0, z: 0, heading: 0 },
  loco: createLocomotion(query, 0, 0, 0),
  tally: noTally(),
  sargeLines: new Map<number, number>(),
  sarge: null,
  sargeSpeaking: false,
  bootsFor: 0
})
