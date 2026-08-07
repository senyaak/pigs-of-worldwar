// The effects on the map: bands of light thrown off a blow.
//
// The rules are pure and next door (`lib/game/effects.ts`); what this file
// adds is the geometry. The original draws a ring as `[ring+0x84]` quads —
// thirty-two — spanning the previous angle to the current one, outer radius
// `[+0x86]` and inner `[+0x86] - [+0x8C]`, both in the **XZ plane** at the
// effect's own y. It is a shockwave on the horizontal, not a billboard, and
// the colour is per vertex with alpha 0xff (0x48a0c0).
//
// Everything here is game space (Y-down), under the battle's converted root,
// the same as the pigs and the props.

import * as THREE from 'three'
import {
  BREAK_EFFECT,
  RING_DEAD,
  RING_SEGMENTS,
  RING_SWEEP,
  advanceEffect,
  beginEffect,
  hitEffectOf,
  ringColour,
  spent
} from '../../../lib/game/effects'
import type { Effect, Particle, Ring } from '../../../lib/game/effects'
import { MODEL_SCALE } from '../../../lib/game/scale'

/**
 * A ring's sizes ride the model scale.
 *
 * The exe computes the radius in WORLD units — it adds it straight to the
 * effect's position, no matrix involved — but the world it computes it in
 * holds pigs twice the size of the remake's. A bayonet's 175 units is a
 * quarter of an original pig's height and would be half of one here, so the
 * band would read as twice the blow. This is a rig around a BODY, exactly
 * like the chase camera's distances (`three/chase.ts`), and it halves with
 * one. The terrain does not (`HEIGHT_SCALE`), and that is the standing split.
 */
const RING_SCALE = MODEL_SCALE

/** Two rings of vertices, one per segment boundary, closing where the exe's
 * angle step leaves off. */
const VERTS = (RING_SEGMENTS + 1) * 2

/**
 * How big one puff of smoke is drawn, and how much bigger it gets over its
 * life.
 *
 * **The remake's own.** The engine's 40-byte particle record is decoded down
 * to its velocity and its age, but the half of the system that DRAWS one
 * (0x48a570, the vtable's `+0x40`) is not read at all, so nothing is known
 * about its size or its art. A pig is 320 tall; this starts at about a third
 * of one and doubles.
 */
const PUFF_SIZE = 110 * MODEL_SCALE
const PUFF_GROWTH = 1

export interface Effects {
  /** Something took a hand-to-hand hit here (game space, Y-down). */
  hit(skill: number, at: { x: number; y: number; z: number }): void
  /** …and something came APART here — a dummy knocked down, and by the look
   * of the exe's handler anything else that breaks. A different effect
   * entirely from a hit: smoke, and not a ring in it. */
  broke(at: { x: number; y: number; z: number }): void
  /** Step them; call once a frame. */
  update(delta: number): void
  /** How many rings are alive — what a spec can see of an effect, since its
   * pixels are a colour on a transparent quad. */
  live(): number
  /** …and how many puffs of smoke. */
  smoke(): number
  /**
   * Whether ANY effect is still running.
   *
   * Not the same as "there is smoke on screen": the break effect's burst does
   * not fire until its third frame (`BREAK_EFFECT`, stage `at: 3`), so a
   * count of puffs is zero for the first fifth of a second and reads as
   * finished before it has begun. Whatever waits for a thing to come apart
   * has to wait on THIS (three/battle.ts).
   */
  busy(): boolean
  /** Drop the lot: a new battle, or a warp. */
  clear(): void
  dispose(): void
}

/** One ring's mesh: a fixed-size strip whose vertices move every frame. */
interface Band {
  mesh: THREE.Mesh
  geometry: THREE.BufferGeometry
  material: THREE.MeshBasicMaterial
  position: THREE.BufferAttribute
}

function buildBand(): Band {
  const geometry = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(new Float32Array(VERTS * 3), 3)
  position.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', position)
  const index: number[] = []
  for (let s = 0; s < RING_SEGMENTS; s++) {
    const a = s * 2
    // Two triangles a segment: outer/inner of this boundary and the next.
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geometry.setIndex(index)
  const material = new THREE.MeshBasicMaterial({
    // The exe writes alpha 0xff and lets the colour itself carry the fade,
    // which over a dark map means ADDING light rather than covering it.
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  return { mesh: new THREE.Mesh(geometry, material), geometry, material, position }
}

/** Lay one ring's vertices out. */
function shape(band: Band, one: Ring): void {
  const outer = Math.max(0, one.radius) * RING_SCALE
  const inner = Math.max(0, one.radius - one.width) * RING_SCALE
  const array = band.position.array as Float32Array
  for (let s = 0; s <= RING_SEGMENTS; s++) {
    const angle = (s / RING_SEGMENTS) * RING_SWEEP
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)
    const at = s * 6
    array[at] = one.x + cos * outer
    array[at + 1] = one.y
    array[at + 2] = one.z + sin * outer
    array[at + 3] = one.x + cos * inner
    array[at + 4] = one.y
    array[at + 5] = one.z + sin * inner
  }
  band.position.needsUpdate = true
  band.geometry.computeBoundingSphere()
  const [r, g, b] = ringColour(one)
  band.material.color.setRGB(r, g, b)
  // Nothing in the exe fades the alpha — the colour going dark IS the fade —
  // but an additive band never quite leaves, so the last tenth of the life
  // takes it out. The remake's own, and the only line here that is.
  band.material.opacity = Math.min(1, (RING_DEAD - one.age) / (RING_DEAD * 0.1))
}

/**
 * The blob a puff is painted with: a soft radial fade on a canvas.
 *
 * The remake's own, like the size — the original's particle art has not been
 * traced. A hard square would read as a box rather than smoke, and this is
 * the cheapest thing that does not.
 */
function buildPuffTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const half = size / 2
    const fade = context.createRadialGradient(half, half, 0, half, half, half)
    fade.addColorStop(0, 'rgba(255,255,255,1)')
    fade.addColorStop(0.5, 'rgba(255,255,255,0.55)')
    fade.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = fade
    context.fillRect(0, 0, size, size)
  }
  return new THREE.CanvasTexture(canvas)
}

export function createEffects(root: THREE.Object3D): Effects {
  const live: Effect[] = []
  /** One band per ring on screen, kept and reused: a hit makes two or three
   * and a battle never has many at once. */
  const bands: Band[] = []
  /** …and one sprite per puff, the same way. */
  const puffs: THREE.Sprite[] = []
  const puffTexture = buildPuffTexture()

  const bandAt = (i: number): Band => {
    while (bands.length <= i) {
      const band = buildBand()
      root.add(band.mesh)
      bands.push(band)
    }
    return bands[i]
  }

  const puffAt = (i: number): THREE.Sprite => {
    while (puffs.length <= i) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: puffTexture,
          transparent: true,
          depthWrite: false
        })
      )
      root.add(sprite)
      puffs.push(sprite)
    }
    return puffs[i]
  }

  /** Lay one puff out. Row 0's colour is 0x4210 — sixteen of thirty-one on
   * every channel, which is the particle setter's own default and reads as
   * the dark smoke play remembers. */
  const drape = (sprite: THREE.Sprite, one: Particle): void => {
    const age = one.age / RING_DEAD
    sprite.position.set(one.x, one.y, one.z)
    const size = PUFF_SIZE * (1 + PUFF_GROWTH * age)
    sprite.scale.set(size, size, size)
    const grey = 16 / 31
    sprite.material.color.setRGB(grey, grey, grey)
    sprite.material.opacity = 1 - age
  }

  const redraw = (): void => {
    let i = 0
    let p = 0
    for (const effect of live) {
      for (const one of effect.rings) {
        const band = bandAt(i++)
        band.mesh.visible = true
        shape(band, one)
      }
      for (const one of effect.smoke) {
        const sprite = puffAt(p++)
        sprite.visible = true
        drape(sprite, one)
      }
    }
    for (let rest = i; rest < bands.length; rest++) bands[rest].mesh.visible = false
    for (let rest = p; rest < puffs.length; rest++) puffs[rest].visible = false
  }

  return {
    hit(skill, at) {
      const effect = hitEffectOf(skill)
      if (!effect) return
      live.push(beginEffect(effect, at))
    },
    broke(at) {
      live.push(beginEffect(BREAK_EFFECT, at))
    },
    update(delta) {
      for (const effect of live) advanceEffect(effect, delta)
      for (let i = live.length - 1; i >= 0; i--) if (spent(live[i])) live.splice(i, 1)
      redraw()
    },
    live: () => live.reduce((n, effect) => n + effect.rings.length, 0),
    smoke: () => live.reduce((n, effect) => n + effect.smoke.length, 0),
    busy: () => live.length > 0,
    clear() {
      live.length = 0
      redraw()
    },
    dispose() {
      for (const band of bands) {
        root.remove(band.mesh)
        band.geometry.dispose()
        band.material.dispose()
      }
      for (const sprite of puffs) {
        root.remove(sprite)
        sprite.material.dispose()
      }
      puffTexture.dispose()
      bands.length = 0
      puffs.length = 0
      live.length = 0
    }
  }
}
