// What a thrown thing LOOKS like in the air: its own model out of the game's
// weapon archive, not a stand-in.
//
// A projectile is a real object in the original — the body factory even sizes
// it per kind (`bulletSize` in lib/game/projectile.ts) — and for a grenade the
// thing you watch arc is the same model the pig was holding a moment ago.
// `weaponModelName(19)` is `WE_GREN`, out of `Chars/WEAPONS.MAD`, exactly as
// `three/heldWeapon.ts` loads it.
//
// The difference from the hand's copy is that this one is FREE: the hand
// un-resolves each vertex against its bone's bind offset so the mesh sits on a
// bone at the bone's origin, and a grenade in flight has no bone, so the model
// is used as it comes.
//
// Nothing here draws a placeholder. A model that has not arrived yet shows
// nothing, which is what the hand does too — a sphere kept "until the real one
// lands" is a stand-in that outlives its excuse.

import * as THREE from 'three'
import { buildModelGeometry, buildTextureMaterials } from './modelMesh'

const WEAPON_ARCHIVE = 'Chars/WEAPONS.MAD'

/** The models face −Z like every weapon in that archive, and the pig holds
 * them mirrored; a thing in the air only needs to not be inside-out. */
const TURNED = Math.PI

interface Art {
  geometry: THREE.BufferGeometry
  materials: THREE.Material[]
}

export interface LobArt {
  /** Ask for one. Cheap and idempotent — the first call starts the load. */
  want(name: string): void
  /**
   * A fresh mesh of it, or null while the model is still loading or if it
   * turned out not to be there. The caller owns what it gets and should put it
   * back through `release`.
   */
  take(name: string): THREE.Mesh | null
  release(mesh: THREE.Mesh): void
  dispose(): void
}

export function createLobArt(): LobArt {
  /** One decoded model per name; null once a load has failed, so a missing
   * entry is asked for once rather than once a frame. */
  const art = new Map<string, Art | null>()
  const loading = new Set<string>()

  const want = (name: string): void => {
    if (art.has(name) || loading.has(name)) return
    loading.add(name)
    void window.api.loadModel(WEAPON_ARCHIVE, name).then((result) => {
      loading.delete(name)
      if (!result.ok) {
        console.log(`no ${name} to throw: ${result.error}`)
        art.set(name, null)
        return
      }
      art.set(name, {
        geometry: buildModelGeometry(result.model, result.textures),
        materials: buildTextureMaterials(result.model, result.textures)
      })
    })
  }

  return {
    want,
    take(name) {
      want(name)
      const ready = art.get(name)
      if (!ready) return null
      const mesh = new THREE.Mesh(ready.geometry, ready.materials)
      mesh.name = name
      mesh.rotation.y = TURNED
      return mesh
    },
    // The geometry and materials are SHARED between every copy, so a mesh
    // going away disposes of neither; `dispose` below owns them.
    release(mesh) {
      mesh.removeFromParent()
    },
    dispose() {
      for (const ready of art.values()) {
        if (!ready) continue
        ready.geometry.dispose()
        for (const material of ready.materials) material.dispose()
      }
      art.clear()
    }
  }
}
