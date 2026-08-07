// Bullets on the map.
//
// The rules are pure and next door (`lib/game/projectile.ts`); what this file
// adds is the one thing the domain cannot know — WHERE the muzzle is. The exe
// builds it off the pose matrix of **bone 5**, the hand, and the weapon's own
// row of the table at 0x4d0ee0 (0x47a115) — the same bone and the same table
// the bayonet's blade comes out of, so a barrel and a blade hang off one
// place. `../../../pigs-disasm/weapons/fire.md`.
//
// Everything here is game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import {
  SHOT_DAMAGE,
  advanceShot,
  fireShot,
  projectileOf,
  spentShot
} from '../../../lib/game/projectile'
import type { Shot } from '../../../lib/game/projectile'
import { PIG_RADIUS } from '../../../lib/game/obstacles'
import { hurt, isDead } from '../../../lib/game/health'
import { ANIM } from '../../../lib/game/locomotion'
import type { Target } from '../../../lib/game/targets'
import type { DamageNumbers } from './damageNumbers'
import type { Soldier, Squad } from './squad'
import { BATTLE_SOUNDS } from '../audio/battle'
import type { Bank } from '../audio/bank'

/** The bone a barrel hangs off — the hand, as everything else does. */
const HAND = 5

/**
 * Where the muzzle sits, per weapon: the row of 0x4d0ee0 the shot's own byte
 * map (0x47cf68) picks. Model units and bone-local, exactly like the melee's
 * reach and for the same reason (`lib/game/melee.ts` argues it).
 */
const MUZZLE: Record<number, { x: number; y: number; z: number }> = {
  6: { x: 44, y: 32, z: 230 },
  7: { x: 44, y: 36, z: 350 },
  8: { x: 44, y: 36, z: 350 },
  9: { x: 64, y: 46, z: 356 },
  10: { x: 44, y: 24, z: 650 },
  11: { x: 32, y: 68, z: 450 },
  12: { x: 28, y: 36, z: 376 },
  13: { x: 28, y: 36, z: 376 },
  14: { x: 82, y: 24, z: 470 },
  15: { x: 146, y: -28, z: 256 },
  17: { x: 44, y: 36, z: 350 },
  18: { x: 44, y: 36, z: 350 }
}

/** Which noise a barrel makes. Only two of the indices are decoded, and they
 * are the two that matter here (audio/battle.ts); the rest borrow the rifle's
 * and say so. */
const BARREL_SOUND: Record<number, 'pistol' | 'rifle'> = { 6: 'pistol' }

/** How near a bullet has to pass. A pig is 320 tall and 320 across, and the
 * exe gives every gun's projectile a collision box of ZERO in its table — so
 * this is the BODY's size, not the bullet's, and it is the remake's reading of
 * a hit rather than a decoded one. */
const HIT_RADIUS = PIG_RADIUS
const HIT_RISE = 320

export interface Shots {
  /** Loose one from this pig, pointed at `aim` — the angle in the engine's
   * 4096-to-the-turn units, which only the acting pig has (lib/game/aim.ts).
   * False if what it holds is not a gun. */
  fire(soldier: Soldier, aim: number): boolean
  /** One frame of every bullet in the air. */
  update(delta: number): void
  /** How many are still flying — a tracer is a line a spec cannot see. */
  live(): number
  clear(): void
  dispose(): void
}

export interface ShotParts {
  squad: Squad
  root: THREE.Object3D
  bank: () => Bank
  training: boolean
  targets: Target[]
  /** Whether the map SCRIPT has placed this dummy yet (lib/game/script.ts). */
  present: (id: number) => boolean
  onBroken: (target: Target) => void
  numbers: DamageNumbers
}

/** One bullet's tracer: a short bright line along its own travel. */
interface Tracer {
  line: THREE.Line
  geometry: THREE.BufferGeometry
}

export function createShots(parts: ShotParts): Shots {
  const live: Shot[] = []
  const tracers: Tracer[] = []
  const material = new THREE.LineBasicMaterial({
    color: 0xfff0b0,
    transparent: true,
    opacity: 0.9,
    depthWrite: false
  })
  const at = new THREE.Vector3()
  /** Dummies not yet knocked down, the same list a swing keeps. */
  const standing: Target[] = [...parts.targets]

  const tracerAt = (i: number): Tracer => {
    while (tracers.length <= i) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
      const line = new THREE.Line(geometry, material)
      parts.root.add(line)
      tracers.push({ line, geometry })
    }
    return tracers[i]
  }

  /** Whether this bullet is inside that body. */
  const inside = (shot: Shot, body: { x: number; y: number; z: number }): boolean =>
    Math.abs(shot.x - body.x) < HIT_RADIUS &&
    Math.abs(shot.z - body.z) < HIT_RADIUS &&
    Math.abs(shot.y - body.y) < HIT_RISE

  /** Resolve one bullet where it now is. True if it is spent. */
  const land = (shot: Shot): boolean => {
    for (const soldier of parts.squad.members) {
      if (isDead(soldier.pig)) continue
      const body = {
        x: soldier.pig.position.x,
        y: soldier.node.position.y,
        z: soldier.pig.position.z
      }
      if (!inside(shot, body)) continue
      const outcome = hurt(soldier.pig, SHOT_DAMAGE, parts.training)
      parts.numbers.show(body, SHOT_DAMAGE)
      if (outcome === 'died' || outcome === 'gibbed') soldier.playOnce(ANIM.DYING)
      return true
    }
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!parts.present(dummy.id)) continue
      if (!inside(shot, dummy)) continue
      hurt(dummy, SHOT_DAMAGE, false)
      parts.numbers.show(dummy, SHOT_DAMAGE)
      if (isDead(dummy)) {
        standing.splice(i, 1)
        parts.onBroken(dummy)
      }
      return true
    }
    return false
  }

  const redraw = (): void => {
    let i = 0
    for (const shot of live) {
      const tracer = tracerAt(i++)
      tracer.line.visible = true
      // A tracer is one frame of travel drawn as a streak — the remake's own;
      // what the original DRAWS a bullet as has not been read.
      const array = tracer.geometry.getAttribute('position').array as Float32Array
      array[0] = shot.x
      array[1] = shot.y
      array[2] = shot.z
      array[3] = shot.x - shot.vx * 0.02
      array[4] = shot.y - shot.vy * 0.02
      array[5] = shot.z - shot.vz * 0.02
      tracer.geometry.getAttribute('position').needsUpdate = true
      tracer.geometry.computeBoundingSphere()
    }
    for (let rest = i; rest < tracers.length; rest++) tracers[rest].line.visible = false
  }

  return {
    fire(soldier, aim) {
      const skill = soldier.pig.holding
      if (skill === null || !projectileOf(skill)) return false
      const offset = MUZZLE[skill] ?? { x: 0, y: 0, z: 0 }
      const bone = soldier.mesh.bones[HAND] ?? soldier.mesh.bones[0]
      // The mixer wrote this frame's rotations; three would not fold them into
      // the world matrices until it drew, and the shot leaves first.
      bone.updateMatrixWorld(true)
      at.set(offset.x, offset.y, offset.z)
      bone.localToWorld(at)
      parts.root.worldToLocal(at)
      const shot = fireShot(
        skill,
        { x: at.x, y: at.y, z: at.z },
        soldier.pig.heading,
        aim
      )
      if (!shot) return false
      live.push(shot)
      parts.bank().play(BATTLE_SOUNDS[BARREL_SOUND[skill] ?? 'rifle'])
      return true
    },
    update(delta) {
      for (let i = live.length - 1; i >= 0; i--) {
        const shot = live[i]
        // Substep so a slow frame cannot carry a bullet clean THROUGH a body:
        // a rifle covers 4500 units a second and a pig is 320 across.
        const speed = Math.hypot(shot.vx, shot.vy, shot.vz)
        const steps = Math.max(1, Math.ceil((speed * delta) / HIT_RADIUS))
        let done = false
        for (let step = 0; step < steps && !done; step++) {
          advanceShot(shot, delta / steps)
          done = land(shot) || spentShot(shot)
        }
        if (done) live.splice(i, 1)
      }
      redraw()
    },
    live: () => live.length,
    clear() {
      live.length = 0
      redraw()
    },
    dispose() {
      for (const tracer of tracers) {
        parts.root.remove(tracer.line)
        tracer.geometry.dispose()
      }
      tracers.length = 0
      live.length = 0
      material.dispose()
    }
  }
}
