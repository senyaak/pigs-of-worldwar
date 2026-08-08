// Bullets on the map.
//
// The rules are pure and next door (`lib/game/projectile.ts`); what this file
// adds is the one thing the domain cannot know — WHERE the muzzle is. The exe
// builds it off the pose matrix of **bone 5**, the hand, and the weapon's own
// row of the table at 0x4d0ee0 (0x47a115) — the same bone and the same table
// the bayonet's blade comes out of, so a barrel and a blade hang off one
// place. `weapons/fire.md`.
//
// Everything here is game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import {
  damageOf,
  advanceShot,
  bulletSize,
  fireShot,
  projectileOf,
  spentShot
} from '../../../lib/game/projectile'
import { MODEL_SCALE } from '../../../lib/game/scale'
import type { Shot } from '../../../lib/game/projectile'
import { PIG_RADIUS } from '../../../lib/game/obstacles'
import { hurt, isDead } from '../../../lib/game/health'
import { ANIM } from '../../../lib/game/locomotion'
import type { Target } from '../../../lib/game/targets'
import type { Obstruction } from '../../../lib/game/obstacles'
import type { TerrainQuery } from '../../../lib/game/terrain'
import type { DamageNumbers } from './damageNumbers'
import type { Soldier, Squad } from './squad'
import { BATTLE_SOUNDS, playCue } from '../audio/battle'
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
  /** How many are still flying. */
  live(): number
  /** Where the newest one is, for the camera to ride — null when none is up. */
  head(): Shot | null
  clear(): void
  dispose(): void
}

export interface ShotParts {
  squad: Squad
  root: THREE.Object3D
  bank: () => Bank
  training: boolean
  /** The ground, so a bullet cannot fly through a hill. */
  query: TerrainQuery
  /** The map's boxes, so it cannot fly through a wall either. */
  obstacles: Obstruction
  targets: Target[]
  /** Whether the map SCRIPT has placed this dummy yet (lib/game/script.ts). */
  present: (id: number) => boolean
  onBroken: (target: Target) => void
  numbers: DamageNumbers
}

/**
 * The bullet's own body.
 *
 * One unit sphere, scaled per shot — the exe builds a real object for every
 * projectile and sizes it off the kind (`bulletSize`), so a bullet is a thing
 * in the world rather than a streak drawn after it. The colour is the remake's:
 * the factory takes it out of the palette at 0x4de9d0 and that has not been
 * read.
 */
const BULLET_GEOMETRY = new THREE.SphereGeometry(1, 8, 6)

export function createShots(parts: ShotParts): Shots {
  const live: Shot[] = []
  const bullets: THREE.Mesh[] = []
  const material = new THREE.MeshBasicMaterial({ color: 0xfff0b0, fog: false })
  const at = new THREE.Vector3()
  /** Dummies not yet knocked down — literally the same array a swing splices
   * from (three/swing.ts). Two lists meant a dummy shot dead was still on the
   * blade's list, so it could be killed twice and run its script twice. */
  const standing: Target[] = parts.targets

  const bulletAt = (i: number): THREE.Mesh => {
    while (bullets.length <= i) {
      const mesh = new THREE.Mesh(BULLET_GEOMETRY, material)
      mesh.renderOrder = 1
      parts.root.add(mesh)
      bullets.push(mesh)
    }
    return bullets[i]
  }

  /** Whether this bullet is inside that body. */
  const inside = (shot: Shot, body: { x: number; y: number; z: number }): boolean =>
    Math.abs(shot.x - body.x) < HIT_RADIUS &&
    Math.abs(shot.z - body.z) < HIT_RADIUS &&
    Math.abs(shot.y - body.y) < HIT_RISE

  /** Resolve one bullet where it now is. True if it is spent. */
  const land = (shot: Shot): boolean => {
    // The WORLD first. The exe's projectile update reads the terrain table
    // itself — four sites inside 0x436xxx, the same `[tile] & 0x1F` lookup
    // the walk uses — so a shot is stopped by the ground, and the map's own
    // boxes stop it the same way (lib/game/obstacles.ts).
    if (shot.y >= parts.query.height(shot.x, shot.z)) return true
    if (parts.obstacles.solid(shot.x, shot.y, shot.z)) return true
    for (const soldier of parts.squad.members) {
      if (isDead(soldier.pig)) continue
      const body = {
        x: soldier.pig.position.x,
        y: soldier.node.position.y,
        z: soldier.pig.position.z
      }
      if (!inside(shot, body)) continue
      const amount = damageOf(shot.skill)
      const outcome = hurt(soldier.pig, amount, parts.training)
      parts.numbers.show(body, amount)
      if (outcome === 'died' || outcome === 'gibbed') soldier.playOnce(ANIM.DYING)
      return true
    }
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!parts.present(dummy.id)) continue
      if (!inside(shot, dummy)) continue
      const amount = damageOf(shot.skill)
      hurt(dummy, amount, false)
      parts.numbers.show(dummy, amount)
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
      const mesh = bulletAt(i++)
      const kind = projectileOf(shot.skill)
      mesh.visible = true
      mesh.position.set(shot.x, shot.y, shot.z)
      const radius = (kind ? bulletSize(kind) : 35) * MODEL_SCALE
      mesh.scale.setScalar(radius)
    }
    for (let rest = i; rest < bullets.length; rest++) bullets[rest].visible = false
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
      playCue(parts.bank(), BATTLE_SOUNDS[BARREL_SOUND[skill] ?? 'rifle'])
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
    head: () => live[0] ?? null,
    clear() {
      live.length = 0
      redraw()
    },
    dispose() {
      for (const bullet of bullets) parts.root.remove(bullet)
      bullets.length = 0
      live.length = 0
      material.dispose()
    }
  }
}
