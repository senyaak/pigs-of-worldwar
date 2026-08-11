// A BURNING FUSE: the spark on top of a planted charge, and the smoke off it.
//
// Play: "динамит не горит." It did not — a charge went down, stood there and blew
// up with nothing to say it was live. What the ORIGINAL shows is not decoded, and
// this file says so at the top rather than in a footnote: the two mine rows differ
// only in their effect ids (0x4c against 0x55, `weapons/mines.md`) and neither of
// those effects has been opened, so nothing here is a reading. It is a spark on the
// end the fuse is on, sized off the charge's own model, flickering on the clock.
//
// Where the fuse IS, though, is measured: `WE_TNT`'s black stub runs from model
// x −148 to −64 and the bundle from −64 to 77, so the tip is 148 model units from
// the origin along −X — and −X is what `three/grenades.ts` stands upright. Half of
// that in world units is where the flame sits.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'

/** How far the fuse's tip is from the charge's own origin, MODEL units — the far
 * end of `WE_TNT`'s black stub. */
export const FUSE_TIP = 148

/** How big the spark is drawn, world units. A charge is about 110 across drawn, so
 * this is a flame the width of the bundle — the remake's own number, like every
 * particle size here. */
const SPARK_SIZE = 120

/** How much it wobbles, and how fast. Eyework: fast enough to read as burning,
 * shallow enough not to strobe. */
const FLICKER = 0.35
const FLICKER_RATE = 26

export interface FuseArt {
  /**
   * Show a spark at each of these points, and put the rest away. Once a frame.
   *
   * `seconds` is the battle's own clock — the flicker rides it, so two machines
   * stepping the same battle draw the same flame.
   */
  draw(at: readonly { x: number; y: number; z: number }[], seconds: number): void
  /** How many are alight — what a spec asks, since a sprite on a transparent quad
   * is not something markup or a screenshot can be held to. */
  lit(): number
  clear(): void
  dispose(): void
}

/** The blob the spark is painted with: white at the middle through orange to
 * nothing, on a canvas, the same way the smoke's is (three/lobTrail.ts). */
function buildTexture(): THREE.CanvasTexture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const paint = canvas.getContext('2d')
  if (paint) {
    const glow = paint.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    glow.addColorStop(0, 'rgba(255,255,236,1)')
    glow.addColorStop(0.35, 'rgba(255,196,84,0.85)')
    glow.addColorStop(1, 'rgba(255,120,0,0)')
    paint.fillStyle = glow
    paint.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function createFuseArt(root: THREE.Object3D): FuseArt {
  const texture = buildTexture()
  // ADDITIVE, and no depth write: a flame is light rather than a surface, and it
  // must not hide the charge it is burning on.
  const material = new THREE.SpriteMaterial({
    map: texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true
  })
  const sparks: THREE.Sprite[] = []
  let lit = 0

  const sparkAt = (i: number): THREE.Sprite => {
    while (sparks.length <= i) {
      const sprite = new THREE.Sprite(material)
      sprite.renderOrder = 2
      root.add(sprite)
      sparks.push(sprite)
    }
    return sparks[i]
  }

  return {
    draw(at, seconds) {
      lit = at.length
      for (let i = 0; i < at.length; i++) {
        const sprite = sparkAt(i)
        sprite.visible = true
        sprite.position.set(at[i].x, at[i].y, at[i].z)
        // Each one flickers out of step with the others — a second charge next to
        // the first must not pulse in time with it.
        const wobble = 1 + FLICKER * Math.sin(seconds * FLICKER_RATE + i * 1.7)
        const size = SPARK_SIZE * wobble
        sprite.scale.set(size, size, size)
      }
      for (let rest = at.length; rest < sparks.length; rest++) sparks[rest].visible = false
    },
    lit: () => lit,
    clear() {
      for (const sprite of sparks) sprite.visible = false
      lit = 0
    },
    dispose() {
      for (const sprite of sparks) root.remove(sprite)
      sparks.length = 0
      material.dispose()
      texture.dispose()
      lit = 0
    }
  }
}
