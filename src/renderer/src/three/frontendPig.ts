// The pig the FRONTEND stands on a turntable — SELECT TEAM's.
//
// The original keeps a display block for it (0x513034..0x513068) and draws it
// from a per-frame pass at 0x418C50. What the block holds is a class, an
// ANIMATION — `[0x513044] = 0x1B`, **clip 27, the idle** — and a placement,
// which on SELECT TEAM is the pass's own defaults because record 3's arm
// overrides nothing (`frontend/notes.md`). Those defaults are WORLD numbers,
// not screen ones: the tail works out `(−20, −137, 1000)` from them with 160
// and 1280 beside it, so they say where the pig stands in front of a camera
// and not where it lands in 640×480.
//
// Here it is the ordinary scene — the same `ensureScene`/`buildPig` path the
// model viewer uses — rendered to a canvas of its own which the screen BLITS
// into the frontend's 640×480 one. That is why there is no CSS to line up:
// the screen composes and the scene draws, as `ui/battle.ts` has it, and the
// pig lands in the frontend's own pixel space rather than beside it.
//
// This file knows nothing about which screen wants a pig or which row is lit.

import * as THREE from 'three'

import { ensureScene } from './scene'
import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'
import { HEAD, unresolve } from './heldWeapon'
import { buildPig } from './pig'
import type { Pig } from './pig'
import { createPlayer } from './clipViewer'
import type { Player } from './clipViewer'
import type { Bone, Model, Texture } from '../api'
import type { ClipFrames } from '../../../lib/game/clipPose'

/**
 * Where the MODEL comes from, and where each nation's SKIN does.
 *
 * `Chars/british.mad` carries the models and `british.mtd` beside it the
 * British skins, which `loadModel` pairs by stem on its own. The other five
 * nations ship as texture archives with no models — one `.MTD` each, and they
 * line up one for one with the nation index `lib/game/teams.ts` counts by:
 * TOMMY'S TROTTERS, GARLIC GRUNTS, UNCLE HAMS HOGS, PIGGYSTROIKA,
 * SUSHI-SWINE, SOW-A-KRAUTS.
 */
export const CHAR_ARCHIVE = 'Chars/british.mad'
export const NATION_SKINS: readonly (string | null)[] = [
  null,
  'Chars/FRENCH.MTD',
  'Chars/AMERICAN.MTD',
  'Chars/RUSSIAN.MTD',
  'Chars/JAPANESE.MTD',
  'Chars/GERMAN.MTD'
]

/**
 * And the MODEL is the HEAVY GUNNER's, at its nearest level of detail.
 *
 * Not a guess and not the grunt this file once used. SELECT TEAM forces the
 * display object's class to **1** (0x42667D), the class→kind table at 0x4C2E50
 * turns that into kind **2**, and the dll's registry gives a kind three models
 * — `[0x11C94860 + 12*kind + 0/4/8]`, filled straight through `british.mad` a
 * triple at a time (0x1000d94b), so kind 2 is `pchvy_hi` / `pchvy_me` /
 * `hv_hi`. Which of the three is by DEPTH: under 1500 the first, under 4500 the
 * second, else the third (0x10011f8a), and the frontend stands its pig at
 * z = 1000 (`[0x513030]`).
 *
 * **And that is the whole of the two-hats bug.** Every OTHER class carries its
 * headgear in the mesh as one khaki texture group — the grunt's `GR_H000.TIM`
 * is 48 faces on bone 2 — and the heavy is the one that does not. Which is why
 * the engine hangs a nation hat only when the kind is 2: it is the bare head.
 */
export const PIG_ART = 'pchvy_hi'

/**
 * And the six armies differ by HAT, which is a MODEL rather than a texture:
 * `Chars/FHATS.MAD` is seven models of three parts with `FHATS.MTD` beside it,
 * one per nation and a spare (`frontend/notes.md`). The exe loads that very
 * archive by name at 0x4862ED.
 *
 * (`BRITHATS.MAD` beside it holds seven BRITISH hats on the class family
 * names — and is UNUSED: the string does not appear in the executable at all.)
 *
 * The archive's own mesh order is `br_hat, am_h, frhelm, germh, rus_h, ja_ban,
 * pur_hat`, which is SKIN order, and the exe indexes its cache by the skin
 * straight — so the list lives in `lib/game/nations.ts` with the rest of the
 * art tables and this screen looks one up the same way the battle does.
 */
export { HAT_ARCHIVE } from '../../../lib/game/nations'

/** `[0x513044] = 0x1B` (0x426911). */
export const IDLE_CLIP = 27

export interface FrontendPig {
  /** The canvas to blit. Transparent where the pig is not, so it composites
   * over the frontend's own backdrop. */
  readonly canvas: HTMLCanvasElement
  /** Dress it in another nation's skins and hat — a whole rebuild, because a
   * pig's materials are built from its texture set, and the hat hangs off a
   * bone of the mesh that goes with them. */
  reskin(outfit: Outfit): void
  dispose(): void
}

/** What one army wears: its skins, and its hat if the archive had one. */
export interface Outfit {
  textures: Texture[]
  hat: { model: Model; textures: Texture[] } | null
}

export interface PigParts {
  model: Model
  textures: Texture[]
  skeleton: Bone[]
  /** Clip 27, or null to stand in the bind pose. */
  idle: ClipFrames | null
}

/**
 * Build one `width`×`height` in a host element of its own. The host is never
 * shown — it exists because the scene attaches a renderer to an element — so
 * the caller keeps it off-screen and blits `canvas` instead.
 */
export function buildFrontendPig(
  host: HTMLElement,
  size: { width: number; height: number },
  parts: PigParts
): FrontendPig {
  host.style.width = `${size.width}px`
  host.style.height = `${size.height}px`
  const host3d = ensureScene(host)
  // The frontend's backdrop shows through: no scene background of its own,
  // against a renderer built with alpha (`three/scene.ts`).
  host3d.scene.background = null

  let pig: Pig | null = null
  let player: Player | null = null
  /** The hat's own art, which the pig does not own and so cannot free. */
  let hat: { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null = null

  const undress = (): void => {
    if (pig) {
      host3d.scene.remove(pig.group)
      pig.dispose()
    }
    if (hat) disposeMesh(hat.geometry, hat.materials)
    hat = null
  }

  const dress = (outfit: Outfit): void => {
    undress()
    pig = buildPig(parts.model, outfit.textures, parts.skeleton)
    // The HAT, on bone 2 — the head — with the bone's whole matrix and no
    // offset of its own, which is how `three/heldWeapon.ts` decoded the
    // engine's three attachment slots. Same treatment as the weapon in the
    // hand, one bone along.
    if (outfit.hat) {
      const geometry = buildModelGeometry(outfit.hat.model, outfit.hat.textures)
      unresolve(outfit.hat.model, geometry, pig.bones)
      const materials = buildTextureMaterials(outfit.hat.model, outfit.hat.textures)
      hat = { geometry, materials }
      const mesh = new THREE.Mesh(geometry, materials)
      // THE SAME HALF TURN THE WEAPON GETS, and for the same reason: the exe
      // turns every attachment it loads and the body not at all. The hat loop
      // at 0x486340 walks `chars\fhats.mad` a triple at a time and ends each
      // one with `afSetObjPos(hat, 0,0,0, 0, 0x800, 0)` — half of the 0x1000
      // circle, about the vertical (`three/heldWeapon.ts` carries the reading).
      //
      // The measurement agrees, in the model's own units: untorned
      // `br_hat` boxes x −197..61 with the head at x −25..221, i.e.
      // behind the skull — which is what play saw as "on the belly". Turned it
      // boxes x −49..209 and lands on the head. There is nothing to centre.
      mesh.rotation.y = Math.PI
      ;(pig.bones[HEAD] ?? pig.bones[0]).add(mesh)
    }
    host3d.scene.add(pig.group)
    host3d.frameObject(pig.group)
    player = createPlayer(pig)
    player.play(parts.idle)
  }
  dress({ textures: parts.textures, hat: null })

  const tick = (delta: number): void => player?.update(delta)
  host3d.onFrame.add(tick)

  return {
    canvas: host.querySelector('canvas') as HTMLCanvasElement,
    reskin: dress,
    dispose() {
      host3d.onFrame.delete(tick)
      undress()
      pig = null
      player = null
    }
  }
}
