// Snow and rain: the exe's own field of 128 flakes, in the exe's own pixels.
//
// It is a 2D effect end to end — 0x44FE00 for snow and 0x44FA50 for rain, the
// same function with three constants changed, dispatched by mood at 0x44F9B0
// (mood 0 snows, mood 5 rains, nothing else does anything). Every number below
// is read; what is NOT read is called out where it sits. `sky/notes.md`.
//
// The whole field lives on a **640×480 virtual screen** — the size the weather
// object is built at (0x44E0FE) — and is mapped onto whatever the canvas is,
// so a flake is the same fraction of the picture the original's was.

import * as THREE from 'three'
import type { Texture } from '../api'
import { EXE_FRAME_SECONDS } from '../../../lib/game/ballistics'

/** `cmp ebp,80h` — the loop's own bound, and the count of quads handed over. */
export const FLAKES = 128
/** `i & 7`: eight depth layers over four images, two layers each. */
export const LAYERS = 8
/** `push 1E0h; push 280h` at 0x44E0FE — what the field is laid out on. */
export const SCREEN = { width: 640, height: 480 }
/** `lea ebp,[eax-10h]` against `add eax,10h`: the quad is 32 wide. */
const QUAD_WIDTH = 32
/** A full circle, the game's own. */
const TURN = 4096

/**
 * Per-kind constants, all three of them read off the two functions.
 *
 * `reach` is the `4 −` or `5 −` in `m = reach − (i & 3)`, and `shift` the
 * `sar eax,4` or `sar eax,2` the stepped distance is divided by — so rain
 * covers four times the ground snow does out of the same step.
 */
const KIND = {
  snow: { reach: 4, shift: 4 },
  rain: { reach: 5, shift: 2 }
} as const

/**
 * The two amplitudes the camera's own angles are turned into pixels by:
 * `[0x4BC760] = 16` on the cosine and `[0x4BC768] = 32` on the sine.
 */
const DRIFT_AMPLITUDE = 16
const FALL_AMPLITUDE = 32

/**
 * Play's two, on top of the exe's numbers rather than instead of them — asked
 * for as "чуть чуть побыстрее и чуть чуть поменьше".
 *
 * They are separate constants and not edits to the amplitudes above so that
 * what was READ stays readable: the field is still the exe's arithmetic, and
 * these are the only two places the remake leans on it. `[play]`
 */
const FALL_GAIN = 1.35
const SIZE_GAIN = 0.8

/**
 * The two camera angles, in the game's 4096, as the drawer wants them.
 *
 * The fall is `sin([view+0x11754]) × 32` and the drift `cos([view+0x11758]) ×
 * 16`, and both fields are filled by one virtual call that was not followed
 * (0x44E2FC), so the CONVENTION is the thing being pinned here rather than the
 * formula. Handing the pitch over bare made the snow fall UP: the battle's
 * camera looks down, pitch is negative, and the sine goes with it.
 *
 * **The game's elevation field is a quarter turn off ours** — 1024 is level,
 * not 0 — which is the only reading that makes the exe's own choice of
 * functions work: `sin` is then at its maximum for a level camera and eases
 * off as the view tips, which is what the fall of a screen-space snow does,
 * and `cos` on the heading swings the drift with the way the player faces.
 * `[CHECK — remake]` on the quarter turn.
 */
const angles = (yaw: number, pitch: number): { fall: number; drift: number } => ({
  fall: TURN / 4 + pitch,
  drift: yaw
})

export interface Weather {
  /** Once a frame, after the camera has been moved. */
  draw(delta: number): void
  /** What a spec can hold it to (three/debug.ts). */
  state(): { kind: string; flakes: number; layers: number; onScreen: number; fallen: number }
  dispose(): void
}

interface Flake {
  /** Virtual-screen pixels, y DOWN, exactly as the exe keeps them: three s16
   * at `[view+0x11406] + i*6`. */
  x: number
  y: number
  /** `rand() % 3000` — stored by the initialiser and read by neither drawer. */
  z: number
  layer: number
  sprite: THREE.Sprite
}

export interface WeatherParts {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  kind: 'snow' | 'rain'
  /** `Snow0..3` or `Rain0..3` out of `Language/Tims/<kind>.mtd`. */
  images: Texture[]
  /** Seeds the scatter. The battle's own stream is the ENGINE's and the
   * weather is not on it (lib/game/random.ts), so this is its own. */
  seed?: number
}

function skin(texture: Texture): THREE.DataTexture {
  const map = new THREE.DataTexture(texture.rgba, texture.width, texture.height, THREE.RGBAFormat)
  map.flipY = false
  map.magFilter = THREE.LinearFilter
  map.minFilter = THREE.LinearFilter
  map.colorSpace = THREE.SRGBColorSpace
  map.needsUpdate = true
  return map
}

export function buildWeather({ scene, camera, kind, images, seed = 0x5eed }: WeatherParts): Weather {
  const maps = images.map(skin)
  const { reach, shift } = KIND[kind]

  // One material per LAYER: the image is `phase / 2` and the brightness the
  // grey `(8 − phase) * 8` the quad is modulated by.
  //
  // **It is a COLOUR and not an alpha**, and it is ADDED rather than painted
  // over. Both halves of that were got wrong once each and each cost a look:
  // carried as opacity the far layers sat at a sixteenth and were simply not
  // there, so the field read as one flat brightness; carried as an ordinary
  // colour they came out dark grey specks on pale ice, which reads as dirt.
  //
  // Additive is what the ART says: every one of the sixteen palette entries in
  // `Snow0..3` carries the PSX semi-transparency bit — the same 0x8000 this
  // project already decodes as translucency in ground art (lib/game/watermask)
  // — over glyphs of grey 148..206 on a transparent field, 16 to 49 painted
  // pixels of a 32×32 sprite. Added, the ramp can only brighten: the near layer
  // at the art's own value and the far one at an eighth of it, and nothing on
  // screen ever goes darker than what was already there.
  const materials: THREE.SpriteMaterial[] = []
  for (let layer = 0; layer < LAYERS; layer++) {
    const material = new THREE.SpriteMaterial({
      map: maps[Math.floor(layer / 2)] ?? null,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: false,
      fog: false
    })
    // The exe's own ramp, normalised against its own maximum of 64 rather than
    // the engine's 128 — so the near layer comes out at the art's brightness
    // instead of half of it. `[CHECK — remake]` on the divisor.
    material.color.setScalar((LAYERS - layer) / LAYERS)
    materials.push(material)
  }

  // `rand()` three times a flake, and the exe's own moduli: the width, the
  // height, and 3000. A lattice is what this replaces — spread by index it
  // read as a pattern, which is exactly what a random scatter is for.
  let roll = seed >>> 0
  const rand = (): number => {
    roll = (roll * 1103515245 + 12345) >>> 0
    return (roll >>> 16) & 0x7fff
  }

  const group = new THREE.Group()
  group.renderOrder = 10
  const flakes: Flake[] = []
  for (let i = 0; i < FLAKES; i++) {
    const layer = i & (LAYERS - 1)
    const sprite = new THREE.Sprite(materials[layer])
    sprite.renderOrder = 10
    sprite.frustumCulled = false
    flakes.push({
      x: rand() % SCREEN.width,
      y: rand() % SCREEN.height,
      z: rand() % 3000,
      layer,
      sprite
    })
    group.add(sprite)
  }
  scene.add(group)

  const eye = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3()
  /** Last frame's camera angles, in the game's 4096 — what 0x44F9B0 keeps at
   * `[view+0x11768]`/`[+0x1176C]` to make the two deltas out of. */
  let last: { fall: number; drift: number } | null = null
  /** Real time owed to the exe's frame, which is what all of this is timed in. */
  let owed = 0
  /** Virtual pixels the fastest flake has fallen — measured, not drawn. */
  let fallen = 0

  /** The exe's own divides, all of which round toward ZERO — the `sar` ones
   * come with the `cdq; and edx,mask; add` that makes them do so. */
  const idiv = (value: number, by: number): number => Math.trunc(value / by)
  /** A word delta the short way round: the exe subtracts two s16 angles and
   * lets them wrap, which is the same thing. */
  const turnDelta = (now: number, before: number): number => {
    const raw = (before - now) % TURN
    return raw > TURN / 2 ? raw - TURN : raw < -TURN / 2 ? raw + TURN : raw
  }

  const step = (fallStep: number, driftStep: number, dFall: number, dDrift: number): void => {
    for (let i = 0; i < FLAKES; i++) {
      const flake = flakes[i]
      const phase = flake.layer
      const m = reach - (i & 3)
      // `cdq; and edx,0Fh; add eax,edx; sar eax,4` is the compiler's own
      // signed divide by 16 — it rounds toward ZERO, not down, and the drawing
      // below has to round the same way or the two disagree by a pixel.
      flake.x += idiv(driftStep * m, 1 << shift)
      flake.y += idiv(fallStep * m, 1 << shift)
      // The camera's own turn, divided by `8 − phase` — so the FAR layer takes
      // the most of it. That is the exe's divisor and it is the opposite way
      // round from what a parallax argument would suggest; it is what the code
      // says (0x44FEDD, `mov ebp,8; sub ebp,edi`).
      flake.x -= idiv(dDrift, LAYERS - phase)
      flake.y -= idiv(dFall, LAYERS - phase)
      // …and one pixel a frame, unconditionally (`inc ebx`).
      flake.y += 1
      // One screen either way, no modulo — the exe's own two branches.
      if (flake.x < 0) flake.x += SCREEN.width
      else if (flake.x > SCREEN.width) flake.x -= SCREEN.width
      if (flake.y < 0) flake.y += SCREEN.height
      else if (flake.y > SCREEN.height) flake.y -= SCREEN.height
    }
  }

  return {
    draw(delta) {
      camera.updateMatrixWorld()
      camera.getWorldPosition(eye)
      camera.getWorldDirection(forward)
      up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      right.crossVectors(forward, up).normalize().multiplyScalar(-1)

      // The camera's heading and elevation in the game's 4096, which is the
      // space the trig tables the drawer reads are built in (0x44E139).
      const yaw = (Math.atan2(forward.x, forward.z) / (2 * Math.PI)) * TURN
      const pitch = (Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1)) / (2 * Math.PI)) * TURN
      const now = angles(yaw, pitch)
      const dFall = last === null ? 0 : turnDelta(now.fall, last.fall)
      const dDrift = last === null ? 0 : turnDelta(now.drift, last.drift)
      last = now

      const radians = (units: number): number => (units / TURN) * 2 * Math.PI
      const fallStep = Math.trunc(Math.sin(radians(now.fall)) * FALL_AMPLITUDE * FALL_GAIN)
      const driftStep = Math.trunc(Math.cos(radians(now.drift)) * DRIFT_AMPLITUDE)

      // Whole exe frames, and the deltas are spent on the first of them — the
      // camera turned once, not once per frame owed.
      owed += delta
      let spent = false
      let frames = 0
      while (owed >= EXE_FRAME_SECONDS && frames < 8) {
        owed -= EXE_FRAME_SECONDS
        frames++
        step(fallStep, driftStep, spent ? 0 : dFall, spent ? 0 : dDrift)
        spent = true
      }
      // SIGNED, and deliberately: screen y runs DOWN, so this has to come out
      // positive. Handed the pitch bare it came out negative and the snow rose
      // — which no count of sprites and no single frame would have shown.
      fallen += frames * (idiv(fallStep * reach, 1 << shift) + 1)

      // The plane the field is painted on: far enough forward to clear the
      // near plane. Size is screen-relative, so the distance does not show.
      const at = camera.near * 4
      const height = 2 * at * Math.tan((camera.fov * Math.PI) / 360)
      const width = height * camera.aspect
      // A quad 32 wide on a 640-wide screen, and as TALL as the step it is
      // moving by — which is what stretches rain into streaks (`half` at
      // 0x44FF6B is the fall step halved, applied either side of the flake).
      const spriteWidth = (QUAD_WIDTH * SIZE_GAIN) / SCREEN.width
      const spriteHeight = (Math.max(QUAD_WIDTH, Math.abs(fallStep)) * SIZE_GAIN) / SCREEN.height

      // **Drawn BETWEEN the exe's frames.** The field steps in whole
      // 1/30ths and the window paints at 60 or more, so on the frames that owe
      // no step nothing moves at all and on the ones that do, all 128 jump
      // together — which is exactly what "кластеры двигаются слишком
      // синхронно" looks like. The state stays the exe's integers; only the
      // drawing carries the fraction of a frame still owed.
      //
      // There are only four speeds in the field (`m = reach − (i & 3)`, and
      // the layer changes nothing while the camera is still) — that IS the
      // exe's, and 32 flakes really do move as one. Scattered over the screen
      // it does not show; stepped 1/30th at a time it does.
      const into = owed / EXE_FRAME_SECONDS
      for (let i = 0; i < FLAKES; i++) {
        const flake = flakes[i]
        const m = reach - (i & 3)
        const x = ((flake.x + idiv(driftStep * m, 1 << shift) * into) / SCREEN.width - 0.5) * width
        const y =
          (0.5 - (flake.y + (idiv(fallStep * m, 1 << shift) + 1) * into) / SCREEN.height) * height
        flake.sprite.position
          .copy(eye)
          .addScaledVector(forward, at)
          .addScaledVector(right, x)
          .addScaledVector(up, y)
        flake.sprite.scale.set(spriteWidth, spriteHeight, 1)
      }
    },
    state: () => ({
      kind,
      flakes: flakes.length,
      layers: LAYERS,
      onScreen: flakes.filter(
        (one) => one.x >= 0 && one.x <= SCREEN.width && one.y >= 0 && one.y <= SCREEN.height
      ).length,
      fallen
    }),
    dispose() {
      scene.remove(group)
      for (const material of materials) material.dispose()
      for (const map of maps) map.dispose()
    }
  }
}
