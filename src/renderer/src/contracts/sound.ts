// The only two things the scene asks of SOUND, as a contract it can depend on
// without depending on the audio domain.
//
// Everything else the battle plays comes off the event bus, where the audio
// bank is a listener like any other (lib/game/events.ts). These two are not
// events and cannot be: they are POLLS.
//
// `audio/battleSound.ts` implements it; nothing here imports that, or three,
// or anything at all — which is what lets `npm run boundaries` forbid
// `three/ → audio/` outright.

import type { LocomotionState } from '../../../lib/game/locomotion'

export interface SceneSound {
  /**
   * The pig's own noises, fired off the CHANGES in its locomotion state —
   * landing, splashing, scrabbling at a wall. A poll because it is a diff
   * against last frame rather than a moment anything announces.
   */
  follow(loco: LocomotionState, inWater: boolean): void
  /** A new turn: forget what the last pig was doing. */
  reset(): void
  /**
   * The canopies of the opening drop.
   *
   * A poll because the bank loads a beat AFTER the drop has already started,
   * so there is no moment to fire on — only the first frame the sound exists.
   */
  chuteOverhead(running: boolean): void
  /**
   * What a SPEC listens to: the cues played, and the lines the pigs have
   * spoken. A sound is a file being decoded and nothing an assertion can hear,
   * so the debug window reads these instead (three/debug.ts).
   */
  played(): string[]
  spoken(): string[]
  /**
   * Whether the acting pig is still SAYING its firing line.
   *
   * The third poll, and the only one the RULES read: the shot waits for the
   * line to finish (play's rule, `lib/game/shot.ts`). The scene hands it to the
   * battle once a frame; nothing here knows what a battle is.
   */
  saying(): boolean
  /**
   * …and whether the SERGEANT is, which is the other poll the RULES read: the
   * beat between the walk away and the handover lasts exactly as long as his
   * line (lib/game/sergeant.ts).
   */
  sargeSaying(): boolean
  /** Every line of his played, in order — what a spec listens to. */
  sargeSpoken(): string[]
}
