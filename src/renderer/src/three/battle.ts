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
import { ANIM, createLocomotion, updateLocomotion } from '../../../lib/game/locomotion'
import type { LocomotionState } from '../../../lib/game/locomotion'
import { ObstacleField, withPigs } from '../../../lib/game/obstacles'
import { pickupsOf, reached, worthOf } from '../../../lib/game/pickups'
import type { Pickup } from '../../../lib/game/pickups'
import { amountOf, clearSlots, give } from '../../../lib/game/inventory'
import type { GiveResult } from '../../../lib/game/inventory'
import { isTrainingGround } from '../../../lib/game/tutorial'
import { heal, isDead } from '../../../lib/game/health'
import { targetsOf } from '../../../lib/game/targets'
import type { Target } from '../../../lib/game/targets'
import {
  AIM_RAMP,
  AIM_TOP,
  SIGHT_RAMP,
  SIGHT_TOP,
  aimPhase,
  aimRadians,
  createAim,
  rampedStep,
  scrubsPose,
  updateAim
} from '../../../lib/game/aim'
import { weaponModelName, weaponOf } from '../../../lib/game/weapons'
import { meleeOf } from '../../../lib/game/melee'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildMapProps } from './props'
import { fieldSquad } from './squad'
import type { Soldier, SoldierArt } from './squad'
import { SCOPE_BONE, SCOPE_MAGNIFY, SCOPE_MOUNT, createChase } from './chase'
import type { View } from './chase'
import { createDropIn } from './dropIn'
import { buildMarker } from './marker'
import { createHeldWeapons } from './heldWeapon'
import { createSwings } from './swing'
import { createDamageNumbers } from './damageNumbers'
import { createEffects } from './effects'
import { createAirDrops } from './airDrop'
import { createScript } from '../../../lib/game/script'
import { isGun } from '../../../lib/game/projectile'
import { advanceFiring, beginFiring } from '../../../lib/game/shot'
import type { Firing } from '../../../lib/game/shot'
import { advanceAftermath, beginAftermath, watchAftermath } from '../../../lib/game/aftermath'
import type { Aftermath } from '../../../lib/game/aftermath'
import { createWobble, resetWobble, updateWobble, wobblePitch, wobbleYaw } from '../../../lib/game/wobble'
import { createZoom, updateZoom, zoomFraction, zoomedStep, zoomsIn } from '../../../lib/game/zoom'
import { EXE_FRAME_SECONDS, FRAME_SECONDS } from '../../../lib/game/ballistics'
import { createShots } from './shots'
import { createGrenades } from './grenades'
import { isLobbed } from '../../../lib/game/grenade'
import { SKILL } from '../../../lib/game/skills'
import { beginGauge, chargeGauge, gaugeFraction } from '../../../lib/game/gauge'
import type { Gauge } from '../../../lib/game/gauge'
import { createPigVoice } from '../audio/pigVoice'
import type { FloatingNumber } from './damageNumbers'
import { exposeBattleDebug } from './debug'
import { clipSeconds } from './clips'
import { SILENT, loadBank } from '../audio/bank'
import { BATTLE_SOUNDS, createBattleSounds, playCue } from '../audio/battle'
import { layerFires, layerSights, weaponLayer } from '../../../lib/game/controls'
import { createSoundConsole } from '../audio/console'
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
  /** `gtext`, the battle's own strings — the skill names among them
   * (lib/game/skills.ts). Empty is fine: a battle plays without them. */
  strings: string[]
  /** `WE_PARA` out of `Chars/WEAPONS.MAD` — the canopy the drop-in hangs
   * under. Null is fine: a map whose squad parachutes simply stands instead
   * of dropping under nothing (three/dropIn.ts). */
  canopy: { model: Model; textures: Texture[] } | null
}

/** A crate the acting pig has just walked into. */
export interface Collected {
  /** Skill id, or null on a health crate (lib/game/skills.ts). */
  skill: number | null
  /** What the crate held — the map's own count, before the training ground
   * makes it unlimited. */
  amount: number
  /** What the pig actually got: its slot's new amount, or the health. */
  given: number
  /** Whether the pig had room for it (lib/game/inventory.ts). */
  result: GiveResult
  /** Who picked it up. */
  pig: Pig
}

export interface BattleScene {
  /** Point the camera at the active pig and park the marker over it. */
  focus(pig: Pig): void
  /** Whether the level's opening drop is still going: what the dashboard
   * shows the mission's title card over. */
  dropping(): boolean
  /** Where each living pig's name hangs, in a view this big — the camera
   * lives here, so the dashboard asks rather than guesses. */
  plates(width: number, height: number): PigPlate[]
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
  // The same records, as things to walk into. Static for the map's life —
  // only the pigs move, and they join per frame.
  const obstacles = new ObstacleField(assets.objects)
  // The crates that carry something. A collected one is spliced out, so the
  // list is what is still on the ground.
  const pickups: Pickup[] = pickupsOf(assets.objects)
  const training = isTrainingGround(map)

  /**
   * The map's SCRIPT: field 14 is an opcode and the objects are the program
   * (lib/game/script.ts). Most of what CAMP carries is not on its ground at
   * the start — eight dummies, the second bridge, and every crate but the
   * first three — and each of them arrives when the thing it waits on has
   * been finished off.
   */
  const script = createScript(assets.objects)
  /** Crates that come down under a canopy, because the script says they are
   * pickups and the placer drops those from 0xC00 up (three/airDrop.ts). */
  const airDrops = createAirDrops(
    props,
    assets.canopy,
    (id, at) => {
      obstacles.restore(id)
      // A crate arriving kicks something up. Play named it — "там ещё эффект
      // от падения" — and this is the remake's own: nothing has been read that
      // spawns an effect for a placed object. It takes row 0's SMOKE and not
      // its fire, because a crate landing raises dust — and play saw what
      // happened when it got the whole row ("коробка когда падает — искрит").
      effects.dust(at)
    },
    () => bank
  )
  for (const id of script.waiting()) {
    props.show(id, false)
    // Off the map means off it entirely: an invisible dummy is not something
    // to walk into either.
    obstacles.remove(id)
  }

  /**
   * Something has been finished — a crate collected, a dummy broken — so run
   * its command and put on the map whatever was waiting on it.
   *
   * `fromY` is the FINISHER's height, because that is what the exe measures a
   * canopy drop from rather than the crate's own ground (0x4aa755).
   */
  const advanceScript = (id: number, fromY: number): void => {
    const placed = script.finish(id)
    // Putting a CRATE down takes everything off the acting pig: the exe calls
    // `Pig::ClearInventory` (0x468f50) from the placement arms — but only on
    // the pickup branch, the one that drops the thing in under a canopy
    // (0x4aa6cb; the dummy branch jumps clean over it at 0x4aa659). That is
    // why the bayonet goes missing the moment the first dummy falls: the step
    // is over, the rifle is on its way down, and the tutorial hands you one
    // weapon at a time (lib/game/inventory.ts).
    //
    // Clearing what it HOLDS is the remake's own line: the exe leaves
    // `[pig+0x2f4]` pointing at a weapon the pig no longer owns, and here the
    // model in its hands hangs off exactly that.
    if (placed.some((one) => one.parachute)) {
      clearSlots(game.currentPig.carrying)
      game.currentPig.holding = null
    }
    for (const one of placed) {
      if (one.parachute) {
        // The collision world waits for the landing; a crate still in the air
        // is not standing anywhere.
        airDrops.send(one.id, fromY)
        continue
      }
      props.show(one.id, true)
      obstacles.restore(one.id)
    }
  }

  /** Crates a full pig has already been told it cannot carry: the refusal
   * is said once, not once a frame while it stands there. */
  const refused = new Set<number>()

  /**
   * Hand over any crate the acting pig is standing in. The exe's own order:
   * the pickup gives the pig its contents (`Pig::GiveSkill`, 0x465425) and
   * then goes away — a health crate straight into the pig's health, a skill
   * crate into a slot, and on the training ground both on the training
   * ground's terms (lib/game/pickups.ts).
   */
  const collect = (pig: Pig): void => {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pickup = pickups[i]
      // A crate the script has not placed yet is not there to be walked into.
      if (script.absent(pickup.id)) continue
      if (!reached(pickup, pig.position.x, pig.position.z)) continue
      const worth = worthOf(pickup, training)
      let result: GiveResult = 'taken'
      let given = worth
      if (pickup.skill === null) {
        // No ceiling: the original's heal adds and stops (lib/game/health.ts).
        heal(pig, worth)
        given = pig.health
      } else {
        result = give(pig.carrying, pickup.skill, worth)
        // A pig with fifteen skills already leaves the crate where it is —
        // "THIS LITTLE PIG ALREADY HAS TOO MANY TOYS TO PLAY WITH".
        if (result === 'full') {
          if (!refused.has(pickup.id)) {
            refused.add(pickup.id)
            playCue(bank, BATTLE_SOUNDS.tooMany)
            onCollected({ skill: pickup.skill, amount: pickup.amount, given: 0, result, pig })
          }
          continue
        }
        given = amountOf(pig.carrying, pickup.skill)
      }
      pickups.splice(i, 1)
      // The pig cheers: the exe plays 0x5E at its own position the moment
      // the skill is in (audio/battle.ts).
      playCue(bank, BATTLE_SOUNDS.pickup)
      props.take(pickup.id)
      // It was something to push against a frame ago; leaving it in the
      // collision world would leave an invisible crate behind.
      obstacles.remove(pickup.id)
      // A collected crate runs its own command — the exe does it from inside
      // the pickup class (0x464633).
      advanceScript(pickup.id, props.restingY(pickup.id) ?? 0)
      onCollected({ skill: pickup.skill, amount: pickup.amount, given, result, pig })
    }
  }

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
  // The level opens with whoever the map's markers say drops in. Built after
  // the squad because it LIFTS them off it.
  const dropIn = createDropIn(squad, query, assets.canopy, () => bank)
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
  /** Scratch for the scope's eye, so a camera placement allocates nothing. */
  const eyeAt = new THREE.Vector3()
  /** `[0x4bd6c8]` — how far toward the hand the camera's HEIGHT moves in one
   * engine frame (0x4a3072). A third, and no more. */
  const EYE_LAG = 0.333
  /** The eye as of the last ENGINE frame, and which frame that was. */
  let heldEye = { x: 0, y: 0, z: 0 }
  let eyeFrame = -1
  /** Whether there is a previous height for the lag below to come from. */
  let settled = false
  /** Seconds the acting pig has stood still, and where it stood. */
  let still = 0
  let stillAt = { x: 0, z: 0, heading: 0 }
  const intent = { walk: 0, turn: 0 }
  let jumpRequested = false
  /** Whether the fire key went down since the last frame. */
  let fireRequested = false
  /** The fire button, last frame — the scene wants both edges of it. */
  let fireHeld = false
  /** The power gauge, while one is filling (lib/game/gauge.ts). */
  let gauge: Gauge | null = null
  /**
   * What the dashboard shows: how full the gauge is, 0..1 — and **0 rather
   * than null whenever the weapon in hand has one at all**, because that is
   * when the original shows the thing. Null only when nothing in hand charges,
   * and then the dashboard leaves the space empty (lib/game/weapons.ts, the
   * record's own `+0x14`).
   */
  const showGauge = (): number | null => {
    if (gauge) return gaugeFraction(gauge)
    return weaponOf(game.currentPig.holding).power ? 0 : null
  }
  /** What the gauge read when the button came up — the fuse carries it to the
   * throw, the way `Pig::Fire` parks it at `[pig+0x300]` (0x469371). */
  let thrownWith = 0
  /** Which way the aim keys are pushing: -1 down, 0 nothing, +1 up. */
  let aimIntent = 0
  /** Whether the aim view is held down. */
  let sighting = false
  /** The weapons in hand, one mesh per pig that has one out. */
  const weapons = createHeldWeapons()
  /** What the acting pig had chosen last frame — a change is what brings a
   * weapon out. */
  let holding: number | null = null
  /** Where it points (lib/game/aim.ts). */
  let aim = createAim(null)
  /** The sideways ramp the scope borrows off the aim, so left and right move
   * at the rate up and down do (lib/game/aim.ts). */
  const scopeTurn = { rate: 0 }
  /** The damage that floats off whatever was just hit — the original's own
   * effect, showing points (three/damageNumbers.ts). */
  const numbers = createDamageNumbers()
  /** The rings a blow throws — the original's effect system, of which the
   * hand-to-hand hit is the first piece built (three/effects.ts). */
  const effects = createEffects(root)
  /** The drift the sights have while they are up — the engine's own random
   * walk, borrowed off a body slipping on ice (lib/game/wobble.ts). */
  const wobble = createWobble()
  /** The sniper's magnification, which creeps in on its own while the sights
   * are up and resets the moment they drop (lib/game/zoom.ts). */
  const zoom = createZoom()
  /** The field of view the camera had before anything magnified it. */
  const openFov = host.camera.fov
  /** The shot in progress: the ten-frame fuse and then the bullet's flight,
   * through neither of which is the pig driveable (lib/game/shot.ts). */
  let firing: Firing | null = null
  /** The beat after a kill: the clock stops, the camera stays on the spot —
   * or on the crate coming down to replace it (lib/game/aftermath.ts). */
  let aftermath: Aftermath | null = null
  /** A script step owed to something that has broken, and not run until it
   * has finished breaking. One animation at a time. */
  let pending: { id: number; y: number } | null = null
  /**
   * Whether the aim view has been REFUSED until the key is let go.
   *
   * Firing drops the sights, and they must not come back while G is still
   * down — the exe holds mode 0x0E on the pad bit but gates it on
   * `Pig::MayAct` (0x492df1), which is false from the press until the attack,
   * and by then the whole shot sequence owns the view.
   */
  let sightingRefused = false
  /**
   * Whether the pig has COMMITTED to a blow, and so cannot be driven at all.
   *
   * Everything from the frame the FIRE button goes down to the frame the last
   * thing it threw has gone: the gauge charging, the fuse and the flight, the
   * swing itself, and anything still in the air. The exe's walk refuses from the
   * moment the button goes down until the clip is spent (0x46afd5 tests both the
   * pending flag and the animation one), its turn refuses for the clip alone
   * (0x46af43), and `Pig::MayAct` is false through the whole of a shot
   * (lib/game/shot.ts).
   *
   * **`sighting` is deliberately NOT in here**, and it was for one commit. Going
   * down the sights does not take control away — it hands over a DIFFERENT
   * control set, which is what the exe's own branch at 0x4928dc is: the turn
   * drives the scope and the pig together through the aim's ramp rather than the
   * walk's, Q and E move the aim, and the jump key stops being a jump. Play named
   * the distinction — "там должен включаться другой контрол сет; выключаться
   * должно когда выстрел нажал, не прицел". The jump is refused on its own line
   * below, which is the only thing the aim view actually takes away.
   */
  const committed = (): boolean =>
    gauge !== null ||
    firing !== null ||
    swings.running() ||
    grenades.live() > 0 ||
    shots.live() > 0
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
  /** What both of them do when a dummy comes apart. */
  const onBroken = (target: Target): void => {
    // The exe throws this off the object's own BREAK handler (0x48d750), not
    // off the blow — a different effect from the hit, and the one play
    // remembers as smoke.
    effects.broke(target)
    props.take(target.id)
    obstacles.remove(target.id)
    // The turn stops here and the camera stays on the spot. What comes next —
    // a crate under a canopy, most of the time — is watched from the same
    // wait, and the pig is not given back until the sky is empty and fifteen
    // frames of quiet have gone by (lib/game/aftermath.ts).
    aftermath = beginAftermath(target)
    // …and its own command, which is the last thing the exe's break handler
    // does (0x48d972). This is what drops the next crate in — but NOT YET.
    // One thing at a time: the dummy has to finish coming apart before the
    // crate starts coming down, which is how the whole game is paced.
    pending = { id: target.id, y: target.y }
  }
  /** What a bayonet does when the fire key goes down. It reads BONES, so it
   * needs the squad and the root they hang in; the rules are pure next door
   * (lib/game/melee.ts). The aim angle is deliberately NOT among them. */
  const swings = createSwings({
    squad,
    clips: assets.clips,
    bank: () => bank,
    root,
    training,
    targets,
    // A dummy the script has not placed yet is not a target: the exe's own
    // strike tests `[obj+0x30]`, the placed flag, before it will hit one
    // (0x476319).
    present: (id) => !script.absent(id),
    numbers,
    effects,
    onBroken
  })
  /** What a GUN does when the fire key goes down. It reads the same hand bone
   * a swing does, and off the same table (three/shots.ts). */
  const shots = createShots({
    squad,
    root,
    bank: () => bank,
    training,
    query,
    obstacles,
    targets,
    present: (id) => !script.absent(id),
    numbers,
    onBroken
  })
  /** …and what a GRENADE does, which is a parabola rather than a line
   * (three/grenades.ts). Same dummy list, same reason. */
  const grenades = createGrenades({
    squad,
    root,
    training,
    query,
    obstacles,
    targets,
    present: (id) => !script.absent(id),
    numbers,
    effects,
    bank: () => bank,
    onBroken,
    // Stay on the spot for the beat the blow's own wait gives it, which is what
    // makes the burst visible at all: the camera leaves the grenade the frame it
    // stops existing (lib/game/aftermath.ts).
    onBlast: (at) => {
      if (!aftermath) aftermath = beginAftermath(at)
    }
  })
  /** Seconds left of the getting-it-out clip. The exe puts the model in the
   * hand only once that has run (`[pig+0x2fd]`, exe 0x4702c3), so the pig
   * reaches for the rifle and then has it. */
  let readying = 0
  /** The acting pig's frame-by-frame state — walking, wedged, airborne —
   * lives in the pure domain (lib/game/locomotion); this scene only feeds
   * it intents and draws what it says. Reset whenever the acting pig
   * changes or is warped. */
  let loco: LocomotionState = createLocomotion(query, 0, 0, 0)

  /**
   * Camera and marker onto a pig, wherever it happens to be standing — or
   * hanging: a pig still on its canopy is watched from the front, face on,
   * and one mid-swing from the side, which is the original's own camera mode
   * for a hand-to-hand attack and the only thing that uses it (three/chase).
   */
  /**
   * Where the sights are ACTUALLY pointing: the player's angle plus the tremor.
   *
   * The tremor has to be in here. The crosshair is nailed to the middle of the
   * screen, so a view built on `aim.angle + wobble` while the bullet leaves along
   * `aim.angle` alone is a picture that lies about where the shot goes — play read
   * it as the shot lagging the sights by a second. The exe has no such split
   * either: its tremor is the stick's step going through `Pig::Aim` into
   * `[pig+0x304]`, and that is the field the bullet reads (lib/game/wobble.ts).
   *
   * `aim.angle` stays the PLAYER's own, untouched, because that is what the dial
   * shows and what the next frame's input adds to.
   */
  const aimedAngle = (): number => aim.angle + wobblePitch(wobble)

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
    const bone = soldier.mesh.bones[SCOPE_BONE] ?? soldier.mesh.bones[0]
    // The mixer wrote this frame's rotations; three folds them into the world
    // matrices at draw time and the camera is placed first.
    bone.updateMatrixWorld(true)
    eyeAt.set(SCOPE_MOUNT.x, SCOPE_MOUNT.y, SCOPE_MOUNT.z)
    bone.localToWorld(eyeAt)
    root.worldToLocal(eyeAt)
    // …and the tremor rides ON TOP of it, as a place rather than an angle:
    // the exe's own drift is the hand moving, so it shifts the picture and
    // cannot steer the bullet (lib/game/wobble.ts). Across is perpendicular
    // to the pig's facing; up is up, which in this space is a SMALLER y.
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
    // A bullet in the air takes the camera off the pig altogether: the shot's
    // own tail hands the camera the projectile and asks for mode 1
    // (0x47ad99). Only the acting pig's shot does this, and only while there
    // is something left to watch.
    const bullet = firing?.phase === 'flight' ? (shots.head() ?? grenades.head()) : null
    if (bullet && soldier === squad.of(game.currentPig)) {
      chase.ride(bullet, Math.atan2(bullet.vx, bullet.vz), delta)
      soldier.node.visible = true
      return
    }
    // …and so does what the blow left behind. Mode 0 on the crate, which is
    // the ordinary chase rig with something other than a pig in it
    // (0x4661c2).
    if (aftermath && soldier === squad.of(game.currentPig)) {
      chase.ride(aftermath.at, soldier.pig.heading, delta)
      soldier.node.visible = true
      return
    }
    const view: View = dropIn.underCanopy(soldier)
      ? 'face'
      : soldier === squad.of(game.currentPig) && swings.running()
        ? 'melee'
        : // The aim view, held, and only for something that shoots — the exe
          // picks mode 0x0E by WEAPON (0x492dfa) and gates it on the same test
          // the melee camera is gated on, which is false through a swing.
          soldier === squad.of(game.currentPig) && sighting && isGun(holding)
          ? 'scope'
          : 'chase'
    chase.follow(
      soldier.pig,
      soldier.node.position.y,
      dropIn.riseOver(soldier),
      delta,
      view,
      // The view and the SHOT take the same tremor — anything else is a picture
      // that lies about where the bullet goes (`aimedAngle`, lib/game/wobble.ts).
      aimRadians(aimedAngle()),
      aimRadians(wobbleYaw(wobble)),
      view === 'scope' ? scopeEye(soldier) : null
    )
    // The pig's own body is IN the way of its own eye. Hide the acting model
    // while the scope is up — every other pig stays, because those are what
    // is being aimed at.
    soldier.node.visible = view !== 'scope'
  }

  const focus = (pig: Pig): void => {
    loco = createLocomotion(query, pig.position.x, pig.position.z, pig.heading)
    holding = pig.holding
    aim = createAim(pig.holding)
    readying = 0
    firing = null
    // A charge belongs to the pig that started it: a turn handed over mid-hold
    // must not throw for whoever comes next.
    gauge = null
    thrownWith = 0
    aftermath = null
    pending = null
    sightingRefused = false
    swings.reset()
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
      fireRequested = false
      const arriving = squad.of(game.currentPig)
      if (arriving) watch(arriving, delta)
      onGameChanged()
      return
    }

    // Nobody left standing: the battle stops where it is rather than handing
    // a turn to a squad that cannot take one (lib/game/game.ts).
    if (game.over) {
      onGameChanged()
      return
    }

    // The turn clock runs regardless of what anyone does — except that it
    // does not start at once: `tick` burns the beat at the top of the turn
    // first (lib/game/game.ts). A pig that FELL this turn ends it the same
    // way the clock does — the exe hands the turn on from inside the damage
    // itself when the acting pig is the one that died (0x467d4f).
    //
    // …and except through a SHOT. Once the fire key has gone down the pig has
    // stopped being driveable — `Pig::MayAct` refuses on `[pig+0x230]`
    // (0x467a10) — and the clock does not run the player out of time while
    // the camera is away watching a bullet.
    // The clock stops for the whole of a blow: from the moment the button
    // goes down, through the swing or the flight, and on through the beat
    // that shows what it did. Play's rule, and the exe's own gate agrees —
    // `Pig::MayAct` is false for all of it.
    const blowInProgress =
      firing !== null ||
      aftermath !== null ||
      swings.running() ||
      grenades.live() > 0
    if (!blowInProgress && (game.tick(delta) || isDead(game.currentPig))) {
      game.endTurn()
      jumpRequested = false
      fireRequested = false
      focus(game.currentPig)
    }

    const active = squad.of(game.currentPig)
    if (!active) return

    // "START OF TURN - press any key to continue": the pig stands, and nothing
    // here ends the beat.
    //
    // ENDING it belongs to the input layer, and to one place in it: `starting` is
    // a control SET whose whole rule is that any press ends the turn's beat and
    // is then read again in the set that follows (`input/battleInput.ts`, which
    // polls ahead of this every frame). This block used to test the intents for
    // it as well — a second answer to the same question, and by the time input
    // was polled a dead one, since the set swallows every axis while it is live.
    if (game.starting) {
      active.setClip(ANIM.IDLE)
      active.overlay(-1, 0)
      watch(active, delta)
      onGameChanged()
      return
    }
    for (const soldier of squad.members) {
      if (soldier === active) continue
      // A body that has fallen stays fallen: its dying clip was played once
      // and clamped, and standing it back up is exactly what this loop would
      // otherwise do every frame (three/swing.ts plays it).
      if (isDead(soldier.pig)) continue
      soldier.setClip(ANIM.IDLE)
      // Only the pig being driven holds its weapon up; the rest stand.
      soldier.overlay(-1, 0)
    }

    // Position and facing are the game's; everything else the frame needs —
    // height, momentum, the wedge clock, which clip to wear — lives in the
    // locomotion state. Sync in, step one frame of the domain, sync back,
    // and draw exactly what it says.
    // Fire is what starts a swing, and only the acting pig's own weapon
    // answers. A press while one is already running is dropped, which is the
    // exe's fire gate (0x467a10 refuses on the same two flags).
    // F uses what is in hand: a melee skill swings, a gun shoots. The exe
    // splits them at the same place — one arm of `Pig::Fire`'s own switch each
    // (0x469415 against 0x46946d).
    // …but nothing is answered at all while the blow is being shown. The jump
    // key is the exception, and it is the same exception the level's opening
    // drop makes: it cuts the canopy and brings the crate down now.
    if (aftermath) {
      if (jumpRequested) airDrops.cut()
      jumpRequested = false
      fireRequested = false
      // The world keeps going — the crate has to reach the ground for the
      // wait to end, and the smoke off the thing that broke is what is being
      // watched.
      effects.update(delta)
      shots.update(delta)
      grenades.update(delta)
      airDrops.update(delta)
      numbers.update(delta)
      // …AND THE BLOW ITSELF. The wait used to freeze the pig and put IDLE on
      // it on the very frame the blow connected, which cut off the animation
      // it was gating everything else on: a bayonet strikes on frames 11-14
      // of a 36-frame clip, so twenty-odd frames of it were thrown away, and
      // a gun's attack clip had only just started. The pig plays out what it
      // was doing INSIDE the wait — that is what the wait is for.
      swings.update(delta, active)
      // The shot that caused all this ends here rather than a frame late.
      if (firing?.phase === 'flight' && shots.live() === 0 && grenades.live() === 0) firing = null
      // ONE THING AT A TIME. The script's next step waits for the thing that
      // triggered it to finish — play's rule for the whole game, "ждёшь конца
      // одной анимации и включаешь другую". Three separate things have to be
      // over: the pig's own clip (`animating`, a committed one-shot — the
      // attack clip), the swing that is still holding it, and the break.
      //
      // `busy()`, not `smoke() === 0`: the break effect's burst does not fire
      // until its third frame, so counting puffs said "finished" on the very
      // frame the dummy broke and the crate started down through the smoke.
      if (pending && !swings.running() && !active.animating() && !effects.busy()) {
        advanceScript(pending.id, pending.y)
        pending = null
      }
      // Everything play named that this scene can answer for: a projectile
      // still in the air, damage still landing, a body still coming apart,
      // a crate still under its canopy. A pig swimming for the shore is on
      // the list too and is not modelled — nothing knocks one into the water
      // yet.
      const settling =
        pending !== null ||
        swings.running() ||
        active.animating() ||
        effects.busy() ||
        shots.live() > 0 ||
        grenades.live() > 0 ||
        numbers.live() > 0 ||
        airDrops.falling() > 0
      if (advanceAftermath(aftermath, delta, settling)) {
        aftermath = null
        chase.reset()
      } else {
        // Follow the crate down; a spot with nothing coming stays the spot.
        const crate = airDrops.watching()
        if (crate) watchAftermath(aftermath, crate)
        // Standing about is only what a pig does once it has finished. The
        // same two guards the normal path uses (`swinging`, `animating`) —
        // asking for a clip is what CANCELS a committed one (three/clips.ts),
        // so this line unconditionally was the interruption.
        if (!swings.swinging() && !active.animating()) active.setClip(ANIM.IDLE)
        squad.update(delta)
        watch(active, delta)
        onGameChanged()
        return
      }
    }

    // An EMPTY hand has nothing to fire, and that is the one layer that has not:
    // SKIP TURN has no weapon behind it and F still uses it (lib/game/controls.ts).
    if (fireRequested && !layerFires(weaponLayer(active.pig.holding))) fireRequested = false

    if (fireRequested) {
      // A grenade already in the air answers the button before anything else
      // does: a second press sets it off where it lies. Play's, and
      // `three/grenades.ts` says so at the method — nothing in the exe's fire
      // handler has been read for it.
      if (grenades.live() > 0) {
        grenades.detonateNow()
        fireRequested = false
        // …asked of the PIG rather than of the cached `holding`, which is only
        // synced further down the frame (where the getting-it-out clip starts) and
        // is therefore a frame stale here.
      } else if (active.pig.holding === SKILL.SKIP_TURN) {
        // SKIP TURN is a skill taken in HAND and then used, like anything else
        // (lib/game/controls.ts) — play: "пропуск хода должен применяться на
        // стрелять, а не на выборе". Using it ends the turn.
        fireRequested = false
        // …and it SAYS SO. There was no confirmation at all and play asked for
        // one; the cue is a name pick and `audio/battle.ts` says which.
        playCue(bank, BATTLE_SOUNDS.skillUsed)
        game.endTurn()
        focus(game.currentPig)
        onGameChanged()
        return
      } else if (isLobbed(holding)) {
        // A weapon with a gauge does not go off on the press at all. The
        // press starts it CHARGING and the throw comes on the release, or on
        // its own if it tops out first (0x493796, lib/game/gauge.ts).
        if (!gauge && !firing) gauge = beginGauge()
      } else if (isGun(holding)) {
        // A gun is a SEQUENCE, and a press while one is running is refused —
        // `Pig::MayAct` is false from `Pig::Fire` until `Pig::Attack`
        // (lib/game/shot.ts). That refusal is the whole of why a rifle is not
        // a machine gun.
        if (!firing) {
          firing = beginFiring()
          // Out of the sights the moment the trigger goes: the exe's aim
          // camera is held on the very test that has just gone false. And it
          // stays out until G is actually let go — holding it through the
          // shot must not snap the scope back over the flight.
          sighting = false
          sightingRefused = true
          // …and the pig says something. Twelve lines in rotation, per squad
          // (audio/pigVoice.ts).
          voice.fire(game.players.indexOf(game.currentPlayer))
        }
      } else swings.begin(active)
    }
    fireRequested = false
    // **COMMITTED takes the whole of input, and it starts at the FIRE press.**
    // Play: "после нажатия стрелять должно отключаться полностью управление — а
    // не только прыжок, вообще всё." The gate used to miss the biggest window of
    // the lot: a weapon with a power gauge does not set `firing` on the press —
    // the press starts it CHARGING and the throw comes on the release — so for
    // the whole second and a half of the charge the pig could still be walked,
    // turned and aimed. It missed a bullet in the air too.
    if (committed()) {
      jumpRequested = false
      aimIntent = 0
    }
    const walking = committed() ? 0 : intent.walk
    const turning = committed() ? 0 : intent.turn
    // The SIGHTS are a different control set, not a locked one — the walk and the
    // turn below still answer, the turn through the aim's own ramp instead of the
    // pig's. The one thing the aim view does take away is the JUMP: the exe routes
    // input through its own branch while the aim bit is down (0x4928dc) and no
    // jump is reachable from it, so the key is not a jump while G is held.
    if (sighting) jumpRequested = false

    // Down the sights the two axes move together. The pad gives the turn a
    // flat 0x40 the moment the key goes down and the aim a ramp to 0x20, so
    // sideways is twice as fast and instant — which reads wrong in a scope.
    // Play asked for them matched, and matching them means running the turn
    // through the aim's own ramp (lib/game/aim.ts).
    const scoping = sighting && isGun(holding) && !firing
    // The same arm turns the pig, off its own accumulator and the same
    // 1-to-16 ramp, so the two axes move together without the remake choosing
    // anything.
    const swung = scoping
      ? zoomsIn(holding)
        ? zoomedStep(zoom, rampedStep(scopeTurn, turning, delta), SIGHT_RAMP)
        : rampedStep(scopeTurn, turning, delta)
      : 0
    if (!scoping) scopeTurn.rate = 0

    loco.x = active.pig.position.x
    loco.z = active.pig.position.z
    loco.heading = active.pig.heading + aimRadians(swung)
    updateLocomotion(
      loco,
      query,
      { walk: walking, turn: scoping ? 0 : turning, jump: jumpRequested },
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
    // Walking INTO a crate is how one is collected; there is no button.
    collect(active.pig)

    // The swing, after the pig has been placed: the blade's own points come
    // off the HAND bone, so where the pig is standing has to be settled first
    // (three/swing.ts). It may put the weapon away on the way out — the last
    // bayonet — which the block below then picks up.
    swings.update(delta, active)

    // The gauge fills while the button is down. Both ways out of it end in
    // the SAME ten-frame fuse a gun's press starts — `Pig::Fire` writes
    // `[pig+0x231] = 0x0A` whatever is in hand — so the release does not
    // throw, it arms (lib/game/shot.ts).
    if (gauge) {
      const topped = chargeGauge(gauge, delta / EXE_FRAME_SECONDS)
      if (topped || !fireHeld) {
        thrownWith = gauge.power
        gauge = null
        firing = beginFiring()
        sighting = false
        sightingRefused = true
        voice.fire(game.players.indexOf(game.currentPlayer))
      }
    }

    // The shot, after the pig has been placed for the same reason a swing is:
    // the muzzle comes off the HAND bone (three/shots.ts). Ten frames between
    // the press and the bullet, and the frame the fuse runs out is the frame
    // it leaves.
    if (firing && advanceFiring(firing, delta)) {
      // Where the sights were actually pointing — the drift is part of the
      // aim, not a decoration over it.
      const away = isLobbed(holding)
        ? grenades.throwOne(active, aimedAngle(), thrownWith, wobbleYaw(wobble))
        : shots.fire(active, aimedAngle(), wobbleYaw(wobble))
      if (!away) firing = null
      else {
        // `Pig::Attack` puts the weapon's own attack clip on at the same
        // moment (0x46971a), the way a swing's does — the record's fourth
        // column (lib/game/weapons.ts).
        const firearm = weaponOf(holding)
        if (firearm.attackClip >= 0) active.playOnce(firearm.attackClip)
      }
    }
    // …and the sequence is over when there is nothing left in the air. The
    // camera comes back off the bullet and the turn clock starts again — and it
    // comes back by TELEPORTING behind the pig rather than flying home from
    // wherever the bullet ended up (three/chase.ts, `reset`).
    if (firing?.phase === 'flight' && shots.live() === 0 && grenades.live() === 0) {
      firing = null
      chase.reset()
    }

    // The weapon in hand, and where it points. Choosing one out of the menu
    // is what starts it: the exe plays the getting-it-out clip and only puts
    // the model in the hand once that has run (`Pig::ReadyWeapon` 0x469090,
    // and the store at 0x4702c3 — lib/game/weapons.ts).
    const weapon = weaponOf(active.pig.holding)
    if (active.pig.holding !== holding) {
      holding = active.pig.holding
      // A weapon comes up pointing where its own record says: a rifle level,
      // a grenade already lobbing at 45°.
      aim = createAim(holding)
      readying = weapon.readyClip > 0 ? clipSeconds(assets.clips[weapon.readyClip]) : 0
      if (readying > 0) active.playOnce(weapon.readyClip)
    }
    readying = Math.max(0, readying - delta)
    // …and the closer it is zoomed the finer the aim moves, which is the
    // sniper's whole feel: `step = ((0x1000 - zoom) * step) >> 12`, floored
    // at the base step (0x495e08).
    // …and NOTHING moves the sights once the trigger is down. `Pig::Aim`
    // (0x46a7f0) calls `Pig::MayAct` before it does anything and bails when
    // it is false, and it is false from the press until the attack
    // (`[pig+0x230]`). Without this the shot leaves along wherever the sights
    // had drifted to by the end of the ten-frame fuse rather than where they
    // were aimed — play: "будто секунду в сторону движения прицела продолжал
    // двигаться".
    const sighted = sighting && isGun(holding)
    updateAim(
      aim,
      holding,
      committed() ? 0 : weapon.aims ? aimIntent : 0,
      delta,
      (step) => (zoomsIn(holding) ? zoomedStep(zoom, step, SIGHT_RAMP) : step),
      // Down the sights the aim view's own arm drives it, and it is slower
      // (lib/game/aim.ts).
      sighted ? SIGHT_RAMP : AIM_RAMP,
      sighted ? SIGHT_TOP : AIM_TOP
    )
    // The sights drift while they are up and are steady the moment they are
    // not. Both of these count ENGINE frames: the tremor steps once a frame
    // at fifteen a second, which is what makes it a jitter rather than a
    // glide, and the zoom creeps 0x20 a frame (lib/game/wobble.ts, zoom.ts).
    const scoped = sighting && isGun(holding)
    const frames = delta / FRAME_SECONDS
    // The tremor rides the ZOOM, and the closer it looks the further it travels —
    // play's rule, not the exe's divisor (lib/game/wobble.ts explains why those are
    // different quantities).
    //
    // **It FREEZES for the fuse rather than being reset.** `Pig::Aim` is refused
    // from the fire press until the attack, and the tremor arrives through it, so
    // in the original the sights stop dead and the bullet leaves along exactly what
    // the player last saw. Zeroing it here is what made the shot look a second
    // stale. Lowering the sights for good is the only thing that clears it.
    if (scoped) updateWobble(wobble, frames, zoomFraction(zoom))
    else if (!firing) resetWobble(wobble)
    updateZoom(zoom, frames, scoped && zoomsIn(holding))
    // A magnified view really is magnified. Where 0x1000 of `afSetZoom` puts
    // a field of view is the library's and the library is not in the install,
    // so SCOPE_MAGNIFY is the remake's pick and three/chase.ts says so.
    const magnified = openFov / (1 + zoomFraction(zoom) * (SCOPE_MAGNIFY - 1))
    if (Math.abs(host.camera.fov - magnified) > 1e-4) {
      host.camera.fov = magnified
      host.camera.updateProjectionMatrix()
    }
    for (const soldier of squad.members) {
      const reaching = soldier === active && readying > 0
      weapons.show(soldier.mesh, reaching ? null : weaponModelName(soldier.pig.holding))
    }

    // A committed clip — the jump's crouch, a landing's get-up — is started
    // once and left to play out; anything else is simply worn. The domain
    // says which is which and when a commitment ends, so this only has to
    // avoid restarting the one already running. Getting a weapon out is a
    // commitment of the same kind, and holds the pig until it is done.
    if (readying > 0) {
      // The getting-it-out clip has the pig to itself.
    } else if (swings.swinging()) {
      // …and so does the swing. `Pig::Attack` puts its clip on the PRIMARY
      // channel and clears the weapon one (0x46971a), so a bayonet is a
      // whole-body animation for as long as it lasts.
    } else if (loco.commit) {
      if (!active.animating()) active.playOnce(loco.clip)
    } else if (holding === SKILL.SKIP_TURN && loco.clip === ANIM.IDLE) {
      // A pig with SKIP TURN in hand stands there THINKING about it — clip 46 of
      // the fifty-nine the exe names, which play named too. It replaces the IDLE
      // only: a pig can still walk about with the skill in hand, and then it walks.
      active.setClip(ANIM.THINKING)
    } else {
      active.setClip(loco.clip)
    }

    // And over the top of it, the arms: the weapon's aiming clip held at the
    // frame its angle points at. It is a SECOND channel, not a replacement —
    // the pig runs, walks and idles underneath, which is what makes running
    // with a weapon look like its own animation without there being one
    // (three/clips.ts). It lands seamlessly because the getting-it-out clip
    // ends on exactly the frame a level angle asks for.
    const holdingUp =
      readying === 0 && !swings.swinging() && loco.airborne === null && scrubsPose(holding)
    active.overlay(holdingUp ? weapon.aimClip : -1, aimPhase(aim.angle))

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
    numbers.update(delta)
    effects.update(delta)
    shots.update(delta)
    grenades.update(delta)
    airDrops.update(delta)
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
    strings: () => assets.strings,
    swinging: () => swings.running(),
    strike: () => swings.lastStrike(),
    effects: () => effects.live(),
    smoke: () => effects.smoke(),
    fire: () => effects.fire(),
    script: () => ({ absent: script.waiting(), falling: airDrops.falling() }),
    shots: () => shots.live(),
    aim: () => (weaponOf(game.currentPig.holding).aims ? aim.angle : null),
    grenades: () => grenades.at(),
    charging: () => showGauge(),
    firing: () => firing?.phase ?? null,
    barks: () => voice.spoken(),
    aftermath: () => aftermath !== null,
    warp: (x, z, heading) => {
      game.moveCurrentPig(x, z, heading)
      swings.reset()
      effects.clear()
      loco = createLocomotion(query, x, z, heading)
      const soldier = squad.of(game.currentPig)
      if (!soldier) return
      soldier.place(x, loco.y, z, heading)
    }
  })

  return {
    focus,
    dropping: () => dropIn.running(),
    plates: (width, height) => squad.plates(host.camera, width, height),
    numbers: (width, height) => numbers.project(host.camera, root, width, height),
    still: () => still,
    setIntent(walk, turn) {
      intent.walk = walk
      intent.turn = turn
    },
    jump() {
      jumpRequested = true
    },
    setFiring(held, pressed) {
      // The PRESS is what a gun and a blade answer to; the gauge wants the
      // whole hold, and the frame it ends.
      if (pressed) fireRequested = true
      fireHeld = held
    },
    charging: () => showGauge(),
    setAim(direction) {
      aimIntent = direction
    },
    setSighting(held) {
      // Letting go always clears the refusal; holding it down never lifts it.
      if (!held) sightingRefused = false
      sighting = held && !sightingRefused
    },
    scoped: () => sighting && isGun(holding) && !dropIn.running(),
    beginTurn: () => game.beginTurn(),
    situation: () => ({
      starting: game.starting,
      // A gauge filling is its OWN control set rather than a hole in the lock,
      // which is what it was for a commit and what play corrected.
      charging: gauge !== null && !gauge.spent,
      // Something is still LIVE, and a second press of fire sets it off where it
      // lies. Its own set, because the lock swallowed that press and play found it
      // at once — "пока граната летит, не могу взорвать её."
      armed: grenades.live() > 0,
      locked: committed() || aftermath !== null,
      // What is in the pig's HANDS decides whether there is an aim view to enter:
      // a gun or something thrown has one, a blade does not, empty hands do not.
      // The `aims` bit was the first cut and it was too wide — a bayonet aims here
      // (by request; the exe pins it to zero) so G stopped the pig with one in
      // hand. `weaponLayer` is the composition play asked for: movement, plus
      // whatever the weapon brings (lib/game/controls.ts).
      sights: layerSights(weaponLayer(game.currentPig.holding)) && !dropIn.running()
    }),
    // Whether there is an ANGLE, which is not the same question as whether
    // there is a POSE for the angle to scrub. `scrubsPose` was standing in for
    // both, and a grenade is in its exclusion list (0x46a8e8, nothing thrown
    // has an aiming clip) — so the needle showed nothing and the angle looked
    // dead, though it was tracking all along. Play: "нельзя наклонять куда
    // кидаешь". The record's own `aims` bit is the right test.
    aim: () => (weaponOf(holding).aims ? aim.angle : null),
    sound(name) {
      bank.play(name)
    },
    dispose() {
      host.onFrame.delete(onFrame)
      host.scene.remove(root)
      terrain.dispose()
      props.dispose()
      dropIn.dispose()
      marker.dispose()
      effects.dispose()
      shots.dispose()
      grenades.dispose()
      voice.dispose()
      airDrops.dispose()
      weapons.dispose()
      squad.dispose()
      bank.dispose()
    }
  }
}
