// The window the e2e suite looks through (three/debug.ts).

import * as THREE from 'three'
import { flingSpeed } from '../../../../lib/game/blast'
import { lobOf } from '../../../../lib/game/grenade'
import { flingVelocity } from '../../../../lib/game/tumble'
import { exposeBattleDebug } from '../debug'
import type { SceneCore } from './core'
import { warp } from './jumps'
import { blips, eye } from './mapReadout'

/** Hang the battle's debug surface off the scene. */
export const exposeDebug = (core: SceneCore): void => {
  const {
    host,
    assets,
    query,
    game,
    sounds,
    sky,
    weather,
    props,
    squad,
    link,
    engine,
    battle,
    scenery,
    swings,
    heals,
    shots,
    grenades,
    mines,
    root,
    effects,
    airDrops,
    dropIn,
    grenadeArt,
    mineArt,
    remainsArt,
    decoyArt,
    state
  } = core
  exposeBattleDebug({
    game,
    query,
    obstruction: engine.obstacles,
    squad,
    dropIn,
    props,
    flingOther: () => {
      const other = game.players
        .flatMap((player) => player.pigs)
        .find((pig) => pig !== game.currentPig && pig.health > 0)
      if (!other) return null
      const from = { pig: other.id, x: other.position.x, z: other.position.z }
      // A grenade's own throw at the core — the debug shove is measured
      // against the same weapon a spec would use (lib/game/blast.ts).
      battle.fling(other, flingVelocity(flingSpeed(lobOf(19)?.force ?? 0, 1), 0))
      return from
    },
    // Dead with nobody's blow behind it, so the acting pig's turn is not spent
    // and its camera comes back: the one way to see the spot with the body gone
    // and the view as it was. What happens next is the ordinary `killed`
    // (lib/game/corpses.ts).
    fell: (id) => {
      const pig = game.players.flatMap((player) => player.pigs).find((one) => one.id === id)
      if (!pig) throw new Error(`no pig ${id} to fell`)
      pig.health = 0
      battle.announce({ kind: 'killed', pig: id })
    },
    plates: (width, height) =>
      squad.plates(host.camera, width, height, 0, game.players.indexOf(game.currentPlayer), (pig) =>
        engine.poison.poisoned(pig)
      ),
    hotseat: (on) => {
      link.hotseat = on ?? !link.hotseat
      console.info(
        link.hotseat
          ? 'pow: hotseat ON from the next turn — the enemy is on the keyboard until this battle ends'
          : 'pow: hotseat off — the machine plays the enemy again from the next turn'
      )
      return link.hotseat
    },
    objectCount: assets.objects.length,
    camera: host.camera,
    drawThrough: host.drawThrough,
    canvas: host.canvas,
    // Measured against the eye as it stood at the end of the last frame,
    // which is what `follow` was given.
    sky: () => sky?.state(state.eyeInGame) ?? null,
    weather: () => weather?.state() ?? null,
    sounds: () => sounds.played(),
    barks: () => sounds.spoken(),
    still: () => battle.view().still,
    strings: () => assets.strings,
    swinging: () => swings.running(),
    strike: () => swings.lastStrike(),
    // Why a heal did or did not land: the healing hands' own report, the same
    // rule the blade's is (lib/game/healing.ts).
    heal: () => heals.lastAttempt(),
    effects: () => effects.rings(),
    smoke: () => effects.smoke(),
    fire: () => effects.fire(),
    script: () => ({ absent: scenery.waiting(), falling: airDrops.falling() }),
    shots: () => shots.live().length,
    aim: () => battle.aim(),
    grenades: () => grenades.at(),
    charges: () => grenadeArt.charges(),
    burning: () => grenadeArt.burning(),
    fuseTips: () =>
      grenadeArt.tips().map((tip) => {
        const at = root.localToWorld(new THREE.Vector3(tip.x, tip.y, tip.z)).project(host.camera)
        return { x: at.x, y: at.y, z: at.z }
      }),
    mines: () => mines.at().map((one) => ({ x: one.x, y: one.y, z: one.z, fuse: one.fuse })),
    mineMarkers: () => mineArt.shown(),
    map: () => ({ eye: eye(core), blips: blips(core) }),
    minesTripped: () => mineArt.tripped(),
    // How many pairs of boots are DRAWN — the renderer's own count, not the
    // engine's `remains` event. It exists because the two disagreed silently:
    // the event fired and `spawn('BOOTS')` answered null (lib/game/ammo.ts).
    remains: () => remainsArt.standing(),
    decoys: () => decoyArt.standing(),
    charging: () => battle.charging(),
    firing: () => battle.view().firing?.phase ?? null,

    shelter: () => {
      const view = battle.view()
      const drawn = squad.of(game.currentPig.id)?.node.visible === true
      return { inside: view.inside?.id ?? null, doorway: view.doorway?.id ?? null, drawn }
    },
    frame: () => state.lastFrame,
    view: () => state.lastView,
    brain: () => ({ remote: true, ...link.brainTally }),
    aftermath: () => battle.view().aftermath !== null,
    /**
     * The acting pig's POSE, from BOTH ends of the chain.
     *
     * Play: "реально не двигается у нас" — the body does not move while it walks,
     * and there is no way to tell by eye which half is at fault. `foot` is the
     * engine's own sampler (lib/game/bonePose.ts) reading the ankle relative to
     * the hip, so the pig's own travel is out of it; `drawn` is the quaternion
     * that same bone is actually WEARING on the skinned mesh. If `foot` moves and
     * `drawn` does not, it is the renderer; if neither moves, it is the clip.
     */
    pose: () => {
      const pig = game.currentPig
      const worn = state.now.pigs.find((one) => one.id === pig.id)
      const hip = engine.pose.boneToWorld(pig, 0, { x: 0, y: 0, z: 0 })
      const ankle = engine.pose.boneToWorld(pig, 11, { x: 0, y: 0, z: 0 })
      // …and EVERY bone the mesh is wearing, in HIR order, because "that part of
      // the body does not move at all" is a question about which bones are dead
      // and no summary answers it.
      const bones = squad.of(pig.id)?.mesh.bones ?? []
      const bone = bones[11]
      return {
        clip: worn?.clip ?? null,
        elapsed: worn?.clipElapsed ?? 0,
        // What the keyframe head is doing to the whole body — the bob, on the
        // root bone (lib/game/clipPose.ts).
        lift: bones[0]?.position.y ?? 0,
        bones: bones.map(
          (one) =>
            [one.quaternion.x, one.quaternion.y, one.quaternion.z, one.quaternion.w] as [
              number,
              number,
              number,
              number
            ]
        ),
        foot:
          hip && ankle
            ? ([ankle.x - hip.x, ankle.y - hip.y, ankle.z - hip.z] as [number, number, number])
            : null,
        drawn: bone
          ? ([bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w] as [
              number,
              number,
              number,
              number
            ])
          : null
      }
    },
    walkAway: () => battle.view().walkAway,
    sergeant: () => battle.view().sergeant,
    sargeSpoken: () => sounds.sargeSpoken(),
    ending: () => {
      const ending = battle.view().ending
      return ending === null
        ? null
        : { won: ending.won, watching: ending.watching, elapsed: ending.elapsed }
    },
    targetsLeft: () => engine.targetsLeft(),
    cutTurnBeat: () => battle.cutTurnBeat(),
    warp: (x, z, heading) => warp(core, x, z, heading)
  })
}
