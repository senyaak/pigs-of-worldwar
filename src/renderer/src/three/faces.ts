// The face a pig comes down the sky in.
//
// A pig's head bakes its RESTING face into its own archive — `eyes000` under
// relaxed brows and `gobs000` with the tongue lolling out — and
// `Chars/FACES.MTD` carries seven alternates of each at the same sizes:
// closed lids, a wide-eyed stare, anger, a grin, a scream, and two pairs on
// black for the dark. The exe loads that archive unconditionally in its
// battle loader (0x486030, `library/notes.md`), so the swap exists; HOW it
// picks a face is not decoded.
//
// `[CHECK — remake]` What is built here is therefore the remake's own line:
// a pig under a canopy is TERRIFIED — `eyes004`, the stare, over `gobs004`,
// the scream — from the moment the canopy opens (a cut one keeps it: falling
// free is no calmer) until it touches down and its own face comes back.
// Correct the pair against play; an expression is one name here.

import * as THREE from 'three'
import type { TimImage } from '../api'
import type { Squad } from './squad'

export interface Faces {
  /** The drop face on, by pig id (lib/game/events.ts). */
  scare(pig: number): void
  /** …and the pig's own back. */
  calm(pig: number): void
  dispose(): void
}

/** No face art in the install: every pig keeps the face its head bakes in. */
const NOTHING: Faces = { scare: () => {}, calm: () => {}, dispose: () => {} }

/** The same upload the model's own skins get (three/modelMesh.ts) — the
 * alternates are drop-in replacements at identical sizes, so the UVs hold. */
function upload(image: TimImage): THREE.Texture {
  const map = new THREE.DataTexture(image.rgba, image.width, image.height, THREE.RGBAFormat)
  map.flipY = false
  map.magFilter = THREE.NearestFilter
  map.minFilter = THREE.LinearFilter
  map.colorSpace = THREE.SRGBColorSpace
  map.needsUpdate = true
  return map
}

export function createFaces(squad: Squad, art: readonly TimImage[]): Faces {
  const find = (base: string): TimImage | undefined =>
    art.find((one) => one.name.toLowerCase().startsWith(base))
  const eyes = find('eyes004')
  const gob = find('gobs004')
  if (!eyes || !gob) return NOTHING
  const scaredEyes = upload(eyes)
  const scaredGob = upload(gob)
  return {
    scare: (pig) => squad.of(pig)?.wearFace(scaredEyes, scaredGob),
    calm: (pig) => squad.of(pig)?.wearFace(null, null),
    dispose() {
      scaredEyes.dispose()
      scaredGob.dispose()
    }
  }
}
