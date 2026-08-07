// The battle scene, assembled: a real map, the map's own squads standing on
// it, and one frame loop that drives them.
//
// Everything game-space (Y-down) under the usual 180°-X group. What this
// file owns is the WIRING and the frame's order of events; the pieces each
// live next door — `squad.ts` the pigs, `chase.ts` the camera, `dropIn.ts`
// the level's opening, `marker.ts` the pointer, `debug.ts` the window the
// e2e suite looks through. The rules themselves are pure and live in
// `lib/game`; this scene feeds them intents and draws what they say.

import * as THREE from 'three'
import type { Bone, Clip, MapObject, MapProp, Model, TerrainBlock, TerrainTexture, Texture } from '../api'
import type { Game, Pig } from '../../../lib/game/game'
import { TerrainQuery } from '../../../lib/game/terrain'
import { buildWaterMask } from '../../../lib/game/watermask'
import { ANIM, PLAYED_ONCE, createLocomotion, updateLocomotion } from '../../../lib/game/locomotion'
import type { LocomotionState } from '../../../lib/game/locomotion'
import { ObstacleField, withPigs } from '../../../lib/game/obstacles'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildMapProps } from './props'
import { fieldSquad } from './squad'
import type { Soldier, SoldierArt } from './squad'
import { createChase } from './chase'
import { createDropIn } from './dropIn'
import { buildMarker } from './marker'
import { exposeBattleDebug } from './debug'
import { SILENT, loadBank } from '../audio/bank'
import { createBattleSounds } from '../audio/battle'
import type { Bank } from '../audio/bank'
import type { PigPlate } from '../ui/hud'
import type { SceneHost } from './scene'

export type { SoldierArt } from './squad'

export interface BattleAssets {
  blocks: TerrainBlock[]
  terrainTextures: TerrainTexture[]
  /** Every model the squads need — one per class group on the map. The
   * first is the fallback for a class nothing loaded art for. */
  soldiers: SoldierArt[]
  skeleton: Bone[]
  clips: Clip[]
  /** The map's .POG records and the geometry they name. Empty is fine — a
   * map whose objects failed to load still plays. */
  objects: MapObject[]
  props: MapProp[]
  propTextures: Texture[]
  /** `WE_PARA` out of `Chars/WEAPONS.MAD` — the canopy the drop-in hangs
   * under. Null is fine: a map whose squad parachutes simply stands instead
   * of dropping under nothing (three/dropIn.ts). */
  canopy: { model: Model; textures: Texture[] } | null
}

export interface BattleScene {
  /** Point the camera at the active pig and park the marker over it. */
  focus(pig: Pig): void
  /** Where each living pig's name hangs, in a view this big — the camera
   * lives here, so the dashboard asks rather than guesses. */
  plates(width: number, height: number): PigPlate[]
  /** Seconds the acting pig has stood still: the names come back with it. */
  still(): number
  /** Tank controls from the input layer: walk -1|0|1 (back/stop/forward),
   * turn -1|0|1 (left/stop/right). */
  setIntent(walk: number, turn: number): void
  /** Ask the acting pig to jump (ignored mid-air, swimming or sliding). */
  jump(): void
  dispose(): void
}

/** The battle's sound bank — 99 numbered effects (lib/formats/srl.ts). */
const GAME_SOUNDS = 'Audio/sfxday.srl'

export function buildBattle(
  host: SceneHost,
  assets: BattleAssets,
  game: Game,
  /** Called whenever the game state changed this frame (HUD refresh). */
  onGameChanged: () => void
): BattleScene {
  // The per-texel water verdict rides on the same art the ground draws —
  // a pig stands on the painted dry half of a shore tile and swims one
  // step further, exactly where the water shows.
  const query = new TerrainQuery(assets.blocks, buildWaterMask(assets.blocks, assets.terrainTextures))
  const root = new THREE.Group()
  root.rotation.x = Math.PI

  const terrain: Terrain = buildTerrain(assets.blocks, assets.terrainTextures)
  // buildTerrain wraps in its own converted group; unwrap into ours. Its
  // one child is the inner game-space group — ground and water together.
  root.add(terrain.group.children[0])

  // Whatever the map stands on its ground: trees, crates, bridges, and on
  // the training map the dummies and the gate.
  const props = buildMapProps(assets.objects, assets.props, assets.propTextures)
  root.add(props.group)
  // The same records, as things to walk into. Static for the map's life —
  // only the pigs move, and they join per frame.
  const obstacles = new ObstacleField(assets.objects)

  // The battle's own sound bank, loaded beside the scene: silence until it
  // arrives, and silence for good if the install has no Audio folder.
  let bank: Bank = SILENT
  let sounds = createBattleSounds(bank)
  void loadBank(GAME_SOUNDS).then((loaded) => {
    bank = loaded
    sounds = createBattleSounds(bank)
  })

  const squad = fieldSquad(assets, game.players.flatMap((player) => player.pigs), query, root)
  // The level opens with whoever the map's markers say drops in. Built after
  // the squad because it LIFTS them off it.
  const dropIn = createDropIn(squad, query, assets.canopy, () => bank)
  const marker = buildMarker(root)
  const chase = createChase(host.camera, query)

  host.scene.add(root)
  host.camera.near = 10
  host.camera.far = 100_000
  host.camera.updateProjectionMatrix()

  let time = 0
  /** Seconds the acting pig has stood still, and where it stood. */
  let still = 0
  let stillAt = { x: 0, z: 0, heading: 0 }
  const intent = { walk: 0, turn: 0 }
  let jumpRequested = false
  /** The acting pig's frame-by-frame state — walking, wedged, airborne —
   * lives in the pure domain (lib/game/locomotion); this scene only feeds
   * it intents and draws what it says. Reset whenever the acting pig
   * changes or is warped. */
  let loco: LocomotionState = createLocomotion(query, 0, 0, 0)

  /** Camera and marker onto a pig, wherever it happens to be standing. */
  const watch = (soldier: Soldier, delta: number | null): void => {
    chase.follow(soldier.pig, soldier.node.position.y, dropIn.riseOver(soldier), delta)
  }

  const focus = (pig: Pig): void => {
    loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading)
    sounds.reset()
    chase.reset()
    marker.moveTo(pig.position.x, query.height(pig.position.x, pig.position.z), pig.position.z)
    const soldier = squad.of(pig)
    if (soldier) watch(soldier, null)
  }

  const update = (delta: number): void => {
    // The level's opening drop stops everything else: no turn clock, no
    // walking, because the original's parachute branch does nothing else
    // either. The ONE thing it does answer is the jump key, which cuts the
    // canopies away — so `jumpRequested` is spent here rather than saved up
    // for the first frame of the turn.
    if (dropIn.update(delta, jumpRequested)) {
      jumpRequested = false
      const arriving = squad.of(game.currentPig)
      if (arriving) watch(arriving, delta)
      onGameChanged()
      return
    }

    // The turn clock runs regardless of what anyone does.
    if (game.tick(delta)) {
      game.endTurn()
      jumpRequested = false
      focus(game.currentPig)
    }

    const active = squad.of(game.currentPig)
    if (!active) return
    for (const soldier of squad.members) if (soldier !== active) soldier.setClip(ANIM.IDLE)

    // Position and facing are the game's; everything else the frame needs —
    // height, momentum, the wedge clock, which clip to wear — lives in the
    // locomotion state. Sync in, step one frame of the domain, sync back,
    // and draw exactly what it says.
    loco.x = active.pig.position.x
    loco.z = active.pig.position.z
    loco.heading = active.pig.heading
    updateLocomotion(
      loco,
      query,
      { walk: intent.walk, turn: intent.turn, jump: jumpRequested },
      delta,
      // The squad is in the way too: every pig but the acting one, as the
      // body its own spawn marker measured (lib/game/obstacles).
      withPigs(obstacles, squad.bodies(active))
    )
    jumpRequested = false
    chase.hold(
      loco.airborne?.bouncing === true || loco.airborne?.ejected === true,
      intent.walk !== 0 || intent.turn !== 0,
      delta
    )
    sounds.follow(loco, query.isWater(loco.x, loco.z))
    game.moveCurrentPig(loco.x, loco.z, loco.heading)
    active.place(loco.x, loco.y, loco.z, loco.heading)
    // A committed clip is started once and then left alone; a state clip is
    // simply worn. `setClip` is inert while a one-shot runs, so the walking's
    // own choice waits its turn rather than cutting a get-up in half.
    if (PLAYED_ONCE.has(loco.clip)) {
      if (!active.animating()) active.playOnce(loco.clip)
    } else {
      active.setClip(loco.clip)
    }

    // How long the pig has done nothing: what brings its name plate back.
    // Being driven, being in the air or being pushed all count as moving.
    const busy =
      intent.walk !== 0 ||
      intent.turn !== 0 ||
      loco.airborne !== null ||
      Math.hypot(loco.x - stillAt.x, loco.z - stillAt.z) > 1 ||
      Math.abs(loco.heading - stillAt.heading) > 1e-3
    still = busy ? 0 : still + delta
    stillAt = { x: loco.x, z: loco.z, heading: loco.heading }

    // Marker and camera trail the pig every frame.
    marker.moveTo(loco.x, query.height(loco.x, loco.z), loco.z)
    watch(active, delta)
    onGameChanged()
  }

  const onFrame = (delta: number): void => {
    time += delta
    update(delta)
    squad.update(delta)
    marker.bob(time)
  }
  host.onFrame.add(onFrame)

  exposeBattleDebug({
    game,
    query,
    squad,
    dropIn,
    props,
    objectCount: assets.objects.length,
    camera: host.camera,
    bank: () => bank,
    still: () => still,
    warp: (x, z, heading) => {
      game.moveCurrentPig(x, z, heading)
      loco = createLocomotion(query, x, z, heading)
      const soldier = squad.of(game.currentPig)
      if (!soldier) return
      soldier.place(x, loco.y, z, heading)
    }
  })

  return {
    focus,
    plates: (width, height) => squad.plates(host.camera, width, height),
    still: () => still,
    setIntent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    jump() {
      jumpRequested = true
    },
    dispose() {
      host.onFrame.delete(onFrame)
      host.scene.remove(root)
      terrain.dispose()
      props.dispose()
      dropIn.dispose()
      marker.dispose()
      squad.dispose()
      bank.dispose()
    }
  }
}
