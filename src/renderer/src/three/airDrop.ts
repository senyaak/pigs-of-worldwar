// A crate coming down under a canopy, because the map's script said so.
//
// The script places a waiting object by switching it on where it stands —
// unless its BODY TYPE is 0x135b, which is what the pickup constructor writes
// (exe 0x4641bd). Those the placer lifts **0xC00 above the thing that
// signalled** and lets fall (0x4aa64a..0x4aa693). So a bridge appears and a
// crate arrives, and which it is comes out of the record rather than out of a
// choice made here. `../../../pigs-disasm/script/notes.md`.
//
// 0xC00 is the same 3072 the level's own drop-in starts a pig at, so the
// descent is the same one: `lib/game/parachute.ts`, canopy constants and all.
//
// Game space, Y-down, under the battle's converted root.

import type * as THREE from 'three'
import { DROP_HEIGHT, cutChute, updateDrop } from '../../../lib/game/parachute'
import type { DropState } from '../../../lib/game/parachute'
import type { Model, Texture } from '../api'
import { buildCanopies } from './parachute'
import type { Canopies } from './parachute'
import type { MapProps } from './props'

export interface AirDrops {
  /**
   * Send one record's art down. `fromY` is the y of whatever signalled — the
   * exe reads the FINISHER's height and not the crate's own ground, so a
   * dummy broken on a rise drops its crate from higher up.
   */
  send(id: number, fromY: number): void
  /** One frame of every descent. */
  update(delta: number): void
  /** How many are still in the air. */
  falling(): number
  /**
   * Where the first one still coming down is, for the camera to sit on — null
   * when the sky is empty. Game space, Y-down.
   */
  watching(): { x: number; y: number; z: number } | null
  /**
   * Cut every canopy that is still up.
   *
   * Play's, and marked as such: a pig cuts its own with the jump key
   * (`lib/game/parachute.ts`, `cutChute`) and the crate uses the same descent,
   * so the same key ends it. The exe has not been read on whether it lets you.
   */
  cut(): void
  dispose(): void
}

interface Falling {
  id: number
  drop: DropState
  ground: number
  canopy: THREE.Mesh | null
}

export function createAirDrops(
  props: MapProps,
  canopy: { model: Model; textures: Texture[] } | null,
  onLanded: (id: number) => void
): AirDrops {
  // A map with no `WE_PARA` in its install still drops the crate; it simply
  // has nothing to hang over it. Same call the drop-in makes.
  const canopies: Canopies | null = canopy ? buildCanopies(canopy.model, canopy.textures) : null
  const live: Falling[] = []

  return {
    send(id, fromY) {
      const ground = props.restingY(id)
      if (ground === null) return
      props.raise(id, fromY - DROP_HEIGHT)
      props.show(id, true)
      const mesh = props.meshOf(id)
      live.push({
        id,
        drop: { y: fromY - DROP_HEIGHT, vy: 0, chute: true, landed: false },
        ground,
        canopy: canopies && mesh ? canopies.open(mesh) : null
      })
    },
    update(delta) {
      for (let i = live.length - 1; i >= 0; i--) {
        const one = live[i]
        updateDrop(one.drop, one.ground, delta)
        props.raise(one.id, one.drop.y)
        if (!one.drop.landed) continue
        if (one.canopy && canopies) canopies.cut(one.canopy)
        live.splice(i, 1)
        onLanded(one.id)
      }
    },
    falling: () => live.length,
    watching() {
      const first = live[0]
      if (!first) return null
      const mesh = props.meshOf(first.id)
      if (!mesh) return null
      return { x: mesh.position.x, y: first.drop.y, z: mesh.position.z }
    },
    cut() {
      for (const one of live) {
        if (!one.drop.chute) continue
        cutChute(one.drop)
        if (one.canopy && canopies) canopies.cut(one.canopy)
        one.canopy = null
      }
    },
    dispose() {
      for (const one of live) if (one.canopy && canopies) canopies.cut(one.canopy)
      live.length = 0
      canopies?.dispose()
    }
  }
}
