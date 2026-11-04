// Drawing a planted charge's burning fuse.
//
// The rules are pure and next door (`lib/game/fuse.ts`): ten of the cloud's
// records, one renewed a frame. This file is the sprite pool, with the cloud's own
// size and colour laws. It takes nothing else of the fireball's: a record is a flat
// quad with no map and no alpha (`effects/cloud.md`, 0x489FED), at the exe's own
// size (`lib/game/cloud.ts`, `cloudWidth`), added to what is behind it: flags 0x5A
// (`effects/cloud.md`, 0x489FA0), and play's "в оригинале там не дым а искры когда
// он горит".
//
// The exe's records and sizes are world units and a pig is the same 320 in both
// worlds (docs/facts/space-and-scale.md), so neither is scaled here. That is not the
// fireball's split (`three/effects.ts`, `RING_SCALE`), whose reason predates that fact.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { cloudChannel, cloudWidth } from '../../../lib/game/cloud'
import { advanceFuse, beginFuse, fuseSpent } from '../../../lib/game/fuse'
import type { Fuse } from '../../../lib/game/fuse'
import type { Point } from '../../../lib/game/pose'

export interface FuseFlames {
  /** This charge's fuse tip this frame. Call once a frame per burning charge,
   * before `update`; one not followed has gone, and its flame goes with it. Keyed
   * by the projectile's id, as `three/lobTrail.ts` is and for the same reason. */
  follow(who: number, tip: Point): void
  /** Step whichever frames have come due, and lay the sprites out. */
  update(delta: number): void
  /** How many were followed last frame: what says a fuse is alight. */
  burning(): number
  clear(): void
  dispose(): void
}

export function createFuseFlames(root: THREE.Object3D): FuseFlames {
  /** One flame a charge, and the tip it stands on. The tip outlives the charge by
   * the two frames the flame does. */
  const flames = new Map<number, { fuse: Fuse; tip: Point }>()
  const sprites: THREE.Sprite[] = []
  /** Whichever charges were followed since the last `update`. */
  const followed = new Set<number>()
  let burning = 0
  /** Fractional frames carried over: the engine renews these per FRAME, at its
   * own rate, and a renderer's step is seconds. */
  let carry = 0

  const spriteAt = (i: number): THREE.Sprite => {
    while (sprites.length <= i) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      )
      root.add(sprite)
      sprites.push(sprite)
    }
    return sprites[i]
  }

  const redraw = (): void => {
    let n = 0
    for (const { fuse, tip } of flames.values()) {
      const size = cloudWidth(fuse)
      fuse.blobs.forEach((record, i) => {
        const sprite = spriteAt(n++)
        const [r, g, b] = fuse.colours[i]
        sprite.visible = true
        sprite.position.set(tip.x + record.x, tip.y + record.y, tip.z + record.z)
        sprite.scale.setScalar(size)
        sprite.material.color.setRGB(
          cloudChannel(r) / 255,
          cloudChannel(g) / 255,
          cloudChannel(b) / 255
        )
      })
    }
    for (let rest = n; rest < sprites.length; rest++) sprites[rest].visible = false
  }

  return {
    follow(who, tip) {
      followed.add(who)
      const flame = flames.get(who)
      if (flame) flame.tip = { ...tip }
      else flames.set(who, { fuse: beginFuse(Math.random), tip: { ...tip } })
    },
    update(delta) {
      carry += delta / EXE_FRAME_SECONDS
      while (carry >= 1) {
        carry -= 1
        for (const [who, { fuse }] of flames) {
          advanceFuse(fuse, followed.has(who), Math.random)
          if (fuseSpent(fuse)) flames.delete(who)
        }
      }
      burning = followed.size
      followed.clear()
      redraw()
    },
    burning: () => burning,
    clear() {
      flames.clear()
      followed.clear()
      burning = 0
      redraw()
    },
    dispose() {
      for (const sprite of sprites) {
        root.remove(sprite)
        sprite.material.dispose()
      }
      sprites.length = 0
      flames.clear()
    }
  }
}
