// What a brain may ask for — the whole vocabulary of the machine's hands.
//
// An order is a WISH, not a write: the brain never touches the world. The
// actuator (lib/game/actuator.ts) works each order out through the same
// verbs the player's keys write — the same walk speed, the same turn rate,
// the same gauge-by-held-time — so the machine physically cannot do anything
// a player could not (docs/ai.md). Orders are macro-sized on purpose: "walk
// THERE", not "stick forward this frame", so a brain reads as tactics and
// the frame-by-frame steering stays the actuator's business.

// There is no "wait" and no "begin" here on purpose: pacing is THEATRE, not
// thought. The seat itself reads the GET READY card out and mulls between
// decisions (lib/game/battle.ts, AI_START_SECONDS / AI_MULL_SECONDS) — a
// brain only ever says what it WANTS.

/** One wish. The actuator carries it out over as many steps as it takes. */
export type Order =
  /** Take a skill in hand (or put it away with null) — what the player's
   * skill menu writes. SKIP TURN in hand is the THINKING pose. */
  | { kind: 'hold'; skill: number | null }
  /** Walk to a point, steering with the tank controls on the way. Finishes
   * `blocked` when the legs stop making progress — a wall, a pig, a wedge. */
  | { kind: 'walkTo'; x: number; z: number }
  /** Turn on the spot to face a heading, radians in the engine's own frame
   * (0 is +z, positive toward +x — lib/game/movement.ts). */
  | { kind: 'turnTo'; heading: number }
  /** Pitch the weapon to an angle, in aim units (lib/game/aim.ts, 4096 a
   * turn, +1023..-1023). Finishes `blocked` when the clamp refuses it. */
  | { kind: 'aimTo'; angle: number }
  /** Press fire; for a gauge weapon hold until it reads `charge` (0..1) and
   * let go. A gun answers the press itself, so `charge` is optional and
   * means nothing to one. Firing SKIP TURN is the pass, and firing over a
   * grenade ALREADY IN THE AIR is the hand-detonator — both the player's
   * own roads (lib/game/battle.ts). */
  | { kind: 'fire'; charge?: number }
  /** Nothing THIS beat — the brain is watching something develop (a thrown
   * grenade rolling home) and wants asking again after the seat's mull.
   * Tactical, not theatre: the wait has a subject. */
  | { kind: 'watch' }
