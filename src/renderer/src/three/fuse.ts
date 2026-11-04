// Drawing a planted charge's burning fuse.
//
// The rules are pure and next door (`lib/game/fuse.ts`): ten of the cloud's
// records, one renewed a frame. This file is the sprite pool, and it lays one out
// the way `three/effects.ts` lays a fireball's out, with the cloud's own size and
// colour laws, so the two read as one effect system. What it does not take is the
// fireball's alpha: that one thins seventy sprites and these are ten, drawn flat
// the way the exe's draw has them (`effects/cloud.md`, 0x489FA0).
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'
import { cloudChannel, cloudSize } from '../../../lib/game/cloud'
import { FUSE_TRAIL, advanceFuse, beginFuse, fuseSpent } from '../../../lib/game/fuse'
import type { Fuse } from '../../../lib/game/fuse'
import type { Point } from '../../../lib/game/pose'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { BLOB_SCALE, BLOB_UNIT, buildPuffTexture } from './effects'

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

/** The blend the row asks for: `[play]`, and the exe's draw agrees. */
const BLENDING = FUSE_TRAIL.spark ? THREE.AdditiveBlending : THREE.NormalBlending

export function createFuseFlames(root: THREE.Object3D): FuseFlames {
  /** One flame a charge, and the tip it stands on. The tip outlives the charge by
   * the two frames the flame does. */
  const flames = new Map<number, { fuse: Fuse; tip: Point }>()
  const sprites: THREE.Sprite[] = []
  const texture = buildPuffTexture()
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
          map: texture,
          transparent: true,
          depthWrite: false,
          blending: BLENDING
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
      const size = cloudSize(fuse) * BLOB_UNIT * BLOB_SCALE
      fuse.blobs.forEach((record, i) => {
        const sprite = spriteAt(n++)
        const [r, g, b] = fuse.colours[i]
        sprite.visible = true
        // How far one has flown is a rig round a body and halves with it; where
        // the tip is, is a world position already. The same split as a fireball.
        sprite.position.set(
          tip.x + record.x * MODEL_SCALE,
          tip.y + record.y * MODEL_SCALE,
          tip.z + record.z * MODEL_SCALE
        )
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
      texture.dispose()
      sprites.length = 0
      flames.clear()
    }
  }
}
