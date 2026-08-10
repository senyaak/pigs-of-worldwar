// Drawing a grenade's smoke trail.
//
// The rules are pure and next door (`lib/game/trail.ts`): six puffs a frame laid
// along the segment the grenade travelled, each grey, still, and gone in five
// frames. This file is the sprite pool and nothing else — it is deliberately not
// part of `three/effects.ts`, because a trail has no parameter row and none of
// that file's twelve-stage machinery applies to it.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import {
  TRAIL_COLOUR,
  TRAIL_DEAD,
  advanceTrail,
  beginTrail,
  trailSpent
} from '../../../lib/game/trail'
import type { Trail } from '../../../lib/game/trail'
import { MODEL_SCALE } from '../../../lib/game/scale'

/**
 * How big one puff is drawn. The remake's own, like every other particle size
 * here: the half of the engine that draws a particle (0x48a570) is not read, so
 * nothing is known about the art. A grenade is 35 across; this is a little wider
 * than the thing making it.
 */
const PUFF_SIZE = 90 * MODEL_SCALE

/** How solid one is. The remake's — thin, because six a frame overlap heavily
 * and the trail should read as haze rather than as beads. */
const PUFF_ALPHA = 0.45

export interface LobTrails {
  /** Follow one grenade. Keyed by its ID rather than by its place in the list,
   * because the engine splices that list and an index does not survive it — and
   * rather than by the object, because a snapshot is a fresh object every step
   * (lib/game/snapshot.ts). Call once a frame per live grenade, with where it
   * is now. */
  follow(who: number, at: { x: number; y: number; z: number }): void
  /** Anything not followed this frame keeps fading and then goes. Call after
   * every `follow` for the frame. */
  update(delta: number): void
  /** How many puffs are up — what a spec can see, since a puff is a colour on a
   * transparent quad. */
  live(): number
  clear(): void
  dispose(): void
}

/**
 * The blob a puff is painted with — the same soft canvas fade the effect puffs
 * use, and the same reason: a hard quad reads as a box.
 */
function buildTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const half = size / 2
    const fade = context.createRadialGradient(half, half, 0, half, half, half)
    fade.addColorStop(0, 'rgba(255,255,255,1)')
    fade.addColorStop(0.5, 'rgba(255,255,255,0.5)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = fade
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

export function createLobTrails(root: THREE.Object3D): LobTrails {
  /** One trail per live grenade, keyed by the grenade itself. */
  const trails = new Map<number, Trail>()
  const sprites: THREE.Sprite[] = []
  const texture = buildTexture()
  /** Fractional frames carried over: the engine lays these per FRAME, at its own
   * rate, and a renderer's step is seconds. */
  let carry = 0

  const spriteAt = (i: number): THREE.Sprite => {
    while (sprites.length <= i) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          blending: THREE.NormalBlending
        })
      )
      root.add(sprite)
      sprites.push(sprite)
    }
    return sprites[i]
  }

  const redraw = (): void => {
    let n = 0
    for (const trail of trails.values()) {
      for (const puff of trail.puffs) {
        const sprite = spriteAt(n++)
        sprite.visible = true
        sprite.position.set(puff.x, puff.y, puff.z)
        sprite.scale.setScalar(PUFF_SIZE)
        const grey = TRAIL_COLOUR[0] / 31
        sprite.material.color.setRGB(grey, grey, grey)
        sprite.material.opacity = PUFF_ALPHA * (1 - puff.age / TRAIL_DEAD)
      }
    }
    for (let rest = n; rest < sprites.length; rest++) sprites[rest].visible = false
  }

  /** Where each followed grenade is this frame, held until the frame ticks. */
  const where = new Map<number, { x: number; y: number; z: number }>()

  return {
    follow(who, at) {
      where.set(who, { ...at })
      if (!trails.has(who)) trails.set(who, beginTrail())
    },
    update(delta) {
      carry += delta / EXE_FRAME_SECONDS
      while (carry >= 1) {
        carry -= 1
        for (const [who, trail] of trails) {
          // A grenade that is gone lays nothing more; its last six still fade.
          const at = where.get(who) ?? null
          advanceTrail(trail, at)
          if (!at && trailSpent(trail)) trails.delete(who)
        }
      }
      where.clear()
      redraw()
    },
    live: () => {
      let n = 0
      for (const trail of trails.values()) n += trail.puffs.length
      return n
    },
    clear() {
      trails.clear()
      where.clear()
      redraw()
    },
    dispose() {
      for (const sprite of sprites) {
        root.remove(sprite)
        sprite.material.dispose()
      }
      texture.dispose()
      sprites.length = 0
      trails.clear()
    }
  }
}
