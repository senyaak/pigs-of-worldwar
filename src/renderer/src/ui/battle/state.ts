// What the battle VIEW remembers: the battle it has up, the tutorial's
// counters, the training ground's step, the pause, and what the battle will
// hand back when it is put away.

import type { Game } from '../../../../lib/game/game'
import { VOLUME_MAX } from '../../../../lib/game/pauseMenu'
import type { PauseState } from '../../../../lib/game/pauseMenu'
import type { TerrainQuery } from '../../../../lib/game/terrain'
import type { Cue } from '../../../../lib/game/tutorial'
import type { BattleSound } from '../../audio/battleSound'
import type { BattleScene } from '../../three/battle'
import type { BattleExit } from '../battle'
import { DEFAULT_MAP } from './open'

export interface UiState {
  game: Game | null
  scene: BattleScene | null
  /** The battle's sound, hung off the same bus the scene listens to. */
  sound: BattleSound | null
  query: TerrainQuery | null
  map: string
  /** What the opening card says on this map — null on a map the game names
   * nothing for (ui/titleCard.ts). */
  title: string | null
  /** `gtext`, the battle's own strings: the mission titles, and 210..237,
   * which are the 28 lines the tutorial speaks. */
  battleText: string[]
  /** Which cues have already been spoken this battle — each fires once. */
  cued: Set<Cue>
  /**
   * The script's own counter, `[gameMode+0x32C]` — zeroed by every crate line,
   * armed when the skill menu opens, spent by what comes out of it
   * (lib/game/tutorial.ts).
   */
  step: number
  /**
   * `[gameMode+0x330]`, the MINE line's own flag — and it is the other way up
   * from what it looks: the game object is built with it SET, so the sergeant
   * has nothing to say about mines until a crate sends the pig into a minefield
   * and CLEARS it (lib/game/tutorial.ts). Once per minefield.
   */
  mineLineArmed: boolean
  /**
   * Which of the training ground's steps the battle has been jumped to, and one
   * waiting to be applied once the level's opening drop is out of the way
   * (lib/game/training.ts).
   *
   * A jump BACK is the level starting over — the chain runs one way — and a
   * battle that has just started is still under its canopies, where the pig
   * cannot be stood anywhere. So the step is WANTED first and paid in the paint
   * loop, which is the one place that knows the drop has finished, and the want
   * is what a second press counts from: F12 twice while the canopies are still
   * up is two steps and not one.
   */
  trainingStep: number
  stepWanted: number | null
  /** …and whether the battle a want is meant for is still LOADING. Without it
   * the paint loop pays the want into the battle being replaced — which, being
   * a step or two further on already, has nothing left to collect and hands the
   * pig whatever it was carrying instead. */
  reloading: boolean
  /** The dashboard's own animation frame, and when it last painted (`paint.ts`). */
  frame: number
  painted: number
  /**
   * THE PAUSE, and it is one flag with three consequences.
   *
   * Play asked for it and gave the reason: alt-tabbing froze the world and
   * left the sergeant talking — "надо в будущем паузу делать, эскейп меню"
   * (`docs/todo.md` B4b). The frame clamp in `three/scene.ts` stops a ten
   * second step resolving a whole shot at once; it was never a pause and says
   * so.
   *
   * The three consequences, each in the domain that owns it:
   *
   * - the WORLD stops — `running` is what `three/battle.ts` gates its whole
   *   frame on, so `engine.update` is never reached and the fixed-step
   *   accumulator never sees the time (lib/game/engine.ts);
   * - the SOUND stops, by suspending the one shared context, which keeps a
   *   half-spoken line exactly where it was (audio/bank.ts);
   * - the DASHBOARD keeps drawing but stops moving (ui/hud.ts).
   *
   * Single player only. Play's rule, and it is not a detail: "в мп вообще
   * никаких остановок" — a lockstep battle cannot have one side stop the
   * clock, so the day multiplayer lands this is gated on being alone.
   */
  paused: boolean
  /** The menu's own state while it is up, and nothing while it is not. */
  pause: PauseState | null
  /**
   * The three settings the menu works, kept OUT of it: the menu is opened
   * fresh every time and these are not, the same way the exe's live on the
   * sound manager rather than on the pause. They last as long as the process
   * — the exe's do too, which is why a volume set in a mission is not in the
   * options screen afterwards.
   */
  mix: { master: number; sfx: number; speech: boolean }
  /** The engine's verdict, once it has given one. The LEAVE button before
   * that is an ABORT — the player walking out, not an outcome. */
  verdict: Extract<BattleExit, 'won' | 'lost'> | null
  /** Side 0's dead, as roster slots in the order they went down — collected
   * off the bus's own `killed` and handed out with the verdict, because the
   * campaign's fall marks are exactly this list (lib/game/roster.ts). */
  fallen: number[]
  /** Side 0's KILLS, by roster slot — every enemy a pig's weapon brought down,
   * off the same `killed` events' `by`. Same-side kills are deliberately not
   * counted, the exe's own split (its friendly tally has no reader), and a
   * death with no attacker — water, a mine — is nobody's. */
  kills: number[]
  /** WHICH promotion points were picked up off the ground this battle, by
   * the map object's own id - what the debrief pays as its SPECIAL BONUS,
   * and what the save records medal by medal (lib/game/scenery.ts,
   * lib/game/save.ts `Medals`). */
  points: number[]
}

export const createUiState = (): UiState => ({
  game: null,
  scene: null,
  sound: null,
  query: null,
  map: DEFAULT_MAP,
  title: null,
  battleText: [],
  cued: new Set<Cue>(),
  step: 0,
  mineLineArmed: false,
  trainingStep: 0,
  stepWanted: null,
  reloading: false,
  frame: 0,
  painted: 0,
  paused: false,
  pause: null,
  mix: { master: VOLUME_MAX, sfx: VOLUME_MAX, speech: true },
  verdict: null,
  fallen: [],
  kills: [],
  points: []
})
