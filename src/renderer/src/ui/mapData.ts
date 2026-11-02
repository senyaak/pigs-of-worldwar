// Where a battle's ground and records come from.
//
// A shipped map's are its own two files, `Maps/<NAME>.PMG` and `.POG`. The
// proving ground has no files: it is built in the engine and dressed out of the
// install's archives (main/provingGround.ts), and comes back in the same two
// shapes — so the battle that opens on it cannot tell the difference.

import { PROVING_GROUND } from '../../../lib/game/provingGround'
import type { LoadMapObjectsResult, LoadTerrainResult } from '../api'

export async function loadMapData(name: string): Promise<[LoadTerrainResult, LoadMapObjectsResult]> {
  if (name !== PROVING_GROUND) {
    return Promise.all([
      window.api.loadTerrain(`Maps/${name}.PMG`),
      window.api.loadMapObjects(`Maps/${name}.POG`)
    ])
  }
  const built = await window.api.loadProvingGround()
  if (!built.ok) return [built, built]
  return [
    { ok: true, ...built.terrain },
    { ok: true, ...built.objects }
  ]
}

/** The maps the console map selector opens that are not files in the
 * install — listed beside the shipping maps by `pow.swapMap()`. */
export const BUILT_MAPS: readonly string[] = [PROVING_GROUND]
