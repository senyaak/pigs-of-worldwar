// The battle view (phase 002): New Game lands here, on the map's OWN
// squads — a turn HUD and an End Turn button over them. Assets come through
// the same IPCs the debug viewers use; the rules live in lib/game.

import type { Game } from '../../../lib/game/game'
import { buildQuery } from '../../../lib/game/engine'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { fielded, mapSquads, musterGame } from '../../../lib/game/muster'
import { nations } from '../../../lib/game/teams'
import { artFor, classArt } from '../three/soldiers'
import { bodyExtent } from '../../../lib/game/body'
import type { LoadModelResult } from '../api'
import { ensureScene } from '../three/scene'
import { createBattleInput } from '../input/battleInput'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
import { controller } from '../input/controller'
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
import { SKILL, skillName } from '../../../lib/game/skills'
import { lobOf } from '../../../lib/game/grenade'
import { UNLIMITED } from '../../../lib/game/inventory'
import type { Collected } from '../../../lib/game/scenery'
import { give } from '../../../lib/game/inventory'
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

export interface BattleView {
  /** Open a battle. With no name it reopens whatever map the view is on,
   * which is the training ground until something asks for another — the
   * MULTI-PLAYER screen asks for a two-sided one (ui/multiPlayer.ts). */
  open(name?: string): Promise<boolean>
  close(): void
}

export function initBattle(onLeave: () => void): BattleView {
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
    hud.draw({
      delta,
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
      // The card carries the mission's name for as long as anyone is still in the
      // air, and then "GET READY >S..." for the beat at the top of every turn.
      title: scene.dropping()
        ? title
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
    up: isBattleUp
  })
  controller.bindKeyboard(isBattleUp)

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
    onLeave()
  }

  byId<HTMLButtonElement>('battle-leave').addEventListener('click', leave)

  /** (Re)start the battle on `name` — fresh spawns, fresh turn order. A load
   * failure leaves whatever battle was running untouched. */
  const start = async (name: string): Promise<boolean> => {
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
    const squads = mapSquads(objects, teams)
    if (squads.length === 0) return refuse(`${name} carries no spawn markers — nothing to field`)

    // Which models to load is only known once the squads are: a map fields
    // the classes its own markers name.
    const bases = artFor(squads.flatMap((squad) => squad.spawns.map((at) => at.pigClass ?? 0)))
    const loaded = await Promise.all(bases.map((base) => window.api.loadModel(CHAR_ARCHIVE, base)))
    const missing = loaded.findIndex((result) => !result.ok)
    if (missing >= 0) return refuse((loaded[missing] as { ok: false; error: string }).error)
    const soldiers = bases.map((base, index) => {
      const result = loaded[index] as Extract<LoadModelResult, { ok: true }>
      return { base, model: result.model, textures: result.textures }
    })

    // The canopy the level opens under. A squad that drops in without it
    // would be hanging from nothing, so a failed load stands them on their
    // markers instead of taking the battle down with it.
    const canopyResult = await window.api.loadModel(WEAPON_ARCHIVE, CANOPY_MODEL)
    if (!canopyResult.ok) console.log(`${name} without canopies: ${canopyResult.error}`)
    const canopy = canopyResult.ok
      ? { model: canopyResult.model, textures: canopyResult.textures }
      : null

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
        skeleton: (loaded[0] as Extract<LoadModelResult, { ok: true }>).skeleton,
        clips: clipsResult.ok ? clipsResult.clips : [],
        // A map without its props is still playable ground, so a failed POG
        // is reported and stepped over rather than taking the battle down.
        objects,
        props: objectsResult.ok ? objectsResult.props : [],
        propTextures: objectsResult.ok ? objectsResult.textures : [],
        strings: battleText,
        canopy
      },
      game,
      onGameChanged: updateTileText,
      map: name,
      onCollected: collected,
      bus,
      sound
    })
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
    }
  }

  return {
    // No name means ONE PLAYER, and ONE PLAYER is the training ground — not
    // "wherever the battle was last". It used to fall back to the current map,
    // which was harmless while only `pow.swapMap` could change it; the
    // MULTI-PLAYER screen made a MENU action change it, and then ONE PLAYER
    // opened CAMP's squad on LIBERATE's terrain. It cost a spec three phases
    // away — the pig walked into water it should never have been near.
    open: (name) => start(name ?? DEFAULT_MAP),
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
