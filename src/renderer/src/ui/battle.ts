// The battle view (phase 002): New Game lands here, on the map's OWN
// squads — a turn HUD and an End Turn button over them. Assets come through
// the same IPCs the debug viewers use; the rules live in lib/game.

import type { Game } from '../../../lib/game/game'
import { buildQuery } from '../../../lib/game/engine'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { fielded, mapSquads, musterGame } from '../../../lib/game/muster'
import type { OwnSquad } from '../../../lib/game/muster'
import { nations } from '../../../lib/game/teams'
import { artFor, classArt } from '../three/soldiers'
import { bodyExtent } from '../../../lib/game/body'
import type { LoadModelResult, Model, Texture } from '../api'
import { ensureScene } from '../three/scene'
import { createBattleInput } from '../input/battleInput'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
import { controller } from '../input/controller'
import { resumeAudio, setMasterVolume, setSfxVolume, setSpeechOn, suspendAudio } from '../audio/bank'
import { GAME_SOUNDS } from '../audio/battleSound'
import { loadMenuClick, playMenuClick } from '../audio/menuClick'
import { PAUSE_PITCH, PAUSE_SOUND, VOLUME_MAX, newPause, pausePress } from '../../../lib/game/pauseMenu'
import type { PauseState, PauseVerb } from '../../../lib/game/pauseMenu'
import { LAYOUT, createHud } from './hud'
import { missionTitle } from './titleCard'
import { createSpeech } from '../audio/speech'
import { createBattleSound } from '../audio/battleSound'
import type { BattleSound } from '../audio/battleSound'
import { createBus, handling } from '../../../lib/game/events'
import {
  CLIP_FOR,
  MENU_ARMED,
  MINE_LINE,
  WASTED_TURN_LINE,
  armsMineLine,
  clipForChosen,
  clipForClosing,
  clipForMenu,
  clipForPickup,
  clipForPlacement,
  isTrainingGround,
  lineFor
} from '../../../lib/game/tutorial'
import type { Cue } from '../../../lib/game/tutorial'
import { LAST_TRAINING_STEP, TRAINING_STEPS, clampStep } from '../../../lib/game/training'
import { SKILL, skillName } from '../../../lib/game/skills'
import { lobOf } from '../../../lib/game/grenade'
import { UNLIMITED } from '../../../lib/game/inventory'
import type { Collected } from '../../../lib/game/scenery'
import { mapRaster } from '../../../lib/game/mapRaster'
import { HAT_ARCHIVE, HAT_CLASSES, SKIN_ARCHIVES, SKIN_HATS, skinOf } from '../../../lib/game/nations'
import { give } from '../../../lib/game/inventory'
import { skyArchiveFor, weatherFor } from '../../../lib/game/sky'
import { byId } from './dom'

// The training ground — the first map the original ever shows a player, and
// the friendliest to test on: barely any water, one big usable field.
// `pow.swapMap('ARTGUN')` in the console restarts the battle elsewhere —
// CAMP has no climbing ground at all, so the Scramble only shows on maps
// like ARTGUN or ICEFLOW.
const DEFAULT_MAP = 'CAMP'
const CHAR_ARCHIVE = 'Chars/british.mad'
/** Where the canopy lives: `WE_PARA`, the archive's 24th model, which is the
 * one `Pig::StartParachuting` hangs off a pig (three/parachute.ts). */
const WEAPON_ARCHIVE = 'Chars/WEAPONS.MAD'
const CANOPY_MODEL = 'WE_PARA'

/** 'artgun', 'ARTGUN.PMG' and 'Maps/ARTGUN.PMG' all mean ARTGUN. */
const normalizeMap = (name: string): string =>
  name
    .trim()
    .replace(/^maps[\\/]/i, '')
    .replace(/\.pmg$/i, '')
    .toUpperCase()

/** `gtext 227`, "USE SHIFT BUTTON TO JUMP THE GAP." — a real tutorial line,
 * and a long enough one to scroll, which is what `pow.say()` shows. */
const SAMPLE_LINE = 227

/** What a collected crate puts through the briefing bar. `gtext 171` is the
 * refusal, 172 the health crate's line — the exe writes the skill ones with
 * its own "%u X%d" / "%u" (0x4CF9E8) out of the skill's name. */
const TOO_MANY_TOYS = 171
const FOUND_PROVISIONS = 172

/**
 * "GET READY >S..." — `gtext 168`, and it is the game's own answer to the beat at
 * the top of a turn.
 *
 * The beat has been in the domain since the turn clock landed (ten seconds, or any
 * key, `lib/game/game.ts`) and nothing ever SHOWED it, so a handover read as
 * instant: "когда кончается ход — следующий начинается мгновенно." A first pass
 * invented a line out of the exe's debug print; play sent a screenshot of the
 * shipped game instead — big green letters over the battle, "GET READY TOMMY'S
 * TROTTERS..." — so it is this string, with the SQUAD's name in it, drawn on the
 * same centred card the mission title uses.
 */
const GET_READY = 168

/**
 * How full the weapon port's red lens is — null for an empty port.
 *
 * Play, of the bazooka's: "индикатор красный на панели силы полностью закрашен —
 * как оружие которое детонирует при контакте", and of the ordinary one "на
 * половину залитого круга". So it is the CLASS: whole for anything that goes off
 * on touch (`Lob.contact`, read off the projectile's state machine in
 * lib/game/grenade.ts) and half for everything else.
 *
 * The half is play's word rather than a reading, like the position it is drawn
 * at — nothing in the exe has been traced to `pcpie4` at all.
 */
const LENS_ORDINARY = 0.5
const lensFor = (holding: number | null): number | null =>
  holding === null ? null : lobOf(holding)?.contact ? 1 : LENS_ORDINARY

/** ">S MISSES A TURN!" — `gtext 167`, what SKIP TURN says. Also the game's own,
 * and also a line an invented one stood in for. */
const MISSES_TURN = 167

/**
 * **What a finished mission says, and it is the game's own card.** Play: "при
 * выигрыше не написано победа."
 *
 * The exe draws its centred cards out of ONE function switching on the game's
 * mode (0x45B94B → the table at 0x45BF78): mode 1 START OF GAME is the mission
 * title this file already draws, mode 4 START OF TURN is "GET READY >S...", and
 * **mode 2, END OF GAME, is this pair** (0x45BC66). One player takes `gtext` 163
 * when its side is still standing and 164 when it is not; a multiplayer game
 * takes 165, "VICTORY TO >S!!", with the winning team's name — which this does
 * not draw, because nothing here fields two human sides.
 */
const MISSION_ACCOMPLISHED = 163
const MISSION_FAILED = 164

/** How a battle came to be over: the engine's verdict, or the LEAVE button
 * before it gave one — which is the player walking out on the mission. */
export type BattleExit = 'won' | 'lost' | 'aborted'

export interface BattleView {
  /**
   * Open a battle. With no name it reopens whatever map the view is on,
   * which is the training ground until something asks for another — the
   * MULTI-PLAYER screen asks for a two-sided one (ui/multiPlayer.ts).
   *
   * `wearing` is which NATION each side fields, campaign side first: the
   * player's own choice and then whoever the save says this mission is against
   * (lib/game/nations.ts). Left out, each side wears its slot — which is what a
   * battle opened from the console gets, and what every spec that does not care
   * about uniforms sees.
   *
   * `own` is the campaign's squad off the SAVE — the team's name and the pigs
   * that take the field, each under its own name and rank-class
   * (lib/game/muster.ts). Left out, side 0 is dressed from `fetext` like
   * everybody else.
   */
  open(name?: string, wearing?: readonly number[], own?: OwnSquad): Promise<boolean>
  close(): void
}

/**
 * `fallen` on the way out is the roster SLOTS of side 0's dead, in the order
 * they went down — what `fall` marks the save's squad with (lib/game/roster.ts).
 * Empty on an abort, on a skirmish, and on a mission nobody died in.
 * `kills` is side 0's kill tally by roster slot — what `credit` adds to the
 * lifetime scores when a win is taken.
 */
export function initBattle(
  onLeave: (exit: BattleExit, fallen: number[], kills: number[], points: number) => void
): BattleView {
  const canvasHost = byId<HTMLDivElement>('battle-canvas')
  const hudCanvas = byId<HTMLCanvasElement>('battle-hud')
  const hud = createHud(hudCanvas)
  // Nothing to do with the dashboard: this is the debug readout for
  // reporting a tile that looks wrong in play.
  const tileEl = byId<HTMLSpanElement>('battle-tile')

  let game: Game | null = null
  let scene: BattleScene | null = null
  /** The battle's sound, hung off the same bus the scene listens to. */
  let sound: BattleSound | null = null
  let query: TerrainQuery | null = null
  let map = DEFAULT_MAP
  /** What the opening card says on this map — null on a map the game names
   * nothing for (ui/titleCard.ts). */
  let title: string | null = null
  /** `gtext`, the battle's own strings: the mission titles, and 210..237,
   * which are the 28 lines the tutorial speaks. */
  let battleText: string[] = []
  // The instructor. One voice for the whole app: a battle restarting on
  // another map does not want a second sergeant talking over the first.
  const speech = createSpeech()
  /** Which cues have already been spoken this battle — each fires once. */
  let cued = new Set<Cue>()
  /**
   * The script's own counter, `[gameMode+0x32C]` — zeroed by every crate line,
   * armed when the skill menu opens, spent by what comes out of it
   * (lib/game/tutorial.ts).
   */
  let step = 0
  /**
   * `[gameMode+0x330]`, the MINE line's own flag — and it is the other way up
   * from what it looks: the game object is built with it SET, so the sergeant
   * has nothing to say about mines until a crate sends the pig into a minefield
   * and CLEARS it (lib/game/tutorial.ts). Once per minefield.
   */
  let mineLineArmed = false
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
  let trainingStep = 0
  let stepWanted: number | null = null
  /** …and whether the battle a want is meant for is still LOADING. Without it
   * the paint loop pays the want into the battle being replaced — which, being
   * a step or two further on already, has nothing left to collect and hands the
   * pig whatever it was carrying instead. */
  let reloading = false

  /**
   * The tutorial speaking: the clip out of `Speech/Sku1/Train1`, and its line
   * through the briefing bar. Only on the training ground, and clip 0 is the
   * script's own "say nothing" (lib/game/tutorial.ts). Every step in the
   * script arrives here — the opening beats, a crate collected, a crate
   * placed.
   */
  const sergeant = (clip: number): void => {
    if (!isTrainingGround(map) || clip === 0) return
    speech.play(clip)
    // Several of the lines are a single space — those steps are voice alone,
    // and the bar has nothing to open for.
    hud.say(lineFor(battleText, clip).trim())
  }

  /** The two beats that are not an object's doing: each fires once a battle. */
  const cue = (kind: Cue): void => {
    if (cued.has(kind)) return
    cued.add(kind)
    sergeant(CLIP_FOR[kind])
  }

  /**
   * A crate the pig just walked into: what the bar says about it, and what
   * the sergeant makes of it.
   *
   * The wording is the exe's — the skill's own name with "X<count>" after it
   * unless it arrived unlimited (0x4CF9E8), `gtext 172` ">S FINDS USEFUL
   * PROVISIONS!" for a health crate, and `gtext 171` for a pig that already
   * has fifteen skills.
   */
  /** A pig by the id the bus named it with (lib/game/events.ts). */
  const nameOf = (id: number): string =>
    game?.players.flatMap((player) => player.pigs).find((pig) => pig.id === id)?.name ?? ''

  const collected = ({ skill, amount, given, result, pig }: Collected): void => {
    if (result === 'full') {
      hud.say(battleText[TOO_MANY_TOYS] ?? '')
      return
    }
    // On the training ground the crate IS the script, and the exe says its
    // line FIRST: the tutorial is called at the top of `GiveSkill`, before
    // the pickup's own message is queued (lib/game/tutorial.ts). A crate line
    // starts the prompt counter over, whichever dispatcher spoke it.
    step = 0
    // …and the two crates that say "FOLLOW THE PATH THROUGH THE MINEFIELD" ARM
    // the mine line as they speak, which is what the exe does in the same two
    // arms (0x465D72, 0x465DBD).
    if (armsMineLine(skill, amount)) mineLineArmed = true
    sergeant(clipForPickup(skill, amount))
    if (skill === null) {
      hud.say((battleText[FOUND_PROVISIONS] ?? '').replace('>S', nameOf(pig)))
      return
    }
    const name = skillName(battleText, skill)
    hud.say(given === UNLIMITED ? name : `${name} X${given}`)
  }

  const updateTileText = (): void => {
    if (!game) return
    const { x, z } = game.currentPig.position
    const tile = query?.tileAddress(x, z)
    tileEl.textContent = tile
      ? `tile ${tile.col},${tile.row}  tex ${tile.texture}  byte ${tile.rotateFlip}  type 0x${tile.type.toString(16)}`
      : ''
  }

  const updateHud = (): void => {
    if (!game) return
    updateTileText()
    scene?.focus(game.currentPig)
  }

  /** Which step the battle is on, counting one that has been asked for and not
   * paid yet. */
  const standingStep = (): number => stepWanted ?? trainingStep

  /** Run the script to `step` and say so. The scene owns the jump itself, since
   * standing a pig somewhere is a picture as well as a position — and it refuses
   * on any map but the training ground, where there is no such script. */
  const applyStep = (step: number): void => {
    if (!scene?.trainingStep(step)) return
    trainingStep = step
    console.log(`training step ${step}/${LAST_TRAINING_STEP} — ${TRAINING_STEPS[step].name}`)
    updateHud()
  }

  /**
   * **Go to one of the training ground's steps** — F11 and F12, and `pow.step(n)`
   * from the console.
   *
   * Forward is the chain running on. BACK cannot be: a dummy that has been broken
   * does not stand up again, so the level starts over and runs to the step
   * behind — which is also why the jump is remembered rather than applied, the
   * fresh battle being under its canopies for the next few seconds.
   */
  const goToStep = async (want: number): Promise<boolean> => {
    if (!scene || !game) {
      console.log('no battle is up — start one from the menu first')
      return false
    }
    if (!isTrainingGround(map)) {
      console.log(`${map} is not the training ground — its steps are CAMP's`)
      return false
    }
    const step = clampStep(want)
    const back = step < standingStep()
    stepWanted = step
    // The level over again — and the want is set BEFORE the reload so a second
    // press counts from it, while `reloading` keeps the paint loop off it until
    // the battle it belongs to exists.
    if (back) {
      reloading = true
      const opened = await start(map)
      reloading = false
      if (!opened) {
        stepWanted = null
        return false
      }
      stepWanted = step
    }
    // …and a squad still coming down has nowhere to be stood: the paint loop
    // pays the want the moment the canopies are off.
    if (!scene.dropping()) {
      stepWanted = null
      applyStep(step)
    }
    return true
  }

  // The dashboard is drawn over the 3D view, on its own canvas, for as long
  // as the battle is the view. It keeps its own clock: the scene's frame loop
  // is three's, and the bar's slide belongs to the dashboard. It DRAWS and
  // nothing else — the controls are read in the scene's frame, which is the
  // one the game steps in (input/battleInput.ts).
  let frame = 0
  let painted = 0
  const paint = (now: number): void => {
    frame = requestAnimationFrame(paint)
    const delta = painted === 0 ? 0 : Math.min(0.1, (now - painted) / 1000)
    painted = now
    if (!game || !scene) return
    // The script's first two beats: the sergeant starts talking over the
    // drop, and picks up again the moment the round is under way.
    cue(scene.dropping() ? 'drop' : 'round')
    // …and a step jumped BACK to is paid as soon as the squad is on the ground:
    // a pig still on its canopy has nowhere to be stood.
    if (stepWanted !== null && !reloading && !scene.dropping()) {
      const step = stepWanted
      // Cleared whether the scene takes it or not — a want left standing on a map
      // that has no such script would block every jump after it.
      stepWanted = null
      applyStep(step)
    }
    /** The mission being over, which is a card of its own (lib/game/endOfGame.ts). */
    const ended = scene.battle.view().ending
    hud.draw({
      delta,
      paused,
      pause,
      seconds: game.timeLeft,
      pigs: scene.plates(hudCanvas.clientWidth, hudCanvas.clientHeight, LAYOUT.plate.lift),
      numbers: scene.numbers(hudCanvas.clientWidth, hudCanvas.clientHeight),
      still: scene.still(),
      strings: battleText,
      aim: scene.aim(),
      charge: scene.charging(),
      // **A PIG INSIDE HOLDS THE DOOR.** Play: "когда прыгаю в здание — в оружии
      // должна быть иконка запрыгивания во что-то (есть в игре)." Skill 61 is
      // BUILDING INOUT and it has an icon of its own like every other
      // (lib/game/skills.ts), so the slot beside the dial carries it for as long
      // as the pig is in there — which is also the only thing it can do from in
      // there besides skipping the turn.
      //
      // A DRAWING decision and not a rule: `pig.holding` is what the fire key
      // acts on, and the remake's door is a key of its own (play asked for that),
      // so putting 61 in the pig's hands would arm a weapon nobody chose.
      holding: scene.battle.view().inside ? SKILL.BUILDING_INOUT : game.currentPig.holding,
      // …and how full the port's red lens is, which says what the thing in hand
      // DOES rather than how charged it is (ui/hud.ts, `DIAL.slot.lens`).
      lens: lensFor(game.currentPig.holding),
      scope: scene.scoped(),
      // The map is centred on the camera and turned by it, and it shows what
      // the side whose turn it is can see (lib/game/scanner.ts).
      eye: scene.eye(),
      blips: scene.blips(),
      // The card carries the mission's name for as long as anyone is still in the
      // air, "MISSION ACCOMPLISHED!" once it is over, and "GET READY >S..." for
      // the beat at the top of every turn — all three the same centred card the
      // exe draws off its own mode (0x45B94B).
      title: scene.dropping()
        ? title
        : ended
          ? (battleText[ended.won ? MISSION_ACCOMPLISHED : MISSION_FAILED] ?? '')
          : game.starting
            ? (battleText[GET_READY] ?? '').replace('>S', game.currentPlayer.name)
            : null
    })
  }

  // The button is just another way to fire the action.
  byId<HTMLButtonElement>('battle-end-turn').addEventListener('click', () => {
    // The whole gesture in one click, because that is what a button labelled END
    // TURN means: take SKIP TURN in hand, then use it. It is not the menu applying
    // a skill on being chosen — the menu still only hands it over — it is the
    // remake's own shortcut for both halves (lib/game/controls.ts).
    controller.press('endTurn')
    controller.tap('fire')
  })

  // Tank controls, original style — but the battle view never touches keys:
  // it listens to the controller, which the keyboard AND the e2e suite drive
  // through the same three methods (input/controller.ts).
  const battleEl = byId<HTMLDivElement>('battle')
  const isBattleUp = (): boolean => !battleEl.classList.contains('hidden')

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
  let paused = false
  const isRunning = (): boolean => isBattleUp() && !paused

  /** The menu's own state while it is up, and nothing while it is not. */
  let pause: PauseState | null = null
  /**
   * The three settings the menu works, kept OUT of it: the menu is opened
   * fresh every time and these are not, the same way the exe's live on the
   * sound manager rather than on the pause. They last as long as the process
   * — the exe's do too, which is why a volume set in a mission is not in the
   * options screen afterwards.
   */
  const mix = { master: VOLUME_MAX, sfx: VOLUME_MAX, speech: true }
  // The one sample the menu makes every one of its noises with, on a context
  // of its own because the pause suspends the game's (audio/menuClick.ts).
  void loadMenuClick(GAME_SOUNDS, PAUSE_SOUND)

  const setPaused = (wanted: boolean): void => {
    if (paused === wanted || !isBattleUp()) return
    paused = wanted
    // Opening and closing make the same noise the cursor does — the exe plays
    // its one sample at 0x64 on both (0x491F84, 0x491FC7).
    playMenuClick(PAUSE_PITCH.plain)
    if (paused) {
      pause = newPause(mix)
      suspendAudio()
      // Nothing stays HELD across a pause. The controller does the same on
      // blur, and for the same reason: a key that went down before the freeze
      // would drive the pig the moment it lifts.
      controller.releaseAll()
    } else {
      pause = null
      resumeAudio()
    }
  }

  /**
   * One key press against the pause menu: the rules say what it means and
   * what noise it makes (lib/game/pauseMenu.ts), and this is where the four
   * things it can ask for actually happen.
   */
  const pauseVerb = (verb: PauseVerb): void => {
    if (!pause) return
    const outcome = pausePress(pause, verb)
    if (outcome.sound) playMenuClick(PAUSE_PITCH[outcome.sound])
    // The settings live past the menu, so they are copied back out of it.
    mix.master = pause.master
    mix.sfx = pause.sfx
    mix.speech = pause.speech
    setMasterVolume(mix.master)
    setSfxVolume(mix.sfx)
    setSpeechOn(mix.speech)
    // Turning SPEECH off cuts the line in the air, rather than waiting for it
    // to finish quietly (0x4923EB).
    if (outcome.cutSpeech) speech.stop()
    if (outcome.resume) setPaused(false)
    if (outcome.abort) {
      // **AN ABORT IS A LOSS**, and that is not an interpretation: the exe
      // writes −2 into the outcome word and falls straight through into the
      // same debrief call the ordinary end takes (0x47E643 into 0x47E652),
      // and the page asks only `outcome == 0` (0x482B5E) — so −2 and the
      // ordinary −1 are one page with one pair of keys. There is no MISSION
      // ABORTED screen; gtext 189 carries those words and has no reader
      // anywhere in the executable.
      //
      // So it leaves with a VERDICT rather than as `aborted`, which stays
      // what it always meant here: the toolbar's walk-out, a remake
      // convenience the original has no button for.
      verdict = 'lost'
      setPaused(false)
      leave()
    }
  }

  /**
   * The controls, read once a frame in the SCENE's own loop
   * (`input/battleInput.ts`). This file used to interpret them itself, on a
   * change notification, and both halves of that were wrong: a control set can
   * change while nothing on the keyboard moves, and the dashboard's loop is not
   * the one the game steps in.
   */
  const input = createBattleInput({
    // The ENGINE, not the scene: input drives the game and knows nothing about
    // what is drawing it (lib/game/battle.ts).
    battle: () => scene?.battle ?? null,
    game: () => game,
    // …and what a control ANNOUNCES goes on the battle's own bus, so the noise
    // of the inventory opening belongs to the audio bank like every other
    // (lib/game/events.ts).
    emit: (event) => scene?.battle.announce(event),
    skills: hud.skills,
    up: isBattleUp,
    paused: () => paused,
    pauseVerb,
    // ESCAPE, read in the battle's own poll like every other verb — and the
    // poll rides the scene's INPUT pass, which is ahead of the frame the
    // pause freezes, so the key that starts a pause is also the key that can
    // end one (three/scene.ts).
    togglePause: () => setPaused(!paused)
  })
  controller.bindKeyboard(isBattleUp)

  // F11 and F12: back a training step and on one. They come through the
  // controller like every other key and stop HERE — the battle's own poll drops
  // them (input/actions.ts, `DEBUG_ACTIONS`), because this is not something a
  // pig does. Restarting the level is what a step back is, and only this file
  // can do that.
  controller.onAction((action) => {
    if (!isBattleUp()) return
    if (action === 'trainingBack') void goToStep(standingStep() - 1)
    if (action === 'trainingNext') void goToStep(standingStep() + 1)
  })

  /** The engine's verdict, once it has given one. The LEAVE button before
   * that is an ABORT — the player walking out, not an outcome. */
  let verdict: Extract<BattleExit, 'won' | 'lost'> | null = null

  /** Side 0's dead, as roster slots in the order they went down — collected
   * off the bus's own `killed` and handed out with the verdict, because the
   * campaign's fall marks are exactly this list (lib/game/roster.ts). */
  let fallen: number[] = []

  /** Side 0's KILLS, by roster slot — every enemy a pig's weapon brought down,
   * off the same `killed` events' `by`. Same-side kills are deliberately not
   * counted, the exe's own split (its friendly tally has no reader), and a
   * death with no attacker — water, a mine — is nobody's. */
  let kills: number[] = []

  /** PROMOTION POINTS picked up off the ground this battle — what the debrief
   * pays as its SPECIAL BONUS (lib/game/scenery.ts). */
  let points = 0

  /** Put the battle away: the LEAVE button, and the end of a mission. */
  const leave = (): void => {
    controller.releaseAll()
    scene?.dispose()
    scene = null
    game = null
    if (frame !== 0) cancelAnimationFrame(frame)
    frame = 0
    painted = 0
    speech.stop()
    hud.clear()
    onLeave(verdict ?? 'aborted', fallen, kills, points)
  }

  byId<HTMLButtonElement>('battle-leave').addEventListener('click', leave)

  /** (Re)start the battle on `name` — fresh spawns, fresh turn order. A load
   * failure leaves whatever battle was running untouched. */
  const start = async (
    name: string,
    wearing: readonly number[] = [],
    own?: OwnSquad
  ): Promise<boolean> => {
    // A battle that cannot load stays unopened and says so in the console —
    // the same place a refused swapMap answers. The view never appears, so
    // there is nowhere on screen to put it.
    const refuse = (error: string): false => {
      console.log(scene ? `stayed on ${map}: ${error}` : `could not open ${name}: ${error}`)
      return false
    }
    const [terrainResult, objectsResult, clipsResult, textResult, battleTextResult] =
      await Promise.all([
        window.api.loadTerrain(`Maps/${name}.PMG`),
        window.api.loadMapObjects(`Maps/${name}.POG`),
        window.api.loadClips(CHAR_ARCHIVE),
        window.api.loadGameText('fetext'),
        // The battle's own strings: the mission titles and, next, everything
        // the tutorial says.
        window.api.loadGameText('gtext'),
        hud.load()
      ])
    if (!terrainResult.ok) return refuse(terrainResult.error)
    if (!textResult.ok) return refuse(textResult.error)
    // An install with no gtext simply gets no card; it is not worth a battle.
    battleText = battleTextResult.ok ? battleTextResult.strings : []
    title = missionTitle(battleText, name)
    // A restart is a fresh level: the sergeant stops mid-word and says his
    // opening again.
    speech.stop()
    cued = new Set()
    step = 0
    verdict = null
    fallen = []
    kills = []
    points = 0
    // A fresh level is the tutorial's first rung again, whoever asked for it —
    // the menu, `pow.swapMap`, or a step BACK, which sets its own want on the
    // far side of this.
    trainingStep = 0
    // Disarmed, the way the game object is BUILT (0x48F073): nothing is said
    // about mines until a crate sends the pig into a minefield.
    mineLineArmed = false
    const teams = nations(textResult.strings)
    if (teams.length === 0) return refuse('the install names no teams')

    if (!objectsResult.ok) console.log(`${name} without its objects: ${objectsResult.error}`)

    // Only the records this many players get: a map does not place the same
    // things in every game (lib/game/muster.ts).
    const objects = fielded(objectsResult.ok ? objectsResult.objects : [])

    // The map as the rules see it, built ONCE and handed to the scene, which
    // hands it to the engine — the water mask walks every texel of the ground
    // and there was a second copy of it here (lib/game/engine.ts).
    query = buildQuery(terrainResult.blocks, terrainResult.textures)
    const squads = mapSquads(objects, teams, wearing, own)
    if (squads.length === 0) return refuse(`${name} carries no spawn markers — nothing to field`)

    // Which models to load is only known once the squads are: a map fields
    // the classes its own markers name — and now one set PER NATION fielded,
    // since two sides in different uniforms share the same geometry and must
    // not share the same `SoldierArt` (three/squad.ts).
    const bases = artFor(squads.flatMap((squad) => squad.spawns.map((at) => at.pigClass ?? 0)))
    const dressed = [...new Set(squads.map((squad) => squad.nation))]
    const wanted = dressed.flatMap((nation) => bases.map((base) => ({ base, nation })))
    const loaded = await Promise.all(
      wanted.map(({ base, nation }) =>
        // Skin 0 is British and its archive is the one paired with the model,
        // so it is asked for by omission — the same call the frontend makes.
        window.api.loadModel(CHAR_ARCHIVE, base, skinOf(nation) === 0 ? undefined : SKIN_ARCHIVES[skinOf(nation)])
      )
    )
    const missing = loaded.findIndex((result) => !result.ok)
    if (missing >= 0) return refuse((loaded[missing] as { ok: false; error: string }).error)
    const soldiers = wanted.map(({ base, nation }, index) => {
      const result = loaded[index] as Extract<LoadModelResult, { ok: true }>
      return { base, nation, model: result.model, textures: result.textures }
    })

    // The nation HATS, one per side that fields a class which wears one. Their
    // textures are shared (`FHATS.MTD`), so the archive is asked plainly; a hat
    // that will not load leaves that side bare-headed rather than refusing the
    // battle, since the same load fails for every map.
    const hats = new Map<number, { model: Model; textures: Texture[] }>()
    if (squads.some((squad) => squad.spawns.some((at) => HAT_CLASSES.has(at.pigClass ?? 0)))) {
      for (const nation of dressed) {
        const wear = await window.api.loadModel(HAT_ARCHIVE, SKIN_HATS[skinOf(nation)] ?? '')
        if (wear.ok) hats.set(nation, { model: wear.model, textures: wear.textures })
        else console.warn(`${SKIN_HATS[skinOf(nation)]}: ${wear.error}`)
      }
    }

    // The canopy the level opens under. A squad that drops in without it
    // would be hanging from nothing, so a failed load stands them on their
    // markers instead of taking the battle down with it.
    const canopyResult = await window.api.loadModel(WEAPON_ARCHIVE, CANOPY_MODEL)
    if (!canopyResult.ok) console.log(`${name} without canopies: ${canopyResult.error}`)
    const canopy = canopyResult.ok
      ? { model: canopyResult.model, textures: canopyResult.textures }
      : null

    // …and the faces a pig's head swaps to on the way down (three/faces.ts).
    // Failing it costs only the expression: everyone keeps the resting face.
    const facesResult = await window.api.loadTims('Chars/FACES.MTD')
    if (!facesResult.ok) console.log(`${name} without face art: ${facesResult.error}`)
    const faces = facesResult.ok ? facesResult.images : []

    // …and the sky the map stands under, which the exe picks by MAP out of its
    // mission records (lib/game/sky.ts). Failing it costs the dome and nothing
    // else, so it is reported and stepped over like the props.
    const skyResult = await window.api.loadSky(skyArchiveFor(name))
    if (!skyResult.ok) console.log(`${name} without a sky: ${skyResult.error}`)

    // …and what falls out of it, on the two moods that draw any: the ten cold
    // maps snow and the five ominous ones rain (lib/game/sky.ts). Ordinary TIM
    // archives, so no loader of their own.
    const falling = weatherFor(name)
    const weatherResult = falling
      ? await window.api.loadTims(`Language/Tims/${falling}.mtd`)
      : null
    if (weatherResult && !weatherResult.ok) {
      console.log(`${name} without its ${falling}: ${weatherResult.error}`)
    }
    const weather =
      falling && weatherResult?.ok ? { kind: falling, images: weatherResult.images } : null

    // The squads, standing (lib/game/muster.ts). All the renderer supplies is
    // the MEASUREMENT — how big a pig of this class is, off its own art
    // (lib/game/body.ts), which used to be the mesh's alone and is what made
    // every blow ask the renderer where a pig was.
    game = musterGame({
      squads,
      map: name,
      ground: query,
      bodyOf: (pigClass) =>
        bodyExtent((soldiers.find((one) => one.base === classArt(pigClass)) ?? soldiers[0]).model.positions)
    })

    scene?.dispose()
    // The poll rides the scene's frame, ahead of the game's step — a Set, so
    // asking for it again on every map swap registers it once.
    const host = ensureScene(canvasHost)
    host.onInput.add(input.poll)
    // THE COMPOSITION. One bus, and the domains hung off it: the engine
    // announces, sound listens, the scene listens and draws. Built here rather
    // than inside any of them, because the moment one builds another they stop
    // being separable — which is what `npm run boundaries` checks.
    sound?.dispose()
    const bus = createBus()
    sound = createBattleSound(bus)
    // The instructor is a listener like any other. A crate the SCRIPT has just
    // put on the map is the half of the tutorial that says where to go next,
    // and it comes straight off the bus rather than through the scene — the
    // collected line goes the long way round only because it shares the
    // briefing bar's wording with the pickup message.
    bus.on(
      handling({
        // **A pig of OURS went down.** Its squad index is its slot in the
        // save's roster — side 0 fields `squad.slice(0, fieldedAt(position))`
        // in roster order — and the ORDER of this list is what `fell` encodes
        // (lib/game/roster.ts). **And a pig of ours may have done it**: `by`
        // is the weapon's owner, and an enemy it brought down goes on that
        // slot's kill tally — the count the squad screen's board prints.
        killed: ({ pig, by }) => {
          const one = game?.players[0]?.pigs.find((p) => p.id === pig)
          if (one && !fallen.includes(one.index)) fallen.push(one.index)
          if (by === undefined || one) return
          const killer = game?.players[0]?.pigs.find((p) => p.id === by)
          if (killer) kills[killer.index] = (kills[killer.index] ?? 0) + 1
        },
        promotionPoint: ({ total }) => {
          points = total
        },
        placed: ({ skill, amount }) => {
          step = 0
          sergeant(clipForPlacement(skill, amount))
        },
        menuOpened: ({ first }) => {
          // The one line of the script that had nothing to fire it, and its gate
          // turned out to be the MENU: the exe reads the first cell, which is
          // the game object's own first dword (lib/game/tutorial.ts). Spoken
          // BEFORE the counter is armed, as the exe speaks it before writing 1.
          sergeant(clipForMenu(first, step))
          step = MENU_ARMED
        },
        chose: ({ skill }) => {
          // Never from a standing start: a menu that was not opened since the
          // last crate line counts nothing (`cmp eax,1 ; jl`, 0x4933c5).
          if (step < MENU_ARMED) return
          step += 1
          sergeant(clipForChosen(skill, step, speech.saying() === 0))
        },
        // **A MINE.** Once per minefield, and only after the crate that sent the
        // pig into one — the flag is the exe's `[gameMode+0x330]` and it is
        // spent by speaking. Its own site in the exe is the projectile
        // constructor, so it answers a mine however it was set off.
        mineTripped: () => {
          if (!mineLineArmed) return
          // The exe drops the line outright while the sergeant is mid-sentence
          // and leaves the flag clear, so it comes round on the next mine.
          if (speech.saying() !== 0) return
          mineLineArmed = false
          sergeant(MINE_LINE)
        },
        // **A TURN NOBODY DID ANYTHING WITH.** The clock ran out and no weapon
        // was used all turn; the engine counts that the way the exe does
        // (lib/game/battle.ts, `weaponUses`).
        turnWasted: () => {
          if (speech.saying() === 0) sergeant(WASTED_TURN_LINE)
        },
        // **THE LAST DUMMY IS DOWN.** The sergeant signs off — one of two lines,
        // by how many turns it took (lib/game/tutorial.ts) — over the beat the
        // engine holds the battle in.
        missionOver: ({ won, turns }) => {
          verdict = won ? 'won' : 'lost'
          if (won) sergeant(clipForClosing(turns))
        },
        // …and that beat has run out: the battle goes away, exactly as the LEAVE
        // button puts it away (lib/game/endOfGame.ts).
        //
        // NOT on the spot, though. This arrives from inside `engine.update`,
        // which is called from the middle of the scene's own frame — and the
        // rest of that frame still draws the thing `leave` would have disposed.
        // A microtask runs as soon as the frame's stack is empty and before the
        // next one, which is exactly late enough.
        missionEnded: () => queueMicrotask(leave)
      })
    )
    scene = buildBattle({
      host,
      query,
      assets: {
        blocks: terrainResult.blocks,
        terrainTextures: terrainResult.textures,
        soldiers,
        nations: squads.map((squad) => squad.nation),
        hats,
        skeleton: (loaded[0] as Extract<LoadModelResult, { ok: true }>).skeleton,
        clips: clipsResult.ok ? clipsResult.clips : [],
        // A map without its props is still playable ground, so a failed POG
        // is reported and stepped over rather than taking the battle down.
        objects,
        props: objectsResult.ok ? objectsResult.props : [],
        propTextures: objectsResult.ok ? objectsResult.textures : [],
        strings: battleText,
        canopy,
        faces,
        sky: skyResult.ok ? skyResult.sky : null,
        weather
      },
      game,
      onGameChanged: updateTileText,
      map: name,
      onCollected: collected,
      bus,
      sound,
      running: isRunning,
      paused: () => paused
    })
    // The dashboard's map, built once off the same ground the mesh came from
    // — one pixel a tile, the whole world (lib/game/mapRaster.ts). Not
    // awaited: it is a picture appearing on a widget that is still sliding
    // in, and a battle should not wait on it.
    void hud.ground(mapRaster(terrainResult.blocks))
    map = name
    updateHud()
    if (frame === 0) frame = requestAnimationFrame(paint)
    return true
  }

  // The console IS the map selector — no UI for it, by request. `pow.swapMap()`
  // with no argument lists what ships; with a name it restarts the battle
  // there. The scene rebuild re-merges `pow.debug`, so the spread keeps this.
  window.pow = {
    ...(window.pow ?? { controller }),
    map: () => map,
    swapMap: async (name?: string) => {
      if (!name) {
        const files = await window.api.listFiles()
        const maps = files
          .map((f) => f.path.match(/^Maps[\\/](.+)\.PMG$/i)?.[1])
          .filter((n): n is string => n !== undefined)
          .sort()
        console.log(`usage: pow.swapMap('ARTGUN') — shipping maps: ${maps.join(', ')}`)
        return false
      }
      if (!scene) {
        console.log('no battle is up — start one from the menu first')
        return false
      }
      return start(normalizeMap(name))
    },
    // The bar has no script driving it yet, so this is how it is watched:
    // any line, or the tutorial's own long one by default.
    say: (text?: string) => hud.say(text ?? battleText[SAMPLE_LINE] ?? ''),
    // Every clip the sergeant has spoken this battle, in order — the script
    // runs on speech, so this is the only way to watch it work. Read-only, and
    // the same list `Speech.spoken()` keeps (audio/speech.ts).
    spoken: () => speech.spoken(),
    /**
     * **The training ground, step by step.** `pow.step()` says where it stands,
     * `pow.step(9)` goes to the bazooka — the same jump F11 and F12 make
     * (lib/game/training.ts). The nine steps are CAMP's own chain: the bayonet,
     * the rifle, the sniper rifle, the two grenades, the gap in the bridge, the
     * TNT, the shelter and the bazooka.
     */
    step: async (want?: number) => {
      if (want === undefined) {
        const names = TRAINING_STEPS.map((one, index) => `${index} ${one.name}`).join(', ')
        console.log(`training step ${standingStep()} — usage: pow.step(9). ${names}`)
      } else {
        await goToStep(want)
      }
      return standingStep()
    },
    // …and the console is how a weapon nobody's crate carries gets tried.
    // The training ground hands out a bayonet and then a rifle and that is
    // the whole of it, so a GRENADE cannot be reached by playing at all —
    // `pow.give(19)` puts one in the acting pig's hands. The remake's own,
    // like `pow.swapMap`: the original has no such thing.
    give: (skill?: number, amount = 5) => {
      if (skill === undefined || !game) {
        console.log("usage: pow.give(19) — 19 is GRENADE; see pow.hud for the rest")
        return false
      }
      give(game.currentPig.carrying, skill, amount)
      game.currentPig.holding = skill
      updateHud()
      return true
    },
    // Whether the game is FROZEN, and a way to freeze it that is not the
    // keyboard — the same reader every view gives a spec (docs/testing.md).
    battle: {
      paused: () => paused,
      /** The menu's own state while it is up — which row is lit, whether the
       * question is armed, and the three settings. */
      menu: () => (pause ? { ...pause } : null),
      pause: (wanted = true) => {
        setPaused(wanted)
        return paused
      }
    }
  }

  return {
    // No name means ONE PLAYER, and ONE PLAYER is the training ground — not
    // "wherever the battle was last". It used to fall back to the current map,
    // which was harmless while only `pow.swapMap` could change it; the
    // MULTI-PLAYER screen made a MENU action change it, and then ONE PLAYER
    // opened CAMP's squad on LIBERATE's terrain. It cost a spec three phases
    // away — the pig walked into water it should never have been near.
    open: (name, wearing, own) => start(name ?? DEFAULT_MAP, wearing, own),
    close() {
      scene?.dispose()
      scene = null
      game = null
      if (frame !== 0) cancelAnimationFrame(frame)
      frame = 0
      painted = 0
      speech.stop()
      hud.clear()
    }
  }
}
