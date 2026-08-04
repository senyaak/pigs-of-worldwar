// The terrain viewer: loads a map's ground over IPC and shows it in the
// shared viewer panel (no animations — the dropdown empties).

import { ensureScene } from '../three/scene'
import { buildTerrain } from '../three/terrain'
import type { Terrain } from '../three/terrain'
import { byId } from './dom'

export interface TerrainViewer {
  open(relPath: string): Promise<boolean>
}

export function initTerrainViewer(): TerrainViewer {
  const statsEl = byId<HTMLSpanElement>('viewer-stats')
  const canvasHost = byId<HTMLDivElement>('viewer-canvas')
  const animSelect = byId<HTMLSelectElement>('anim-select')

  let terrain: Terrain | null = null

  return {
    async open(relPath) {
      const result = await window.api.loadTerrain(relPath)
      if (!result.ok) {
        statsEl.textContent = result.error
        return false
      }
      const host = ensureScene(canvasHost)
      if (terrain) {
        host.scene.remove(terrain.group)
        terrain.dispose()
      }
      host.onFrame.clear()
      animSelect.replaceChildren()

      terrain = buildTerrain(result.blocks, result.textures)
      host.scene.add(terrain.group)
      host.frameObject(terrain.group)

      statsEl.textContent =
        `${relPath} — ${result.blocks.length} blocks, ${terrain.tileCount} tiles, ` +
        `${result.textures.length} textures`
      return true
    }
  }
}
