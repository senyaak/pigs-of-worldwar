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
import { LOB_TRAIL, ROCKET_TRAIL, TRAIL_DEAD, advanceTrail, beginTrail, trailSpent } from '../../../lib/game/trail'
import type { Trail, TrailKind } from '../../../lib/game/trail'
import { MODEL_SCALE } from '../../../lib/game/scale'

/**
 * How big one puff is drawn, per unit of the row's own size byte. The remake's
 * own, like every other particle size here: the half of the engine that draws a
 * particle (0x48a570) is not read, so nothing is known about the art. A grenade
 * is 35 across, and its row's 8 through this puts its haze a little wider than
 * the thing making it — so a charge's 0x10 comes out twice that, which is the
 * ratio the rows carry.
 */
const PUFF_UNIT = (90 / 8) * MODEL_SCALE

/** How solid one is. The remake's — thin, because six a frame overlap heavily
 * and the trail should read as haze rather than as beads. */
const PUFF_ALPHA = 0.45

/**
 * **How much bigger and thicker a ROCKET's smoke is drawn — and this is the
 * DRAWING's number, not the row's.**
 *
 * Play, twice: "дым от снаряда базуки слишком не тот — должен быть больше и
 * гуще." The rows are the engine's and stay that way (`lib/game/trail.ts`): both
 * trails carry the same grey at the same size 8, and the rocket's difference is
 * that it lays six a frame against a grenade's three.
 *
 * What is NOT the engine's is the puff itself — the original draws a textured
 * additive particle out of `expltims.mad` and this draws a soft blob on a canvas
 * (`PUFF_UNIT` above says the same about size). So the correction belongs here,
 * where the invention already lives, rather than in a row that is read.
 */
const ROCKET_SWELL = 2.2
const ROCKET_ALPHA = 0.6

export interface LobTrails {
  /** Follow one projectile. Keyed by its ID rather than by its place in the
   * list, because the engine splices that list and an index does not survive it
   * — and rather than by the object, because a snapshot is a fresh object every
   * step (lib/game/snapshot.ts). Call once a frame per live one, with where it
   * is now and which trail its own kind carries (lib/game/trail.ts). The kind is
   * fixed the first time each is seen. */
  follow(who: number, at: { x: number; y: number; z: number }, kind?: TrailKind): void
  /** How many are laying a trail of this kind right now — what says a fuse is
   * alight, since a puff is a colour on a transparent quad. */
  laying(kind: TrailKind): number
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
        // A rocket's is drawn bigger and thicker than its row asks — the row is
        // the engine's, the PUFF is ours, and this is where that difference
        // belongs (`ROCKET_SWELL`).
        const rocket = trail.kind.id === ROCKET_TRAIL.id
        sprite.visible = true
        sprite.position.set(puff.x, puff.y, puff.z)
        sprite.scale.setScalar(PUFF_UNIT * trail.kind.size * (rocket ? ROCKET_SWELL : 1))
        const [r, g, b] = trail.kind.colour
        sprite.material.color.setRGB(r / 31, g / 31, b / 31)
        // A SPARK is LIT: it adds to whatever is behind it rather than sitting
        // over it, which is the whole difference between a bright puff and
        // something burning (lib/game/trail.ts, `TrailKind.spark`). The pool is
        // shared, so the blending is set only when it actually changes —
        // writing it every frame would ask three to recompile the material.
        const wanted = trail.kind.spark ? THREE.AdditiveBlending : THREE.NormalBlending
        if (sprite.material.blending !== wanted) {
          sprite.material.blending = wanted
          sprite.material.needsUpdate = true
        }
        sprite.material.opacity =
          (rocket ? ROCKET_ALPHA : PUFF_ALPHA) * (1 - puff.age / TRAIL_DEAD)
      }
    }
    for (let rest = n; rest < sprites.length; rest++) sprites[rest].visible = false
  }

  /** Where each followed projectile is this frame, held until the frame ticks. */
  const where = new Map<number, { x: number; y: number; z: number }>()
  /** …and who was still laying one on the last frame that ticked, which is what
   * "is it alight" asks about — `where` is emptied every frame. */
  const active = new Set<number>()

  return {
    follow(who, at, kind = LOB_TRAIL) {
      where.set(who, { ...at })
      if (!trails.has(who)) trails.set(who, beginTrail(kind))
    },
    laying(kind) {
      let n = 0
      for (const who of active) {
        if (trails.get(who)?.kind.id === kind.id) n++
      }
      return n
    },
    update(delta) {
      carry += delta / EXE_FRAME_SECONDS
      while (carry >= 1) {
        carry -= 1
        for (const [who, trail] of trails) {
          // A grenade that is gone lays nothing more; its last six still fade.
          const at = where.get(who) ?? null
          // The SCATTER a spark row asks for, turned into world units here
          // because the roll belongs to whoever draws (lib/game/trail.ts).
          const spread = (trail.kind.scatter ?? 0) * MODEL_SCALE
          advanceTrail(trail, at, spread > 0 ? () => (Math.random() - 0.5) * spread : undefined)
          if (!at && trailSpent(trail)) trails.delete(who)
        }
      }
      active.clear()
      for (const who of where.keys()) active.add(who)
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
      active.clear()
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
