// WHAT STANDS BETWEEN THE CAMERA AND THE PIG: the boxes that could, grown to
// the art the player sees, and the fade of the ones that do.

import { PIG_HEIGHT, PIG_HOLD, PIG_RADIUS } from '../../../../lib/game/obstacles'
import type { Obstacle } from '../../../../lib/game/obstacles'
import { MODEL_SCALE } from '../../../../lib/game/scale'
import { crossedTowards, sightBlockers, silhouetteOf } from '../../../../lib/game/seeThrough'
import type { ArtExtent } from '../../../../lib/game/seeThrough'
import type { BattleAssets } from '../battle'
import type { SceneCore } from './core'

/** Every box that could hide the pig from the camera (lib/game/seeThrough.ts),
 * built once — the records do not move. The boxes are grown to the ART the
 * player actually sees, measured off each model's own vertices the way
 * `bodyExtent` measures a pig: a tree's collider is its trunk and its crown
 * is what hides things ("текстуры листвы не делаются прозрачными"). */
export const buildBlockers = (assets: BattleAssets): Obstacle[] => {
  const artExtents = new Map<string, ArtExtent>()
  for (const prop of assets.props) {
    const positions = prop.model.positions
    if (positions.length === 0) continue
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i])
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1])
      minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2])
    }
    // The mesh is drawn at MODEL_SCALE about the record's centre and turned
    // only about the vertical, so the flat halves are safe as the larger of
    // the two reaches (three/props.ts).
    artExtents.set(prop.name.toUpperCase(), {
      halfX: Math.max(Math.abs(minX), Math.abs(maxX)) * MODEL_SCALE,
      halfZ: Math.max(Math.abs(minZ), Math.abs(maxZ)) * MODEL_SCALE,
      topOffset: minY * MODEL_SCALE,
      bottomOffset: maxY * MODEL_SCALE
    })
  }
  return sightBlockers(assets.objects, (name) => artExtents.get(name) ?? null)
}

/** Fade whatever stands between the eye and the acting pig. */
export const fadeBlockers = (core: SceneCore): void => {
  const { game, props, blockers, squad, state } = core
  const watched = squad.of(game.currentPig.id)
  if (watched) {
    const { x, y, z } = game.currentPig.position
    props.fade(
      crossedTowards(
        blockers,
        state.eyeInGame,
        // HIS OWN SILHOUETTE — nine points of it, each ray stopped at his
        // NEAR SIDE, and a box has to cover half of them to be in the way
        // (lib/game/seeThrough.ts). Nothing is grown before the test: the
        // margin that used to be here faded whatever stood BESIDE him.
        silhouetteOf(state.eyeInGame, { x, y, z }, PIG_HEIGHT, PIG_RADIUS, PIG_HOLD / 2)
      )
    )
  }
}
