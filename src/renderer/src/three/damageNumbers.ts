// The number that floats off something that has just been hurt.
//
// It is the original's, and it is a real object in it: `Pig::TakeDamage`
// (0x467b5b) and the dummy's (0x48da5c) both call **0x487b90** with the body's
// position and the damage — and they pass it `amount >> 7`, which is the whole
// reason health is worth counting in POINTS (lib/game/health.ts). That
// function spawns effect **0x35** with a life of 0x3e8 and hangs the value on
// it at `+0xd4`, with a style index at `+0xd8` picked out of a 16-byte record
// per team at 0x4cf1e4. `../../../pigs-disasm/damage/notes.md`.
//
// What is NOT decoded is how it MOVES — the effect's own update was not read.
// So the rise and the fade below are the remake's own, and only the value,
// the position it starts at and the fact that there is one at all come from
// the exe.
//
// Positions are game space (Y-down) going in and screen pixels coming out;
// the projection is the same one the name plates use (three/squad.ts).

import * as THREE from 'three'

/** How long one stays up. The exe's field is 0x3e8 and its unit is not
 * established — the turn clock counts hundredths, which would make it ten
 * seconds and far too long to read as a hit, so this takes it as
 * milliseconds until something says otherwise. */
export const NUMBER_SECONDS = 1

/** How far it drifts up over that time, in world units — a pig is 320 tall,
 * so this is about half a body. The remake's own. */
const RISE = 160

export interface FloatingNumber {
  /** Screen position, CSS pixels. */
  x: number
  y: number
  /** The damage, in points — what the exe puts on the effect. */
  value: number
  /** 0 at the moment of the hit, 1 as it goes out. */
  age: number
}

export interface DamageNumbers {
  /** Something took `value` points at this spot (game space, Y-down). */
  show(at: { x: number; y: number; z: number }, value: number): void
  /** Age them; call once a frame. */
  update(delta: number): void
  /** Where each one is on a view this big, oldest first. */
  project(camera: THREE.Camera, root: THREE.Object3D, width: number, height: number): FloatingNumber[]
  /** How many are still floating — "the last damage" as something the beat
   * after a blow can wait on (lib/game/aftermath.ts). */
  live(): number
  /** Drop the lot — a new battle. */
  clear(): void
}

export function createDamageNumbers(): DamageNumbers {
  let live: { x: number; y: number; z: number; value: number; age: number }[] = []
  const at = new THREE.Vector3()

  return {
    show(where, value) {
      if (value <= 0) return
      live.push({ x: where.x, y: where.y, z: where.z, value, age: 0 })
    },
    update(delta) {
      for (const one of live) one.age += delta / NUMBER_SECONDS
      live = live.filter((one) => one.age < 1)
    },
    project(camera, root, width, height) {
      const out: FloatingNumber[] = []
      for (const one of live) {
        // Game space is Y-DOWN, so rising means a SMALLER y — and the whole
        // point goes through the battle's own converted root, exactly as a
        // name plate does.
        at.set(one.x, one.y - RISE * one.age, one.z)
        root.localToWorld(at)
        at.project(camera)
        if (at.z > 1) continue // behind the camera
        out.push({
          x: (at.x * 0.5 + 0.5) * width,
          y: (-at.y * 0.5 + 0.5) * height,
          value: one.value,
          age: one.age
        })
      }
      return out
    },
    live: () => live.length,
    clear() {
      live = []
    }
  }
}
