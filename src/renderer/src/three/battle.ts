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
import { aimPhase, aimRadians, createAim, scrubsPose, updateAim } from '../../../lib/game/aim'
import { weaponModelName, weaponOf } from '../../../lib/game/weapons'
import { meleeOf } from '../../../lib/game/melee'
import { buildTerrain } from './terrain'
import type { Terrain } from './terrain'
import { buildMapProps } from './props'
import { fieldSquad } from './squad'
import type { Soldier, SoldierArt } from './squad'
import { createChase } from './chase'
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
import { createShots } from './shots'
import type { FloatingNumber } from './damageNumbers'
import { exposeBattleDebug } from './debug'
import { clipSeconds } from './clips'
import { SILENT, loadBank } from '../audio/bank'
import { BATTLE_SOUNDS, createBattleSounds } from '../audio/battle'
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
  /** Ask it to use what it is holding. Only the five hand-to-hand skills
   * answer so far — a bayonet swings, a rifle does nothing
   * (lib/game/melee.ts). */
  fire(): void
  /** Point the weapon in hand: -1 down, 0 nothing held, +1 up. */
  setAim(direction: number): void
  /** Whether the aim view is being HELD. The original keeps camera mode 0x0E
   * for exactly as long as its pad bit is down and puts the remembered mode
   * back the frame it goes up (three/chase.ts). */
  setSighting(held: boolean): void
  /** Whether the view is actually down the barrel — held AND holding a gun,
   * which is what the scope's ring is drawn over (ui/hud.ts). */
  scoped(): boolean
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
  const airDrops = createAirDrops(props, assets.canopy, (id) => obstacles.restore(id))
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
    // Placing ANYTHING takes everything off the acting pig: the exe calls
    // `Pig::ClearInventory` (0x468f50) inside both placement arms, on the pig
    // whose turn it is. That is why the bayonet goes missing the moment the
    // first dummy falls — the step is over, and the script hands the pig its
    // next weapon instead (lib/game/inventory.ts).
    //
    // Clearing what it HOLDS is the remake's own line: the exe leaves
    // `[pig+0x2f4]` pointing at a weapon the pig no longer owns, and here the
    // model in its hands hangs off exactly that.
    if (placed.length > 0) {
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
            bank.play(BATTLE_SOUNDS.tooMany)
            onCollected({ skill: pickup.skill, amount: pickup.amount, given: 0, result, pig })
          }
          continue
        }
        given = amountOf(pig.carrying, pickup.skill)
      }
      pickups.splice(i, 1)
      // The pig cheers: the exe plays 0x5E at its own position the moment
      // the skill is in (audio/battle.ts).
      bank.play(BATTLE_SOUNDS.pickup)
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
  /** Whether the fire key went down since the last frame. */
  let fireRequested = false
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
  /** The damage that floats off whatever was just hit — the original's own
   * effect, showing points (three/damageNumbers.ts). */
  const numbers = createDamageNumbers()
  /** The rings a blow throws — the original's effect system, of which the
   * hand-to-hand hit is the first piece built (three/effects.ts). */
  const effects = createEffects(root)
  /** What a bayonet does when the fire key goes down. It reads BONES, so it
   * needs the squad and the root they hang in; the rules are pure next door
   * (lib/game/melee.ts). The aim angle is deliberately NOT among them. */
  const swings = createSwings({
    squad,
    clips: assets.clips,
    bank: () => bank,
    root,
    training,
    // The training ground's dummies are the other thing a swing can hit, and
    // the only one that is not a pig (lib/game/targets.ts).
    targets: targetsOf(assets.objects),
    // A dummy the script has not placed yet is not a target: the exe's own
    // strike tests `[obj+0x30]`, the placed flag, before it will hit one
    // (0x476319).
    present: (id) => !script.absent(id),
    numbers,
    effects,
    onBroken: (target) => {
      // The exe throws this off the object's own BREAK handler (0x48d750),
      // not off the blow — a different effect from the hit, and the one play
      // remembers as smoke.
      effects.broke(target)
      props.take(target.id)
      obstacles.remove(target.id)
      // …and its own command, which is the last thing the exe's break handler
      // does (0x48d972). This is what drops the next crate in.
      advanceScript(target.id, target.y)
    }
  })
  /** What a GUN does when the fire key goes down. It reads the same hand bone
   * a swing does, and off the same table (three/shots.ts). */
  const shots = createShots({
    squad,
    root,
    bank: () => bank,
    training,
    targets: targetsOf(assets.objects),
    present: (id) => !script.absent(id),
    numbers,
    onBroken: (target) => {
      effects.broke(target)
      props.take(target.id)
      obstacles.remove(target.id)
      advanceScript(target.id, target.y)
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
  const watch = (soldier: Soldier, delta: number | null): void => {
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
      aimRadians(aim.angle)
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
    if (game.tick(delta) || isDead(game.currentPig)) {
      game.endTurn()
      jumpRequested = false
      fireRequested = false
      focus(game.currentPig)
    }

    const active = squad.of(game.currentPig)
    if (!active) return

    // "START OF TURN - press any key to continue": the pig cannot be driven
    // until the beat is out, and any input ends it — and is then acted on in
    // this same frame, so nothing a player does is ever swallowed.
    if (game.starting) {
      if (intent.walk !== 0 || intent.turn !== 0 || aimIntent !== 0 || jumpRequested || fireRequested) {
        game.beginTurn()
      }
      else {
        active.setClip(ANIM.IDLE)
        active.overlay(-1, 0)
        watch(active, delta)
        onGameChanged()
        return
      }
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
    if (fireRequested) {
      if (isGun(holding)) shots.fire(active, aim.angle)
      else swings.begin(active)
    }
    fireRequested = false
    // A swinging pig cannot be driven: the exe's walk refuses from the moment
    // the button goes down until the clip is spent (0x46afd5 tests both the
    // pending flag and the animation one) and its turn refuses for the clip
    // alone (0x46af43).
    const walking = swings.running() ? 0 : intent.walk
    const turning = swings.swinging() ? 0 : intent.turn

    loco.x = active.pig.position.x
    loco.z = active.pig.position.z
    loco.heading = active.pig.heading
    updateLocomotion(
      loco,
      query,
      { walk: walking, turn: turning, jump: jumpRequested },
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
    updateAim(aim, holding, weapon.aims ? aimIntent : 0, delta)
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
    script: () => ({ absent: script.waiting(), falling: airDrops.falling() }),
    shots: () => shots.live(),
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
    fire() {
      fireRequested = true
    },
    setAim(direction) {
      aimIntent = direction
    },
    setSighting(held) {
      sighting = held
    },
    scoped: () => sighting && isGun(holding) && !dropIn.running(),
    aim: () => (scrubsPose(holding) ? aim.angle : null),
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
      airDrops.dispose()
      weapons.dispose()
      squad.dispose()
      bank.dispose()
    }
  }
}
