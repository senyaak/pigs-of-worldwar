// Bullets, DRAWN.
//
// Where they are and what they hit is the engine's (`lib/game/bullets.ts`);
// this file owns a pool of spheres and nothing else. It used to own the flight
// too, which meant a shot could not be resolved anywhere a scene graph was not.
//
// The bullet has a real body: `0x4a8ed5` is the only place a projectile's size
// is decided and it reads the KIND — 35 model units for every gun but the
// pistol's 100 — so this is a sized sphere rather than a streak. The colour is
// the remake's: the factory takes it out of the palette at 0x4de9d0 and that
// has not been read.
//
// Game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import { bulletSize, projectileOf } from '../../../lib/game/projectile'
import type { FlightShot } from '../../../lib/game/snapshot'
import { MODEL_SCALE } from '../../../lib/game/scale'
import type { Point } from '../../../lib/game/pose'
import { createLobTrails } from './lobTrail'

export interface BulletArt {
  /**
   * Show exactly these, and hide whatever the last frame left over.
   *
   * `where` says where to put one: the engine steps in quanta and the screen
   * does not, so what is drawn is the point between the last two steps
   * (three/tween.ts). The shot's own x/y/z is where the RULES have it.
   */
  draw(live: readonly FlightShot[], delta: number, where: (shot: FlightShot) => Point): void
  /** How many puffs its trails have up (lib/game/trail.ts) — a spec cannot see a
   * transparent quad. */
  trail(): number
  dispose(): void
}

const BULLET_GEOMETRY = new THREE.SphereGeometry(1, 8, 6)

export function createBulletArt(root: THREE.Object3D): BulletArt {
  const meshes: THREE.Mesh[] = []
  const material = new THREE.MeshBasicMaterial({ color: 0xfff0b0, fog: false })
  /**
   * **A BULLET SMOKES TOO.** Play: "у пули тоже нет шлейфа — как было с гранатой
   * давно." The same pool the grenade's trail uses (three/lobTrail.ts), because it
   * is the same thing: the engine hangs a parented effect off a projectile in its
   * CONSTRUCTOR (lib/game/trail.ts), and nothing in that constructor cares whether
   * the projectile is thrown or fired.
   */
  const trails = createLobTrails(root)

  const meshAt = (i: number): THREE.Mesh => {
    while (meshes.length <= i) {
      const mesh = new THREE.Mesh(BULLET_GEOMETRY, material)
      mesh.renderOrder = 1
      root.add(mesh)
      meshes.push(mesh)
    }
    return meshes[i]
  }

  return {
    draw(live, delta, where) {
      // The trail follows what is still flying, at the point being DRAWN rather
      // than the stepping one; anything gone fades on its own.
      for (const shot of live) trails.follow(shot.id, where(shot))
      trails.update(delta)
      let i = 0
      for (const shot of live) {
        const mesh = meshAt(i++)
        const kind = projectileOf(shot.skill)
        const at = where(shot)
        mesh.visible = true
        mesh.position.set(at.x, at.y, at.z)
        mesh.scale.setScalar((kind ? bulletSize(kind) : 35) * MODEL_SCALE)
      }
      for (let rest = i; rest < meshes.length; rest++) meshes[rest].visible = false
    },
    trail: () => trails.live(),
    dispose() {
      trails.dispose()
      for (const mesh of meshes) root.remove(mesh)
      meshes.length = 0
      material.dispose()
    }
  }
}
