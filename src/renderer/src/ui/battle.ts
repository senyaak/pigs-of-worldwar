// The battle view (phase 002): New Game lands here, on the map's OWN
// squads — a turn HUD and an End Turn button over them. Assets come through
// the same IPCs the debug viewers use; the rules live in lib/game.

import { Game } from '../../../lib/game/game'
import type { PigSpawn } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildWaterMask } from '../../../lib/game/watermask'
import { battleSides } from '../../../lib/game/spawns'
import { nations } from '../../../lib/game/teams'
import { turnSecondsFor } from '../../../lib/game/turns'
import type { Team } from '../../../lib/game/teams'
import { artFor } from '../three/soldiers'
import { existsForPlayers } from '../../../lib/formats/pog'
import type { LoadModelResult, MapObject } from '../api'
import { ensureScene } from '../three/scene'
import { createBattleInput } from '../input/battleInput'
import { buildBattle } from '../three/battle'
import type { BattleScene } from '../three/battle'
import { controller } from '../input/controller'
import { createHud } from './hud'
import { missionTitle } from './titleCard'
import { createSpeech } from '../audio/speech'
import { CLIP_FOR, clipForPickup, isTrainingGround, lineFor } from '../../../lib/game/tutorial'
import type { Cue } from '../../../lib/game/tutorial'
import { skillName } from '../../../lib/game/skills'
import { UNLIMITED } from '../../../lib/game/inventory'
import type { Collected } from '../three/battle'
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

/**
 * How many sides a battle fields. The markers name up to six (FINAL uses
 * all of them), but there is no AI for the rest, so the first two the map
 * carries are the ones that play — and WHICH two is the map's own business:
 * a marker's side bit is the nation (lib/game/teams.ts).
 */
const SIDES_FIELDED = 2

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

/** ">S MISSES A TURN!" — `gtext 167`, what SKIP TURN says. Also the game's own,
 * and also a line an invented one stood in for. */
const MISSES_TURN = 167

export interface BattleView {
  open(): Promise<boolean>
  close(): void
}

interface Squad {
  name: string
  pigNames: string[]
  spawns: PigSpawn[]
}

/**
 * The squads for a map, and ONLY what the map has: one side per set of
 * spawn markers, each pig standing on the marker that named its class.
 *
 * A skirmish arena fields four sides of five and a campaign map two, of
 * which the first two are taken. CAMP fields one side of one pig, because
 * the training ground is one pig — there is no filling in, and a map that
 * carries no markers cannot be played.
 */
function mapSquads(objects: MapObject[], teams: Team[]): Squad[] {
  return battleSides(objects, SIDES_FIELDED).map((side, index) => {
    // The side bit the map set IS the nation; a map with a bit no nation
    // answers to falls back on the order it was found in.
    const team = teams[side[0]?.team] ?? teams[index]
    const pigs = side.slice(0, team.pigNames.length)
    return {
      name: team.name,
      pigNames: team.pigNames.slice(0, pigs.length),
      spawns: pigs.map((at) => ({
        x: at.x,
        z: at.z,
        heading: at.heading,
        pigClass: at.pigClass,
        parachutes: at.parachutes
      }))
    }
  })
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
   * The tutorial speaking: the clip out of `Speech/Sku1/Train1`, and its line
   * through the briefing bar. Only on the training ground, and only the once
   * per battle (lib/game/tutorial.ts).
   */
  const cue = (kind: Cue): void => {
    if (!isTrainingGround(map) || cued.has(kind)) return
    cued.add(kind)
    const clip = CLIP_FOR[kind]
    speech.play(clip)
    // Several of the lines are a single space — those steps are voice alone,
    // and the bar has nothing to open for.
    hud.say(lineFor(battleText, clip).trim())
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
  const collected = ({ skill, amount, given, result, pig }: Collected): void => {
    if (result === 'full') {
      hud.say(battleText[TOO_MANY_TOYS] ?? '')
      return
    }
    // On the training ground the crate IS the script, and the exe says its
    // line FIRST: the tutorial is called at the top of `GiveSkill`, before
    // the pickup's own message is queued (lib/game/tutorial.ts).
    if (isTrainingGround(map)) {
      const clip = clipForPickup(skill, amount)
      if (clip !== 0) {
        speech.play(clip)
        hud.say(lineFor(battleText, clip).trim())
      }
    }
    if (skill === null) {
      hud.say((battleText[FOUND_PROVISIONS] ?? '').replace('>S', pig.name))
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
      pigs: scene.plates(hudCanvas.clientWidth, hudCanvas.clientHeight),
      numbers: scene.numbers(hudCanvas.clientWidth, hudCanvas.clientHeight),
      still: scene.still(),
      strings: battleText,
      aim: scene.aim(),
      charge: scene.charging(),
      holding: game.currentPig.holding,
      scope: scene.scoped(),
      reticle: scene.reticle(),
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
    scene: () => scene,
    game: () => game,
    skills: hud.skills,
    up: isBattleUp
  })
  controller.bindKeyboard(isBattleUp)

  byId<HTMLButtonElement>('battle-leave').addEventListener('click', () => {
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
  })

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
    const teams = nations(textResult.strings)
    if (teams.length === 0) return refuse('the install names no teams')

    if (!objectsResult.ok) console.log(`${name} without its objects: ${objectsResult.error}`)

    // A map does not place the same things in every game: the low byte of a
    // record's flags says which player counts it exists in, and the battle
    // fields as many sides as there are squads to name. BOOM is the map
    // that shows it — one-player snipers and multiplayer grunts on the very
    // same spots (lib/formats/pog.ts).
    const objects = (objectsResult.ok ? objectsResult.objects : []).filter((object) =>
      existsForPlayers(object, SIDES_FIELDED)
    )

    query = new TerrainQuery(
      terrainResult.blocks,
      buildWaterMask(terrainResult.blocks, terrainResult.textures)
    )
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

    game = new Game({
      players: squads.map((squad) => ({ name: squad.name, pigNames: squad.pigNames })),
      spawns: squads.flatMap((squad) => squad.spawns),
      // A turn's length is the LEVEL's, not a constant — 99 seconds on the
      // training ground (lib/game/turns.ts).
      turnSeconds: turnSecondsFor(name)
    })

    scene?.dispose()
    // The poll rides the scene's frame, ahead of the game's step — a Set, so
    // asking for it again on every map swap registers it once.
    const host = ensureScene(canvasHost)
    host.onInput.add(input.poll)
    scene = buildBattle(
      host,
      {
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
      updateTileText,
      name,
      collected
    )
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
    open: () => start(map),
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
