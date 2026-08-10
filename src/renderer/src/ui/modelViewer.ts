// The model viewer panel: loads a model + its clips over IPC, hands the data
// to the three layer (pig.ts, clipViewer.ts, scene.ts), and owns the stats line
// and the animation dropdown.

import type { Clip } from '../api'
import { ensureScene } from '../three/scene'
import { buildPig } from '../three/pig'
import type { Pig } from '../three/pig'
import { createPlayer } from '../three/clipViewer'
import type { Player } from '../three/clipViewer'
import { byId } from './dom'

export interface ModelViewer {
  open(relPath: string, base: string): Promise<boolean>
}

export function initModelViewer(onBack: () => void): ModelViewer {
  const statsEl = byId<HTMLSpanElement>('viewer-stats')
  const canvasHost = byId<HTMLDivElement>('viewer-canvas')
  const animSelect = byId<HTMLSelectElement>('anim-select')
  byId<HTMLButtonElement>('viewer-back').addEventListener('click', onBack)

  let pig: Pig | null = null
  let player: Player | null = null
  let clips: Clip[] = []

  animSelect.addEventListener('change', () => {
    const index = parseInt(animSelect.value, 10)
    player?.play(Number.isNaN(index) ? null : (clips[index] ?? null))
  })

  return {
    async open(relPath, base) {
      const result = await window.api.loadModel(relPath, base)
      if (!result.ok) {
        statsEl.textContent = result.error
        return false
      }
      const { model, textures, skeleton } = result

      const clipsResult = await window.api.loadClips(relPath)
      clips = clipsResult.ok ? clipsResult.clips : []

      const host = ensureScene(canvasHost)
      if (pig) {
        host.scene.remove(pig.group)
        pig.dispose()
      }
      pig = buildPig(model, textures, skeleton)
      host.scene.add(pig.group)
      host.frameObject(pig.group)

      player = createPlayer(pig)
      host.onFrame.clear()
      const currentPlayer = player
      host.onFrame.add((delta) => currentPlayer.update(delta))

      animSelect.replaceChildren(new Option('T-pose', 'none'))
      clips.forEach((clip, index) => {
        animSelect.append(new Option(`${clip.name} (${clip.frameCount}f)`, String(index)))
      })
      animSelect.value = 'none'

      statsEl.textContent =
        `${base} — ${model.triangleCount} triangles ` +
        `(${model.sourceTriangles} + ${model.sourceQuads} quads), ${model.vertexCount} vertices, ` +
        `${textures.length} textures, ${skeleton.length} bones, ${clips.length} clips`
      return true
    }
  }
}
