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
import type { Bank } from '../audio/bank'
import { controller } from '../input/controller'
import type { DropIn } from './dropIn'
import type { MapProps } from './props'
import type { Squad } from './squad'

export interface DebugParts {
  game: Game
  query: TerrainQuery
  squad: Squad
  dropIn: DropIn
  props: MapProps
  /** How many .POG records the map carried, against how many were drawn. */
  objectCount: number
  camera: THREE.Camera
  /** Asked for rather than held: the bank loads beside the scene. */
  bank: () => Bank
  /** Seconds the acting pig has stood still — what the name plates wait for,
   * and the only way a spec can tell why they are up. */
  still: () => number
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
        swimming: query.isWater(game.currentPig.position.x, game.currentPig.position.z),
        still: parts.still()
      }),
      currentNodeY: () => squad.of(game.currentPig)?.node.position.y ?? 0,
      /** The level's opening drop: who is still arriving and how far up they
       * are. `running` false is what says the battle has begun. */
      dropIn: () => dropIn.state(),
      /** Every sound the battle has played, in order — a spec cannot listen,
       * so this is what it asserts on instead. */
      sounds: () => parts.bank().played(),
      /** The squads as they were fielded — where each pig started, what class
       * the map called it, and which art it actually wears. */
      squads: () =>
        game.players.map((player) => ({
          name: player.name,
          pigs: player.pigs.map((pig) => ({
            name: pig.name,
            pigClass: pig.pigClass,
            art: squad.of(pig)?.art ?? '',
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
      warp: parts.warp
    }
  }
}
