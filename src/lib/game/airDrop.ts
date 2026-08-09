// Crates coming down under canopies, because the map's script said so.
//
// The script places a waiting object by switching it on where it stands —
// unless its BODY TYPE is 0x135b, which is what the pickup constructor writes
// (exe 0x4641bd). Those the placer lifts **0xC00 above the thing that
// signalled** and lets fall (0x4aa64a..0x4aa693). So a bridge appears and a
// crate arrives, and which it is comes out of the record rather than out of a
// choice made here. `script/notes.md`.
//
// 0xC00 is the same 3072 the level's own drop-in starts a pig at, so the
// descent is the same one: `parachute.ts`, canopy constants and all.
//
// The list is here rather than in the renderer because the battle WAITS on it:
// the beat after a blow does not end while anything is still in the air, and
// the camera sits on whatever is coming down. Game space, Y-down.

import { DROP_HEIGHT, cutChute, updateDrop } from './parachute'
import type { DropState } from './parachute'
import type { Point } from './pose'
import type { Emit } from './events'

/** How long after the aeroplane the canopy opens. Play's ordering — the
 * plane is heard first — and the gap is eyework. */
const CHUTE_DELAY = 0.5

/** One crate on its way down. */
export interface Descent {
  /** The map record's id — what the renderer moves. */
  id: number
  drop: DropState
  /** Where it will come to rest. */
  ground: number
  /** Seconds until the canopy is heard, or 0 once it has been. */
  chuteIn: number
}

export interface AirDropWorld {
  /** Where this record comes to rest, or null if the map has no such object. */
  groundOf: (id: number) => number | null
  /** Where it stands, horizontally — the camera frames the descent there. */
  at: (id: number) => Point | null
}

export interface AirDrops {
  /**
   * Send one record down. `fromY` is the y of whatever signalled — the exe
   * reads the FINISHER's height and not the crate's own ground, so a dummy
   * broken on a rise drops its crate from higher up.
   */
  send(id: number, fromY: number): void
  /** One frame of every descent. */
  update(delta: number): void
  /** How many are still in the air. */
  falling(): number
  /** Every descent, for a renderer to lift its art to. */
  live(): readonly Descent[]
  /**
   * Where the first one still coming down is, for the camera to sit on — null
   * when the sky is empty.
   */
  watching(): Point | null
  /**
   * Cut every canopy that is still up.
   *
   * Play's, and marked as such: a pig cuts its own with the jump key
   * (`parachute.ts`, `cutChute`) and the crate uses the same descent, so the
   * same key ends it. The exe has not been read on whether it lets you.
   */
  cut(): void
  clear(): void
}

export function createAirDrops(world: AirDropWorld, emit: Emit): AirDrops {
  const live: Descent[] = []

  return {
    send(id, fromY) {
      const ground = world.groundOf(id)
      if (ground === null) return
      live.push({
        id,
        drop: { y: fromY - DROP_HEIGHT, vy: 0, chute: true, landed: false },
        ground,
        chuteIn: CHUTE_DELAY
      })
      emit({ kind: 'crateSent', id })
    },
    update(delta) {
      for (let i = live.length - 1; i >= 0; i--) {
        const one = live[i]
        if (one.chuteIn > 0) {
          one.chuteIn -= delta
          if (one.chuteIn <= 0) emit({ kind: 'crateChuted', id: one.id })
        }
        updateDrop(one.drop, one.ground, delta)
        if (!one.drop.landed) continue
        live.splice(i, 1)
        const at = world.at(one.id)
        emit({ kind: 'crateLanded', id: one.id, at: { x: at?.x ?? 0, y: one.ground, z: at?.z ?? 0 } })
      }
    },
    falling: () => live.length,
    live: () => live,
    watching() {
      const first = live[0]
      if (!first) return null
      const at = world.at(first.id)
      if (!at) return null
      return { x: at.x, y: first.drop.y, z: at.z }
    },
    cut() {
      for (const one of live) {
        if (!one.drop.chute) continue
        cutChute(one.drop)
      }
    },
    clear() {
      live.length = 0
    }
  }
}
