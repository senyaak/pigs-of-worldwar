// The window the e2e suite looks at the battle through (docs/testing.md).
//
// Everything the dashboard says, it says in brass and in the game's own
// letters, which no assertion can read; and a canopy coming down or a camera
// gliding is not something markup can show. So the STATE comes from here and
// the pixels are asserted separately.
//
// `warp` is the ONE write. A spec that wants a pig in front of a particular
// wall cannot walk it there across a whole map, and doing so through the
// controller would test the walk rather than the wall.

import type * as THREE from 'three'
import type { Game } from '../../../lib/game/game'
import type { TerrainQuery } from '../../../lib/game/terrain'
import { controller } from '../input/controller'
import { inWater } from '../../../lib/game/locomotion'
import type { DropIn } from '../../../lib/game/dropIn'
import type { MapProps } from './props'
import type { Squad } from './squad'
import { skillName } from '../../../lib/game/skills'

export interface DebugParts {
  game: Game
  query: TerrainQuery
  squad: Squad
  dropIn: DropIn
  props: MapProps
  /** How many .POG records the map carried, against how many were drawn. */
  objectCount: number
  camera: THREE.Camera
  /** Every sound the battle has played, in order — out of the sound domain
   * (contracts/sound.ts), because a spec cannot listen. */
  sounds: () => string[]
  /** Seconds the acting pig has stood still — what the name plates wait for,
   * and the only way a spec can tell why they are up. */
  still: () => number
  /** `gtext`, for naming what a pig is carrying. Empty on an install with
   * no strings, which is not a reason for the battle to refuse to run. */
  strings: () => string[]
  /** Whether a hand-to-hand swing is under way, wind-up included — a spec
   * cannot see the clip, and this is what says the pig is committed. */
  swinging: () => boolean
  /** What the last strike measured: where the blade was and how near every
   * other pig came, per axis (three/swing.ts). A miss has four ways of being
   * true and this is the only way to tell them apart. */
  strike: () => unknown
  /** How many effect rings are alive. They are a colour on a transparent
   * quad, so a screenshot cannot tell one from the sky — this is the only
   * way a spec can say a hit threw one (three/effects.ts). */
  effects: () => number
  /** …and how many puffs of smoke: a thing BREAKING throws those instead. */
  smoke: () => number
  /** …and how many sprites its FIREBALL has. */
  fire: () => number
  /** What the map SCRIPT is still holding back, and what is in the air. */
  script: () => { absent: number[]; falling: number }
  /** How many bullets are in flight. */
  shots: () => number
  /** Where the weapon in hand points, or null when nothing aims. */
  aim: () => number | null
  /** How many grenades are in the air or lying about (three/grenades.ts). */
  grenades: () => { x: number; y: number; z: number; fuse: number }[]
  /** Mines that have been trodden on and are counting down. Nothing is DRAWN for
   * a minefield — it is a bit in the ground and the tile's own texture is the
   * warning — so this is the only way a spec can see one at all
   * (lib/game/mines.ts). */
  mines: () => { x: number; y: number; z: number; fuse: number }[]
  /** How full the power gauge is, 0..1, or null when nothing charges. */
  charging: () => number | null
  /** Where the shot SEQUENCE has got to: the fuse, the flight, or nothing at
   * all (lib/game/shot.ts). */
  firing: () => string | null
  /** Every voice line the pigs have said, in order — the only way a spec can
   * hear one (audio/pigVoice.ts). */
  barks: () => string[]
  /** Whether the beat after a blow is still running. */
  aftermath: () => boolean
  /** The beat at the END of a turn, and how many pigs are still in the water
   * (lib/game/walkAway.ts). Null while a turn is being played. */
  walkAway: () => { swimming: number } | null
  /** The acting pig's pose from both ends: the engine's sampler and the bone the
   * mesh is wearing (three/battle.ts). */
  pose: () => {
    clip: number | null
    elapsed: number
    /** What the keyframe head is lifting the whole body by, model units — the
     * gait's bob, on the root bone. */
    lift: number
    /** Every bone the MESH is wearing, HIR order — 0 the hip, 1 the torso, 2 the
     * head, 9..14 the legs. */
    bones: [number, number, number, number][]
    foot: [number, number, number] | null
    drawn: [number, number, number, number] | null
  }
  /** End that beat now — what a spec does so it is not paying for one it is not
   * testing (lib/game/battle.ts). */
  cutTurnBeat: () => void
  warp: (x: number, z: number, heading: number) => void
}

/** Hang the battle's debug surface off `window.pow`, keeping whatever else
 * is already there (the controller, the map selector, the HUD layout). */
export function exposeBattleDebug(parts: DebugParts): void {
  const { game, query, squad, dropIn, props, camera } = parts
  window.pow = {
    ...(window.pow ?? { controller }),
    debug: {
      currentPig: () => ({ x: game.currentPig.position.x, z: game.currentPig.position.z }),
      currentHeading: () => game.currentPig.heading,
      /** Whose turn it is and how it stands. */
      hud: () => ({
        turn: game.turn,
        side: game.currentPlayer.name,
        pig: game.currentPig.name,
        health: game.currentPig.health,
        seconds: Math.max(0, Math.ceil(game.timeLeft)),
        // IN the water, not merely OVER it — the pig's feet against the
        // waterline (lib/game/locomotion.ts `inWater`), which is the same
        // question the water's damage and the end-of-turn swim ask. Asking the
        // landscape alone, this said a pig standing on CAMP's bridge was
        // swimming, and a spec written against it would have been told the bug
        // play reported was working as intended.
        swimming: inWater(
          query,
          game.currentPig.position.x,
          game.currentPig.position.z,
          game.currentPig.position.y
        ),
        still: parts.still(),
        starting: game.starting
      }),
      currentNodeY: () => squad.of(game.currentPig.id)?.node.position.y ?? 0,
      /** What the acting pig is carrying, in the order it picked things up:
       * the skill's id, its name, and how many (−1 is unlimited, which is
       * everything on the training ground). */
      carrying: () =>
        game.currentPig.carrying.map((slot) => ({
          skill: slot.skill,
          name: skillName(parts.strings(), slot.skill),
          amount: slot.amount
        })),
      /** The skill chosen out of the menu, or null for empty hands. */
      holding: () => game.currentPig.holding,
      /** Whether the acting pig is mid-swing: the ten-frame wind-up and the
       * attack clip together (lib/game/melee.ts). */
      swinging: () => parts.swinging(),
      /** Where the blade was on the last strike, and how near everyone came:
       * `gap.x`/`gap.z` against 170, `gap.y` against 360, `degrees` against
       * 67.5. Whichever is over is the reason nothing was hit. */
      strike: () => parts.strike(),
      /** How many rings a blow has in the air — two or three per hit, for
       * about half a second (lib/game/effects.ts). */
      effects: () => parts.effects(),
      /** How many puffs of smoke are up — fourteen per thing broken or blown
       * up, over three bursts (lib/game/effects.ts). */
      smoke: () => parts.smoke(),
      /** …and how many sprites the FIREBALL has: a hundred and forty at the
       * peak, over two clouds a frame apart (lib/game/cloud.ts). */
      fire: () => parts.fire(),
      /** The records still off the map, and how many crates are coming down
       * under a canopy right now (lib/game/script.ts). */
      script: () => parts.script(),
      /** Bullets still flying. A gun's range is a LIFETIME in frames, so this
       * goes back to zero on its own (lib/game/projectile.ts). */
      shots: () => parts.shots(),
      aim: () => parts.aim(),
      grenades: () => parts.grenades(),
      /** Every mine counting down under somebody's feet (lib/game/mines.ts). */
      mines: () => parts.mines(),
      charging: () => parts.charging(),
      /** Where the shot sequence is: 'fuse' while the ten frames run down,
       * 'flight' while the camera rides the bullet, null when the pig is its
       * own again (lib/game/shot.ts). */
      firing: () => parts.firing(),
      /** Every line a pig has said. */
      barks: () => parts.barks(),
      /** True while the turn is held on what the blow left behind — the clock
       * is stopped and the camera is off the pig (lib/game/aftermath.ts). */
      aftermath: () => parts.aftermath(),
      /** True while the turn is ENDING: the exe's mode 13, WALK AWAY. Nobody
       * can drive, the clock is stopped and `swimming` is how many pigs are
       * still making for the shore (lib/game/walkAway.ts). */
      walkAway: () => parts.walkAway(),
      /** Whether the pig's own body is MOVING, and which half of the chain is
       * responsible when it is not: `foot` is the ankle relative to the hip out
       * of the engine's sampler, `drawn` the quaternion that bone wears on the
       * mesh. Neither should hold still while a walk clip runs. */
      pose: () => parts.pose(),
      /** Every pig's health, side by side — what a bayonet is measured by. */
      health: () =>
        game.players.flatMap((player) =>
          player.pigs.map((pig) => ({ name: pig.name, health: pig.health }))
        ),
      /** The level's opening drop: who is still arriving and how far up they
       * are. `running` false is what says the battle has begun. */
      dropIn: () => dropIn.state(),
      /** Every sound the battle has played, in order — a spec cannot listen,
       * so this is what it asserts on instead. */
      sounds: () => parts.sounds(),
      /** The squads as they were fielded — where each pig started, what class
       * the map called it, and which art it actually wears. */
      squads: () =>
        game.players.map((player) => ({
          name: player.name,
          pigs: player.pigs.map((pig) => ({
            name: pig.name,
            pigClass: pig.pigClass,
            art: squad.of(pig.id)?.art ?? '',
            x: pig.position.x,
            z: pig.position.z,
            heading: pig.heading
          }))
        })),
      /** What the map put on its ground: how many records were drawn, and
       * where each one landed — the spec's only view of placement. */
      props: () => ({
        placed: props.placed,
        objects: parts.objectCount,
        at: props.group.children.map((mesh) => ({
          name: mesh.name,
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z
        }))
      }),
      /** Where the chase camera actually is, world space — the only way a
       * spec can tell "swimming" from "the view has gone under the water". */
      camera: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z }),
      /**
       * Where the camera is LOOKING, as a unit vector.
       *
       * The rig eases its position and does not ease what it points at, so a
       * shake in the view shows up here and barely shows up in `camera()` —
       * which is how play could feel the camera tremble while every position
       * reading looked calm.
       */
      facing: () => {
        // -Z through the camera's rotation, worked out by hand: this module
        // imports three for its TYPES only and a `new Vector3` here would drag
        // the library in for one debug reading.
        const { x, y, z, w } = camera.quaternion
        return {
          x: -2 * (x * z + w * y),
          y: -2 * (y * z - w * x),
          z: -(1 - 2 * (x * x + y * y))
        }
      },
      warp: parts.warp,
      beginTurn: () => game.beginTurn(),
      /** Hand the turn over NOW, cutting the beat at the end of it short. The
       * player has no way to do this — a turn ending is not something anybody
       * hurries — so it is here for the specs that are not about the beat, the
       * same as `beginTurn` (lib/game/walkAway.ts). */
      cutTurnBeat: () => parts.cutTurnBeat()
    }
  }
}
