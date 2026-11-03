// What the dashboard's map is centred on and what it marks
// (lib/game/scanner.ts).

import { objectBlips, pigBlips } from '../../../../lib/game/scanner'
import type { Blip, Eye } from '../../../../lib/game/scanner'
import type { SceneCore } from './core'

/**
 * Where the camera is and which way it looks, GAME space — what the
 * dashboard's map is centred on and turned by.
 *
 * The root is turned half a turn about x, so a point taken back into its
 * space IS in game space; that is the same trip the see-through test makes.
 * The look is taken as a second POINT rather than as a direction, because a
 * direction taken through `worldToLocal` would come back rotated and
 * translated both.
 */
export const eye = (core: SceneCore): Eye => {
  const { host, root, state } = core
  root.worldToLocal(state.mapEye.copy(host.camera.position))
  host.camera.getWorldDirection(state.mapLook)
  root.worldToLocal(state.mapLook.add(host.camera.position))
  // `atan2(z, x)` and not the other way round: the library's yaw is the one
  // whose `(cos, sin)` in world (x, z) points UP the widget
  // (lib/game/scanner.ts).
  return { x: state.mapEye.x, z: state.mapEye.z, heading: Math.atan2(state.mapLook.z - state.mapEye.z, state.mapLook.x - state.mapEye.x) }
}

/**
 * Everything the map draws a marker for.
 *
 * Whose turn it is decides what is on it: an espionage pig is on its own
 * team's map and on nobody else's (lib/game/scanner.ts). A crate's marker
 * belongs to the OBJECT in the original and dies with it, so the art is
 * asked whether the record is still standing.
 */
export const blips = ({ assets, game, props }: SceneCore): Blip[] => [
  ...pigBlips(game.players, game.players.indexOf(game.currentPlayer), performance.now() / 1000),
  ...objectBlips(assets.objects, (id) => !props.drawn(id))
]
