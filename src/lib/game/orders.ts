// What a brain may ask for — the whole vocabulary of the machine's hands.
//
// An order is a WISH, not a write: the brain never touches the world. The
// actuator (lib/game/actuator.ts) works each order out through the same
// verbs the player's keys write — the same walk speed, the same turn rate,
// the same gauge-by-held-time — so the machine physically cannot do anything
// a player could not (docs/ai.md). Orders are macro-sized on purpose: "walk
// THERE", not "stick forward this frame", so a brain reads as tactics and
// the frame-by-frame steering stays the actuator's business.

/** One wish. The actuator carries it out over as many steps as it takes. */
export type Order =
  /** Stand for this long — the thinking pause, the card being read. */
  | { kind: 'wait'; seconds: number }
  /** Answer the GET READY card, the way any key does for a player. */
  | { kind: 'begin' }
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
   * let go. A gun answers the press itself and `charge` is ignored. Firing
   * SKIP TURN is the pass — the same road the player's skip takes. */
  | { kind: 'fire'; charge: number }
