// The effects on the map, DRAWN: bands of light thrown off a blow, the smoke
// after it and the fireball inside it.
//
// The rules are pure and next door (`lib/game/effects.ts`), and so is the LIST
// of what is running (`lib/game/effectField.ts`) — this file adds the geometry
// and nothing else. It used to hold the list too, which meant "is anything
// still coming apart" was a question only a renderer could answer, and the
// aftermath, the map script and the turn all ask it.
//
// The original draws a ring as `[ring+0x84]` quads —
// thirty-two — spanning the previous angle to the current one, outer radius
// `[+0x86]` and inner `[+0x86] - [+0x8C]`, both in the **XZ plane** at the
// effect's own y. It is a shockwave on the horizontal, not a billboard, and
// the colour is per vertex with alpha 0xff (0x48a0c0).
//
// Everything here is game space (Y-down), under the battle's converted root,
// the same as the pigs and the props.

import * as THREE from 'three'
import { RING_DEAD, RING_SEGMENTS, RING_SWEEP, ringColour } from '../../../lib/game/effects'
import type { Effect, Particle, Ring } from '../../../lib/game/effects'
import { cloudChannel, cloudSize } from '../../../lib/game/cloud'
import type { Blob, Cloud } from '../../../lib/game/cloud'
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
const PUFF_SIZE = 640 * MODEL_SCALE
const PUFF_GROWTH = 1

/**
 * What one of the fireball's sprites is measured in.
 *
 * `cloudSize` gives the engine's own figure — `(200 - age) * [+0x7e] * 12.5`,
 * so 10000 down to 5250 for row 0 — but it is handed to the graphics library
 * (`[0x54c5c8]`, which lives in `wh32LIB.DLL`) and the unit is the library's,
 * not the world's. That half is not decoded and cannot be from the exe alone,
 * so **this scalar is the remake's own**: a sixty-fourth, which is the fixed
 * point everything else on the PSX side of this engine uses, and which lands a
 * puff at about half a pig — 156 exe units, 78 after the model scale.
 *
 * The positions and the velocities are NOT in this unit: those go straight
 * onto `[effect+0xa8]`, which is the world's own packed position, so they ride
 * `MODEL_SCALE` like a ring for the same reason a ring does.
 */
const BLOB_UNIT = 1 / 64
const BLOB_SCALE = MODEL_SCALE

/**
 * How solid ONE of them is drawn. The remake's own, and it has to be: seventy
 * sprites at full opacity is a painted ball rather than a cloud, and what makes
 * a cloud is many thin layers. The `-1` the exe puts in the sprite struct might
 * be this and might be anything; the draw is the library's.
 */
const BLOB_ALPHA = 0.4

/** A point in game space, Y-down. */
type Spot = { x: number; y: number; z: number }

export interface EffectArt {
  /** Shape exactly what the engine says is running, and hide the rest. Once a
   * frame (lib/game/effectField.ts). */
  draw(live: readonly Effect[]): void
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

export function createEffectArt(root: THREE.Object3D): EffectArt {
  /** One band per ring on screen, kept and reused: a hit makes two or three
   * and a battle never has many at once. */
  const bands: Band[] = []
  /** …and one sprite per puff, the same way. */
  const puffs: THREE.Sprite[] = []
  /** …and one per sprite of a fireball, of which there are a hundred and
   * forty at once, so these are worth keeping rather than rebuilding. */
  const blobs: THREE.Sprite[] = []
  const puffTexture = buildPuffTexture()

  const bandAt = (i: number): Band => {
    while (bands.length <= i) {
      const band = buildBand()
      root.add(band.mesh)
      bands.push(band)
    }
    return bands[i]
  }

  const newSprite = (blending: THREE.Blending): THREE.Sprite => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: puffTexture,
        transparent: true,
        depthWrite: false,
        blending
      })
    )
    root.add(sprite)
    return sprite
  }

  const puffAt = (i: number): THREE.Sprite => {
    while (puffs.length <= i) puffs.push(newSprite(THREE.NormalBlending))
    return puffs[i]
  }

  /**
   * One of a fireball's sprites, and WHICH WAY it blends is decided by its own
   * authored colour.
   *
   * The blend mode lives in `wh32LIB.DLL` and cannot be read out of the exe, so
   * this is the remake's pick — but it is not arbitrary, because row 0's two
   * clouds sit on opposite sides of any sensible line and each can only have
   * been meant one way:
   *
   * - **(16,0,0)** is a saturated red with nothing else in it. A colour like
   *   that is LIGHT: added, it is the flash. Laid over the map it is a red
   *   stain, which play read as a spray of dirt — "граната делает взрыв землёй".
   * - **(4,3,0)** comes out of the draw's gain as (25,19,0), a near-black. A
   *   colour like that is SHADOW: added it is invisible, which is why the smoke
   *   was missing — "чёрного дыма нет на взрыве". Laid over, it is the smoke.
   *
   * So a cloud bright enough to read as light is added and a dark one covers.
   * Row 0 then draws what play describes: a red flash with black smoke rolling
   * out of it, and no dirt in sight — which matters, because the exe has NO
   * ground test anywhere in the blast (the destructor's arm is unconditional and
   * its tail, 0x4357f9, is camera work), so the dirt could only ever have been
   * the rendering.
   */
  const LIT = 8
  const blobAt = (i: number, lit: boolean): THREE.Sprite => {
    const want = lit ? THREE.AdditiveBlending : THREE.NormalBlending
    while (blobs.length <= i) blobs.push(newSprite(want))
    const sprite = blobs[i]
    if (sprite.material.blending !== want) {
      sprite.material.blending = want
      sprite.material.needsUpdate = true
    }
    return sprite
  }

  /** Lay one puff out. Row 0's colour is 0x4210 — sixteen of thirty-one on
   * every channel, which is the particle setter's own default and reads as
   * the dark smoke play remembers. */
  const drape = (sprite: THREE.Sprite, one: Particle, at: Spot): void => {
    const age = one.age / RING_DEAD
    // The drift halves with the world the same way the fireball's does; the
    // point it started from does not.
    sprite.position.set(
      at.x + (one.x - at.x) * BLOB_SCALE,
      at.y + (one.y - at.y) * BLOB_SCALE,
      at.z + (one.z - at.z) * BLOB_SCALE
    )
    const size = PUFF_SIZE * (1 + PUFF_GROWTH * age)
    sprite.scale.set(size, size, size)
    // **BLACK, and the fireball's own colour law says how black.** Play, twice:
    // "чёрного дыма нет на взрыве", and then "всё ещё нет чёрного дыма от
    // взрывов" — because a puff was 55 units across (a sixth of a pig) in mid
    // grey, which next to a fireball is nothing at all. The colour now goes
    // through `cloudChannel`, the engine's own flat law (`c * 400 >> 6`), which
    // takes row 0's sixteen to 100 of 255 rather than 132 — and the SIZE is the
    // remake's, like every particle size here (`docs`: the half of the engine that
    // draws a particle is not read), set where fourteen puffs read as a rolling
    // cloud instead of a handful of beads.
    const grey = cloudChannel(16) / 255
    sprite.material.color.setRGB(grey, grey, grey)
    sprite.material.opacity = 1 - age
  }

  /**
   * Lay one of a fireball's sprites out.
   *
   * The engine's colour law is flat — `c * 400 >> 6` per channel, with nothing
   * dividing by the age — so unlike a ring a cloud does not flash and does not
   * fade. What it does is SHRINK, from twice its final size to it. The last
   * tenth of the life takes the alpha out for the same reason the ring's does:
   * an additive sprite that never leaves is a smear.
   */
  const kindle = (sprite: THREE.Sprite, one: Cloud, blob: Blob, at: Spot): void => {
    // The OFFSET rides the scale, not the position: where the blast happened
    // is a world coordinate and stays one, while how far a sprite has flown
    // from it is a rig around a body and halves with it. Same split as the
    // ring's radius, and the reason this is not `blob.x * BLOB_SCALE`.
    sprite.position.set(
      at.x + (blob.x - at.x) * BLOB_SCALE,
      at.y + (blob.y - at.y) * BLOB_SCALE,
      at.z + (blob.z - at.z) * BLOB_SCALE
    )
    const size = cloudSize(one) * BLOB_UNIT * BLOB_SCALE
    sprite.scale.set(size, size, size)
    sprite.material.color.setRGB(
      cloudChannel(one.colour[0]) / 255,
      cloudChannel(one.colour[1]) / 255,
      cloudChannel(one.colour[2]) / 255
    )
    sprite.material.opacity =
      BLOB_ALPHA * Math.min(1, (RING_DEAD - one.age) / (RING_DEAD * 0.1))
  }

  const redraw = (live: readonly Effect[]): void => {
    let i = 0
    let p = 0
    let b = 0
    for (const effect of live) {
      for (const one of effect.rings) {
        const band = bandAt(i++)
        band.mesh.visible = true
        shape(band, one)
      }
      for (const one of effect.smoke) {
        const sprite = puffAt(p++)
        sprite.visible = true
        drape(sprite, one, effect.at)
      }
      for (const cloud of effect.clouds) {
        const lit = Math.max(...cloud.colour) >= LIT
        for (const blob of cloud.blobs) {
          const sprite = blobAt(b++, lit)
          sprite.visible = true
          kindle(sprite, cloud, blob, effect.at)
        }
      }
    }
    for (let rest = i; rest < bands.length; rest++) bands[rest].mesh.visible = false
    for (let rest = p; rest < puffs.length; rest++) puffs[rest].visible = false
    for (let rest = b; rest < blobs.length; rest++) blobs[rest].visible = false
  }

  return {
    draw: redraw,
    dispose() {
      for (const band of bands) {
        root.remove(band.mesh)
        band.geometry.dispose()
        band.material.dispose()
      }
      for (const sprite of [...puffs, ...blobs]) {
        root.remove(sprite)
        sprite.material.dispose()
      }
      puffTexture.dispose()
      bands.length = 0
      puffs.length = 0
      blobs.length = 0
    }
  }
}
