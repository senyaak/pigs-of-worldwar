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
import { ANIM } from '../../../lib/game/locomotion'
import { isTrainingGround } from '../../../lib/game/tutorial'
import { targetsOf } from '../../../lib/game/targets'
import type { Target } from '../../../lib/game/targets'
import { aimRadians } from '../../../lib/game/aim'
import { weaponModelName } from '../../../lib/game/weapons'
import { meleeOf } from '../../../lib/game/melee'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildMapProps } from './props'
import { fieldSquad } from './squad'
import type { Soldier, SoldierArt } from './squad'
import { SCOPE_BONE, SCOPE_MAGNIFY, SCOPE_MOUNT, createChase } from './chase'
import type { View } from './chase'
import { NO_DROP_IN, createDropIn } from '../../../lib/game/dropIn'
import { createDropInArt } from './dropIn'
import { buildMarker } from './marker'
import { createHeldWeapons } from './heldWeapon'
import { createStrikes } from '../../../lib/game/strikes'
import { createBattle } from '../../../lib/game/battle'
import { createBonePose } from './bonePose'
import { createAnim } from '../../../lib/game/anim'
import { createWear } from './wear'
import { createDamageNumbers } from '../../../lib/game/damage'
import { projectDamage } from './damageNumbers'
import { createEffectField } from '../../../lib/game/effectField'
import { createEffectArt } from './effects'
import { createAirDrops } from '../../../lib/game/airDrop'
import { createAirDropArt } from './airDrop'
import { createScenery } from '../../../lib/game/scenery'
import type { Collected } from '../../../lib/game/scenery'
import { FRAME_SECONDS } from '../../../lib/game/ballistics'
import { createBullets } from '../../../lib/game/bullets'
import { createBulletArt } from './shots'
import { createLobs } from '../../../lib/game/lobs'
import { createGrenadeArt } from './grenades'
import { createPigVoice } from '../audio/pigVoice'
import { exposeBattleDebug } from './debug'
import { SILENT, loadBank } from '../audio/bank'
import { BARREL_SOUND, BATTLE_SOUNDS, createBattleSounds, playCue } from '../audio/battle'
import { createSoundConsole } from '../audio/console'
import type { Bank } from '../audio/bank'
import type { FloatingNumber, PigPlate } from '../contracts/overlay'
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
  /** `gtext`, the battle's own strings — the skill names among them
   * (lib/game/skills.ts). Empty is fine: a battle plays without them. */
  strings: string[]
  /** `WE_PARA` out of `Chars/WEAPONS.MAD` — the canopy the drop-in hangs
   * under. Null is fine: a map whose squad parachutes simply stands instead
   * of dropping under nothing (three/dropIn.ts). */
  canopy: { model: Model; textures: Texture[] } | null
}

export interface BattleScene {
  /** Point the camera at the active pig and park the marker over it. */
  focus(pig: Pig): void
  /** Whether the level's opening drop is still going: what the dashboard
   * shows the mission's title card over. */
  dropping(): boolean
  /** Where each living pig's name hangs, in a view this big — the camera
   * lives here, so the dashboard asks rather than guesses. `lift` is the
   * dashboard's own clearance over the pig's crown; the scene projects and
   * does not decide it (contracts/overlay.ts). */
  plates(width: number, height: number, lift: number): PigPlate[]
  /** Seconds the acting pig has stood still: the names come back with it. */
  still(): number
  /** The damage numbers floating over the battle, projected into a view this
   * big — the dashboard draws them in the game's own letters. */
  numbers(width: number, height: number): FloatingNumber[]
  /** Tank controls from the input layer: walk -1|0|1 (back/stop/forward),
   * turn -1|0|1 (left/stop/right). */
  setIntent(walk: number, turn: number): void
  /** Ask the acting pig to jump (ignored mid-air, swimming or sliding). */
  jump(): void
  /**
   * Whether the fire button is DOWN, and whether it went down THIS frame.
   *
   * Held, because the power gauge is what being held means: a weapon with one
   * charges while it is and throws when it is not (lib/game/gauge.ts). Everything
   * else goes off on the press — and the press arrives as its own flag rather
   * than being worked out from `held` rising, because a control set that does not
   * read the fire key reports it up while the player is holding it, and leaving
   * that set would otherwise look like a fresh press (lib/game/controls.ts).
   */
  setFiring(held: boolean, pressed: boolean): void
  /** How full the power gauge is, 0..1 — or null when nothing is charging,
   * which is what the dashboard hides it on. */
  charging(): number | null
  /** Point the weapon in hand: -1 down, 0 nothing held, +1 up. */
  setAim(direction: number): void
  /** Whether the aim view is being HELD. The original keeps camera mode 0x0E
   * for exactly as long as its pad bit is down and puts the remembered mode
   * back the frame it goes up (three/chase.ts). */
  setSighting(held: boolean): void
  /** Whether the view is actually down the barrel — held AND holding a gun,
   * which is what the scope's ring is drawn over (ui/hud.ts). */
  scoped(): boolean
  /**
   * The three states the CONTROL SET turns on that only the scene knows
   * (`lib/game/controls.ts`) — asked for as a group rather than mirrored out one
   * accessor at a time.
   */
  situation(): {
    starting: boolean
    locked: boolean
    charging: boolean
    armed: boolean
    /** Whether the aim view can be entered AT ALL — what is in hand has to be
     * something that points. Without this the key hands over the sights whatever
     * the pig is carrying, and since a change of set drops the driving keys, G
     * with empty hands simply stopped the pig. Play: "нажатие g когда нельзя
     * прицеливаться всё ещё отменяет движение". */
    sights: boolean
  }
  /** End the beat at the top of a turn. The `starting` control set's whole rule:
   * any input starts the turn, and the same input is then re-read in the set that
   * follows (lib/game/controls.ts). */
  beginTurn(): void
  /** Where the weapon in hand points, in the game's own angle units, or null
   * when the pig is holding nothing that aims (lib/game/aim.ts). */
  aim(): number | null
  /** Play one of the battle's own effects by name — what the dashboard uses
   * for the noises that belong to the game rather than to a pig. */
  sound(name: string): void
  dispose(): void
}

/** The battle's sound bank — 99 numbered effects (lib/formats/srl.ts). */
const GAME_SOUNDS = 'Audio/sfxday.srl'

export function buildBattle(
  host: SceneHost,
  assets: BattleAssets,
  game: Game,
  /** Called whenever the game state changed this frame (HUD refresh). */
  onGameChanged: () => void,
  /** Which map this is — the training ground hands out its crates on its own
   * terms (lib/game/pickups.ts). */
  map: string,
  /** Called once per crate the acting pig walks into. */
  onCollected: (collected: Collected) => void
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
  const training = isTrainingGround(map)

  /**
   * The crates, the map's SCRIPT and the collision world — all the engine's
   * (lib/game/scenery.ts). Field 14 is an opcode and the objects are the
   * program: most of what CAMP carries is not on its ground at the start, and
   * each of them arrives when the thing it waits on has been finished off.
   */
  const scenery = createScenery(
    assets.objects,
    training,
    () => game.currentPig,
    {
      shown: (id, visible) => props.show(id, visible),
      taken: (id) => props.take(id),
      drop: (id, fromY) => airDrops.send(id, fromY),
      collected: onCollected,
      gotCrate: () => playCue(bank, BATTLE_SOUNDS.pickup),
      refusedCrate: () => playCue(bank, BATTLE_SOUNDS.tooMany)
    }
  )
  const obstacles = scenery.obstacles
  /** The canopy art a descent wears, and the record it lifts (three/airDrop). */
  const airDropArt = createAirDropArt(props, assets.canopy)
  /** Crates that come down under a canopy, because the script says they are
   * pickups and the placer drops those from 0xC00 up — the DESCENT is the
   * engine's, because the beat after a blow waits on it (lib/game/airDrop.ts). */
  const airDrops = createAirDrops(
    { groundOf: (id) => scenery.restingY(id), at: (id) => scenery.at(id) },
    {
      sent: (id) => {
        airDropArt.open(id)
        // The aeroplane first, then the canopy a beat later. Neither was making
        // any noise at all: the bank's `chute` had been decoded far enough to
        // name and then never played (audio/battle.ts).
        playCue(bank, BATTLE_SOUNDS.plane)
      },
      chuted: () => playCue(bank, BATTLE_SOUNDS.chute),
      landed: (id, at) => {
        airDropArt.cut(id)
        playCue(bank, BATTLE_SOUNDS.land)
        obstacles.restore(id)
        // A crate arriving kicks something up. Play named it — "там ещё эффект
        // от падения" — and this is the remake's own: nothing has been read that
        // spawns an effect for a placed object. It takes row 0's SMOKE and not
        // its fire, because a crate landing raises dust — and play saw what
        // happened when it got the whole row ("коробка когда падает — искрит").
        effects.dust(at)
      }
    }
  )
  // The battle's own sound bank, loaded beside the scene: silence until it
  // arrives, and silence for good if the install has no Audio folder.
  let bank: Bank = SILENT
  let sounds = createBattleSounds(bank)
  void loadBank(GAME_SOUNDS).then((loaded) => {
    bank = loaded
    sounds = createBattleSounds(bank)
  })
  // …and the console gets at it, because half the table is a name pick that
  // only play can settle: `pow.sfx.list()`, `pow.sfx.set('jump', …)`.
  if (window.pow) window.pow.sfx = createSoundConsole(() => bank)

  const squad = fieldSquad(assets, game.players.flatMap((player) => player.pigs), query, root)
  // The pose PORT: the one thing a blow cannot work out for itself. Everything
  // that reaches for a bone — the blade, the muzzle, the scope's eye — goes
  // through this, so none of them holds a mesh (lib/game/pose.ts).
  const pose = createBonePose(squad, root)
  /** What each pig is playing, and whether a committed clip has run out — the
   * engine's, so the frame's order of events no longer asks a mixer
   * (lib/game/anim.ts). */
  const anim = createAnim(assets.clips)
  /** …and the mixers being made to agree with it, once a frame. */
  const wear = createWear(squad, anim)
  // The level opens with whoever the map's markers say drops in. Built after
  // the squad because it LIFTS them off it.
  const dropInArt = createDropInArt(squad, assets.canopy)
  /** The opening drop — the ENGINE's phase, because nothing else in the battle
   * runs while it lasts (lib/game/dropIn.ts). A map with no canopy art stands
   * its squad on the markers instead, which is what an art-less `open` does. */
  const dropIn = assets.canopy
    ? createDropIn(
        game.players.flatMap((player) => player.pigs),
        query,
        {
          opened: (pig) => dropInArt.open(pig),
          cut: (pig) => dropInArt.cut(pig),
          clip: (pig, index, once) => {
            const soldier = squad.of(pig)
            if (once) anim.playOnce(pig, index)
            else anim.setClip(pig, index)
          },
          landed: () => playCue(bank, BATTLE_SOUNDS.land)
        }
      )
    : NO_DROP_IN
  // Up they go, before the first frame is drawn: the engine has already lifted
  // them, and a squad standing on its markers for one frame reads as a stutter.
  dropInArt.draw(dropIn.live())
  /** Whether the canopies have been heard opening yet. The bank arrives a beat
   * after the scene does, so they cannot simply be played on frame one. */
  let chuteHeard = false
  const marker = buildMarker(root)
  const chase = createChase(host.camera, query, (x, y, z) => {
    // What the projectile camera swings around: the map's boxes, and the
    // ground itself where it stands above the line. `surface` rather than
    // `height` so a water sheet does not read as a wall (lib/game/terrain.ts).
    if (obstacles.solid(x, y, z)) return true
    // Y-DOWN, so underground is a LARGER y — and with a margin, because a
    // grenade lying still sits exactly on the surface and must not read as
    // buried in it.
    return y - query.surface(x, z) > 100
  })

  host.scene.add(root)
  host.camera.near = 10
  host.camera.far = 100_000
  host.camera.updateProjectionMatrix()

  let time = 0
  /** `[0x4bd6c8]` — how far toward the hand the camera's HEIGHT moves in one
   * engine frame (0x4a3072). A third, and no more. */
  const EYE_LAG = 0.333
  /** The eye as of the last ENGINE frame, and which frame that was. */
  let heldEye = { x: 0, y: 0, z: 0 }
  let eyeFrame = -1
  /** Whether there is a previous height for the lag below to come from. */
  let settled = false
  /** The weapons in hand, one mesh per pig that has one out. */
  const weapons = createHeldWeapons()
  /** The damage that floats off whatever was just hit — the original's own
   * effect, showing points (three/damageNumbers.ts). */
  const numbers = createDamageNumbers()
  /** The rings a blow throws — the original's effect system, and the ENGINE's
   * list of what is running (lib/game/effectField.ts). */
  const effects = createEffectField()
  /** …and the bands, puffs and sprites that show them (three/effects.ts). */
  const effectArt = createEffectArt(root)
  /** The field of view the camera had before anything magnified it. */
  const openFov = host.camera.fov
  /** The pigs' own barks. The gun arm of `Pig::Fire` says one every shot,
   * walking twelve lines in rotation (audio/pigVoice.ts). */
  const voice = createPigVoice()
  /**
   * The training ground's dummies — the other thing a blow can land on, and
   * the only one that is not a pig (lib/game/targets.ts).
   *
   * ONE list, shared by the blade and the barrel. Each of them splices a
   * dummy out when it goes down, so two lists meant a dummy shot dead was
   * still standing as far as the bayonet was concerned — killable a second
   * time, and its script step run twice.
   */
  const targets = targetsOf(assets.objects)
  /** What every weapon does when a dummy comes apart — the ENGINE's, because
   * the exe hangs it on the OBJECT rather than on the blow (lib/game/battle). */
  const onBroken = (target: Target): void => battle.broke(target)
  /**
   * What a bayonet does when the fire key goes down — the ENGINE's, blade and
   * all (lib/game/strikes.ts). The aim angle is deliberately not in it.
   */
  const swings = createStrikes(
    {
      pigs: () => game.players.flatMap((player) => player.pigs),
      targets,
      // A dummy the script has not placed yet is not a target: the exe's own
      // strike tests `[obj+0x30]`, the placed flag, before it will hit one
      // (0x476319).
      present: (id) => !scenery.absent(id),
      training,
      pose,
      clips: assets.clips
    },
    {
      clip: (pig, index) => anim.playOnce(pig, index),
      whoosh: () => playCue(bank, BATTLE_SOUNDS.whoosh),
      landed: (skill, at) => {
        const weapon = meleeOf(skill)
        if (weapon) playCue(bank, BATTLE_SOUNDS[weapon.impact])
        effects.hit(skill, at)
      },
      damaged: (at, amount) => numbers.show(at, amount),
      killed: (pig) => anim.playOnce(pig, ANIM.DYING),
      broken: onBroken
    }
  )
  /**
   * What a GUN does when the fire key goes down — and it is the ENGINE's now
   * (lib/game/bullets.ts): the flight, the substepping and every verdict about
   * what was hit. This scene supplies the world it flies through and shows what
   * it announces.
   */
  const shots = createBullets(
    {
      pigs: () => game.players.flatMap((player) => player.pigs),
      targets,
      present: (id) => !scenery.absent(id),
      query,
      obstacles,
      training,
      pose
    },
    {
      fired: (skill) => playCue(bank, BATTLE_SOUNDS[BARREL_SOUND[skill] ?? 'rifle']),
      damaged: (at, amount) => numbers.show(at, amount),
      killed: (pig) => anim.playOnce(pig, ANIM.DYING),
      broken: onBroken
    }
  )
  /** The spheres that show them (three/shots.ts). */
  const bulletArt = createBulletArt(root)
  /**
   * …and what a GRENADE does, which is a parabola rather than a line — also
   * the engine's (lib/game/lobs.ts). Same dummy list, same reason.
   */
  const grenades = createLobs(
    {
      pigs: () => game.players.flatMap((player) => player.pigs),
      targets,
      present: (id) => !scenery.absent(id),
      query,
      obstacles,
      training,
      pose
    },
    {
      splashed: () => playCue(bank, BATTLE_SOUNDS.splash),
      skimmed: (at) => {
        playCue(bank, BATTLE_SOUNDS.skim)
        effects.splash(at)
      },
      doused: (at) => {
        // The splash is drawn on the WATER LINE however deep it gets, because
        // effect 0x0E snaps its own y there (0x488c19).
        effects.splash(at)
        playCue(bank, BATTLE_SOUNDS.doused)
      },
      blasted: (at) => {
        effects.blast(at)
        playCue(bank, BATTLE_SOUNDS.blast)
        // Stay on the spot for the beat the blow's own wait gives it, which is
        // what makes the burst visible at all: the camera leaves the grenade the
        // frame it stops existing (lib/game/aftermath.ts).
        battle.blasted(at)
      },
      damaged: (at, amount) => numbers.show(at, amount),
      killed: (pig) => anim.playOnce(pig, ANIM.DYING),
      broken: onBroken
    }
  )
  /** The models and the smoke behind them (three/grenades.ts). */
  const grenadeArt = createGrenadeArt(root)
  /** Seconds left of the getting-it-out clip. The exe puts the model in the
   * hand only once that has run (`[pig+0x2fd]`, exe 0x4702c3), so the pig
  /**
   * Camera and marker onto a pig, wherever it happens to be standing — or
   * hanging: a pig still on its canopy is watched from the front, face on,
   * and one mid-swing from the side, which is the original's own camera mode
   * for a hand-to-hand attack and the only thing that uses it (three/chase).
   */
  /**
   * Where the scope looks FROM: `SCOPE_MOUNT` in the hand bone's space, in
   * game space. The exe's rifle cam is bolted there (0x4a2ec0) and that is
   * where its wobble comes from — the hand rides a breathing chest.
   */
  const scopeEye = (soldier: Soldier): { x: number; y: number; z: number } => {
    // ONCE AN ENGINE FRAME, and held in between. The exe places this camera
    // once per game frame at fifteen a second; sampling an interpolated
    // skeleton at sixty turns the same breath into a glide, which is exactly
    // what play saw — "щас плавает, а в оригинале прям дрожит". The pose
    // itself still interpolates, so the pig moves smoothly and the view it is
    // holding does not.
    const frame = Math.floor(time / FRAME_SECONDS)
    if (frame === eyeFrame) return heldEye
    // A gap means the sights were down in between; start the lag afresh.
    if (frame > eyeFrame + 1) settled = false
    eyeFrame = frame
    const eyeAt = pose.boneToWorld(soldier.pig, SCOPE_BONE, SCOPE_MOUNT) ?? heldEye
    // …and the HEIGHT LAGS. The exe does not put the camera at the hand's y —
    // it moves a THIRD of the way there each frame and no further:
    //
    //   4a304e  eax = boneY - cameraY
    //   4a3072  ...times the double at 0x4bd6c8, which is 0.333
    //   4a3082  bp += that
    //
    // x and z are taken outright. So the picture snaps sideways with the hand
    // and drags vertically behind it, which is a good deal less steady than
    // either axis is on its own. `eyeFrame < 0` is the first frame of a
    // sighting, where there is nothing to lag from.
    heldEye = {
      x: eyeAt.x,
      y: settled ? heldEye.y + (eyeAt.y - heldEye.y) * EYE_LAG : eyeAt.y,
      z: eyeAt.z
    }
    settled = true
    return heldEye
  }

  const watch = (soldier: Soldier, delta: number | null): void => {
    const now = battle.view()
    // A bullet in the air takes the camera off the pig altogether: the shot's
    // own tail hands the camera the projectile and asks for mode 1
    // (0x47ad99). Only the acting pig's shot does this, and only while there
    // is something left to watch.
    const bullet = now.firing?.phase === 'flight' ? (shots.head() ?? grenades.head()) : null
    if (bullet && soldier === squad.of(game.currentPig)) {
      chase.ride(bullet, Math.atan2(bullet.vx, bullet.vz), delta)
      soldier.node.visible = true
      return
    }
    // …and so does what the blow left behind. Mode 0 on the crate, which is
    // the ordinary chase rig with something other than a pig in it
    // (0x4661c2).
    if (now.aftermath && soldier === squad.of(game.currentPig)) {
      chase.ride(now.aftermath.at, soldier.pig.heading, delta)
      soldier.node.visible = true
      return
    }
    const view: View = dropIn.underCanopy(soldier.pig)
      ? 'face'
      : soldier === squad.of(game.currentPig) && swings.running()
        ? 'melee'
        : // The aim view, held, and only for something that shoots — the exe
          // picks mode 0x0E by WEAPON (0x492dfa) and gates it on the same test
          // the melee camera is gated on, which is false through a swing.
          soldier === squad.of(game.currentPig) && now.scoped
          ? 'scope'
          : 'chase'
    chase.follow(
      soldier.pig,
      soldier.node.position.y,
      dropInArt.riseOver(soldier.pig),
      delta,
      view,
      // The camera looks along the AIM, tremor and all — the picture FOLLOWS the
      // sight, which is what play asked for and what makes it honest.
      aimRadians(now.aimAngle),
      0,
      view === 'scope' ? scopeEye(soldier) : null
    )
    // The pig's own body is IN the way of its own eye. Hide the acting model
    // while the scope is up — every other pig stays, because those are what
    // is being aimed at.
    soldier.node.visible = view !== 'scope'
  }

  /**
   * The battle itself — the whole order of events in a frame, and none of it
   * here (lib/game/battle.ts). This file's job below is to READ what it did.
   */
  const battle = createBattle(
    {
      game,
      query,
      scenery,
      anim,
      clips: assets.clips,
      shots,
      grenades,
      swings,
      effects,
      numbers,
      airDrops,
      dropIn,
      onChanged: onGameChanged
    },
    {
      cameraReset: () => chase.reset(),
      cutCanopies: () => airDropArt.cutAll(),
      // There was no confirmation at all for SKIP TURN and play asked for one;
      // the cue is a name pick and `audio/battle.ts` says which.
      skillUsed: () => playCue(bank, BATTLE_SOUNDS.skillUsed),
      bark: (player: number) => voice.fire(player)
    }
  )

  /** Take the battle to a pig, and the camera and marker with it. */
  const focus = (pig: Pig): void => {
    battle.focus(pig)
    sounds.reset()
    marker.moveTo(pig.position.x, query.height(pig.position.x, pig.position.z), pig.position.z)
    const soldier = squad.of(pig)
    if (soldier) watch(soldier, null)
  }

  /**
   * Everything the frame LOOKS like, read back off the battle once it has run.
   *
   * Every branch the engine takes — the drop, the beat after a blow, an
   * ordinary frame — ends up watching the SAME pig, the acting one, so the
   * camera is placed once here rather than at each of the engine's own exits.
   */
  const show = (delta: number): void => {
    const now = battle.view()
    // The squad coming down: each pig where its own descent has got to, and
    // the canopies heard the first frame the bank can play them.
    dropInArt.draw(dropIn.live())
    if (dropIn.running()) {
      if (!chuteHeard && bank.has(BATTLE_SOUNDS.chute.sound)) {
        playCue(bank, BATTLE_SOUNDS.chute)
        chuteHeard = true
      }
    }
    const active = squad.of(game.currentPig)
    if (!active) return
    if (!dropIn.running() && !game.starting && !game.over) {
      // The acting pig stands where the locomotion state says, and the camera
      // stops holding the moment the player drives (three/chase.ts).
      chase.hold(
        now.loco.airborne?.bouncing === true || now.loco.airborne?.ejected === true,
        now.driving,
        delta
      )
      sounds.follow(now.loco, query.isWater(now.loco.x, now.loco.z))
      active.place(now.loco.x, now.loco.y, now.loco.z, now.loco.heading)
      marker.moveTo(now.loco.x, query.height(now.loco.x, now.loco.z), now.loco.z)
      // The model is not in the hand until the getting-it-out clip has run.
      for (const soldier of squad.members) {
        const reaching = soldier === active && now.readying > 0
        weapons.show(soldier.mesh, reaching ? null : weaponModelName(soldier.pig.holding))
      }
    }
    // A magnified view really is magnified. Where 0x1000 of `afSetZoom` puts a
    // field of view is the library's and the library is not in the install, so
    // SCOPE_MAGNIFY is the remake's pick and three/chase.ts says so.
    const magnified = openFov / (1 + now.zoom * (SCOPE_MAGNIFY - 1))
    if (Math.abs(host.camera.fov - magnified) > 1e-4) {
      host.camera.fov = magnified
      host.camera.updateProjectionMatrix()
    }
    watch(active, delta)
  }


  const onFrame = (delta: number): void => {
    time += delta
    // ONE frame of the game, and then everything that shows it.
    battle.update(delta)
    // The engine's committed clips burn down, and every mixer is brought into
    // line with what it now says (three/wear.ts).
    anim.update(delta)
    wear.apply()
    show(delta)
    numbers.update(delta)
    effects.update(delta)
    shots.update(delta)
    grenades.update(delta)
    airDrops.update(delta)
    squad.update(delta)
    marker.bob(time)
    // …and what the engine says is in the air gets drawn where it now is. Once
    // a frame, after everything that could have moved or spent one.
    bulletArt.draw(shots.live())
    grenadeArt.draw(grenades.all(), delta)
    effectArt.draw(effects.all())
    airDropArt.draw(airDrops.live())
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
    still: () => battle.view().still,
    strings: () => assets.strings,
    swinging: () => swings.running(),
    strike: () => swings.lastStrike(),
    effects: () => effects.rings(),
    smoke: () => effects.smoke(),
    fire: () => effects.fire(),
    script: () => ({ absent: scenery.waiting(), falling: airDrops.falling() }),
    shots: () => shots.live().length,
    aim: () => battle.aim(),
    grenades: () => grenades.at(),
    charging: () => battle.charging(),
    firing: () => battle.view().firing?.phase ?? null,
    barks: () => voice.spoken(),
    aftermath: () => battle.view().aftermath !== null,
    warp: (x, z, heading) => {
      battle.warp(x, z, heading)
      const pig = game.currentPig
      squad.of(pig)?.place(pig.position.x, pig.position.y, pig.position.z, pig.heading)
    }
  })

  return {
    focus,
    dropping: () => dropIn.running(),
    plates: (width, height, lift) => squad.plates(host.camera, width, height, lift),
    numbers: (width, height) => projectDamage(numbers.all(), host.camera, root, width, height),
    still: () => battle.view().still,
    setIntent: battle.setIntent,
    jump: battle.jump,
    setFiring: battle.setFiring,
    charging: battle.charging,
    setAim: battle.setAim,
    setSighting: battle.setSighting,
    scoped: () => battle.view().scoped,
    beginTurn: battle.beginTurn,
    situation: battle.situation,
    aim: battle.aim,
    sound(name) {
      bank.play(name)
    },
    dispose() {
      host.onFrame.delete(onFrame)
      host.scene.remove(root)
      terrain.dispose()
      props.dispose()
      dropInArt.dispose()
      marker.dispose()
      effectArt.dispose()
      bulletArt.dispose()
      grenadeArt.dispose()
      voice.dispose()
      airDropArt.dispose()
      weapons.dispose()
      squad.dispose()
      bank.dispose()
    }
  }
}
