// Grenades on the map.
//
// The rules are pure and next door (`lib/game/grenade.ts`); what this file
// adds is the two things the domain cannot know — where the HAND is, and
// where the ground is. A grenade leaves bone 5 like a bullet and a blade do,
// and then it is on its own parabola until the terrain or a box stops it.
//
// The BLAST is the part with the least binary behind it and it says so at
// every constant it uses. Decoded: the arc, the fuse (150 engine frames off
// the row, plus three of arming and a jitter of up to seven) and the ±0x400
// box the projectile marks pigs in. Invented: how much it takes off, and the
// falloff across that box.
//
// Everything here is game space (Y-down), under the battle's converted root.

import * as THREE from 'three'
import {
  BLAST_CORE,
  advanceLob,
  blastRange,
  blastShare,
  bounceLob,
  douseInWater,
  sunkAway,
  lob,
  skipOffWater,
  skipsOnWater,
  lobBounce,
  lobOf,
  sinkLob
} from '../../../lib/game/grenade'
import type { Lobbed } from '../../../lib/game/grenade'
import { DAMAGE_UNIT } from '../../../lib/game/projectile'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { aimRadians } from '../../../lib/game/aim'
import { weaponModelName } from '../../../lib/game/weapons'
import { createLobArt } from './lobArt'
import { createLobTrails } from './lobTrail'
import { hurt, isDead } from '../../../lib/game/health'
import { ANIM } from '../../../lib/game/locomotion'
import type { Target } from '../../../lib/game/targets'
import type { Obstruction } from '../../../lib/game/obstacles'
import type { TerrainQuery } from '../../../lib/game/terrain'
import type { DamageNumbers } from './damageNumbers'
import type { Effects } from './effects'
import type { Soldier, Squad } from './squad'
import { BATTLE_SOUNDS, playCue } from '../audio/battle'
import type { Bank } from '../audio/bank'

/** The bone a thrown thing leaves, as everything else does. */
const HAND = 5

/**
 * How far a grenade may move between collision tests, in game units — its own
 * drawn size, so it cannot step over a surface it is smaller than. 35 is what
 * the body factory gives a projectile (`bulletSize`, lib/game/projectile.ts).
 */
const STEP_BY = 35

/**
 * How far the MESH is lifted off the point that bounces.
 *
 * The point is the projectile's centre and the model hangs around it, so a
 * grenade resting exactly on the ground is half buried — and on a slope its
 * downhill half is under the surface, which is what play saw ("проваливается
 * под текстуры где наклон"). Lifting by the body's own radius puts it ON the
 * ground instead of in it. In MODEL units, like the mesh's scale.
 */
const MESH_LIFT = STEP_BY

/**
 * Where it leaves the hand.
 *
 * The shot's own byte map (0x47cf68) picks a row of 0x4d0ee0 per weapon and
 * the grenade family's rows have NOT been pulled out of it — that table is
 * read for weapons 6..0x26 and the grenades are 19..27, so they are in range
 * and simply not transcribed yet. The bone itself stands in meanwhile, which
 * puts the throw at the trotter rather than a hand's length in front of it.
 */
const THROW_FROM = { x: 0, y: 0, z: 0 }

export interface Grenades {
  /** Throw one from this pig at `aim`, with the gauge's `charge` behind it.
   * False if what it holds is not lobbed. */
  throwOne(soldier: Soldier, aim: number, charge: number, yaw?: number): boolean
  /** One frame of every grenade in the air or rolling. */
  update(delta: number): void
  /**
   * Set off everything that is live, now.
   *
   * Play's: "при повторном нажатии f граната должна взрываться." Nothing in
   * the exe has been read for it — the fire handler's own branch on a live
   * projectile has not been found — so the trigger is the remake's while the
   * blast it runs is the same one the fuse runs.
   */
  detonateNow(): void
  /** How many are live. */
  live(): number
  /** How many puffs its smoke trail has up (lib/game/trail.ts). */
  trail(): number
  /** Where each one is and how long it has left — what a spec measures a
   * miss with, since a grenade that lands short looks exactly like a blast
   * that does not reach. */
  at(): { x: number; y: number; z: number; fuse: number }[]
  /** Where the newest one is, for the camera to ride — null when none is up. */
  head(): Lobbed | null
  clear(): void
  dispose(): void
}

export interface GrenadeParts {
  squad: Squad
  root: THREE.Object3D
  training: boolean
  query: TerrainQuery
  obstacles: Obstruction
  targets: Target[]
  /** Whether the map SCRIPT has placed this dummy yet (lib/game/script.ts). */
  present: (id: number) => boolean
  onBroken: (target: Target) => void
  /** Where it went off. The camera comes off the grenade the instant it is
   * gone, so without this the puffs happen behind the player — which is why
   * play kept reporting that there was no explosion at all. */
  onBlast: (at: { x: number; y: number; z: number }) => void
  numbers: DamageNumbers
  /** What the blast is drawn with — effect **0x54**, which the projectile's
   * destructor spawns for kind 24 with the row's +0x14 as its life and
   * +0x18/+0x1C as its two arguments (0x432e51 → 0x435364). It reads parameter
   * row **0**, which is now decoded whole: two clouds of seventy sprites and
   * three bursts of smoke (`lib/game/effects.ts`). The break burst no longer
   * stands in — it turned out to be one stage of the five. */
  effects: Effects
  /** Asked for rather than held, as everywhere else the bank is used. */
  bank: () => Bank
}

export function createGrenades(parts: GrenadeParts): Grenades {
  const live: Lobbed[] = []
  /** The mesh drawn for each live grenade, by its index — null while the model
   * is still loading, which is the one state that draws nothing at all. */
  const meshes: (THREE.Mesh | null)[] = []
  const art = createLobArt()
  /** The smoke behind each one. The engine hangs it off the projectile in the
   * CONSTRUCTOR — a parented effect of id 0x15 — so it is born with the grenade
   * and dies a few frames after it (lib/game/trail.ts). */
  const trails = createLobTrails(parts.root)
  const at = new THREE.Vector3()
  /** The same array a swing and a shot splice from — one list of dummies for
   * the whole battle, or a dummy dies twice (three/shots.ts says why). */
  const standing: Target[] = parts.targets

  /** The mesh for the i-th live grenade, made on demand out of the weapon's
   * own model. Null until that model has arrived. */
  const meshAt = (i: number, name: string | null): THREE.Mesh | null => {
    while (meshes.length <= i) meshes.push(null)
    if (meshes[i]) return meshes[i]
    if (!name) return null
    const mesh = art.take(name)
    if (!mesh) return null
    mesh.scale.setScalar(MODEL_SCALE)
    parts.root.add(mesh)
    meshes[i] = mesh
    return mesh
  }

  /** Take every mesh off the scene — the list is index-aligned with `live`, so
   * one going away shifts the rest. */
  const clearMeshes = (): void => {
    for (const mesh of meshes) if (mesh) art.release(mesh)
    meshes.length = 0
  }

  /** Everything within reach takes its share. */
  const detonate = (shot: Lobbed): void => {
    parts.effects.blast({ x: shot.x, y: shot.y, z: shot.z })
    playCue(parts.bank(), BATTLE_SOUNDS.blast)
    parts.onBlast({ x: shot.x, y: shot.y, z: shot.z })
    const row = lobOf(shot.skill)
    if (!row) return
    /** Points at the core, and the share a body this far out takes. */
    const reach = blastRange(row)
    const took = (dx: number, dy: number, dz: number): number =>
      Math.round((row.damage * blastShare(Math.hypot(dx, dy, dz), reach)) / DAMAGE_UNIT)
    for (const soldier of parts.squad.members) {
      if (isDead(soldier.pig)) continue
      const body = {
        x: soldier.pig.position.x,
        y: soldier.node.position.y,
        z: soldier.pig.position.z
      }
      const amount = took(body.x - shot.x, body.y - shot.y, body.z - shot.z)
      if (amount <= 0) continue
      const outcome = hurt(soldier.pig, amount, parts.training)
      parts.numbers.show(body, amount)
      if (outcome === 'died' || outcome === 'gibbed') soldier.playOnce(ANIM.DYING)
    }
    for (let i = standing.length - 1; i >= 0; i--) {
      const dummy = standing[i]
      if (!parts.present(dummy.id)) continue
      const amount = took(dummy.x - shot.x, dummy.y - shot.y, dummy.z - shot.z)
      if (amount <= 0) continue
      hurt(dummy, amount, false)
      parts.numbers.show(dummy, amount)
      if (isDead(dummy)) {
        standing.splice(i, 1)
        parts.onBroken(dummy)
      }
    }
  }

  /** Put it back on whatever it went into. False when it met nothing. */
  const settle = (shot: Lobbed, wasY: number, step: number): boolean => {
    const ground = parts.query.height(shot.x, shot.z)
    // Its own row's physics material — the surface multiplies its half in.
    const row = lobOf(shot.skill)
    if (!row) return false
    // WATER FIRST, and it is ONE contact — the surface and the bed are the same
    // plane. `Projectile::OnHitLandscape` (0x4377d0) is the whole of it: over a
    // water-flagged tile it puts a splash at the water height and plays sound
    // 0x28 at 100/100, and then the arm splits on the contact scalar — under 150
    // it douses (0x437bfb), over it the thing is kicked up and skips (0x437e5d).
    // Both were once written up here as if the crossing were a separate event; it
    // is not, and it does not have to be: the shipped maps' water is 0 to 48
    // units deep (`WATER_SINK_SPEED` has the measurement), so where the water is
    // and where the ground is are the same place.
    if (parts.query.isWater(shot.x, shot.z) && shot.y >= parts.query.surface(shot.x, shot.z)) {
      const level = parts.query.surface(shot.x, shot.z)
      // The splash and its noise happen either way — the handler does them before
      // it looks at the speed at all.
      playCue(parts.bank(), BATTLE_SOUNDS.splash)
      // FAST ALONG THE SURFACE: it SKIPS. The engine resolves the contact with
      // the tile's own material and then kicks the thing up by a fifth of the
      // in-plane speed (0x4A9260 at an angle of 0x400 — a quarter turn, straight
      // up), which is a stone off a pond, and the fifth is paid for out of the
      // travel so the hops run down. lib/game/grenade.ts has the read and says
      // which half of it is the remake's.
      if (skipsOnWater(shot)) {
        bounceLob(
          shot,
          level,
          { x: 0, y: -1, z: 0 },
          parts.query.tileType(shot.x, shot.z),
          false,
          lobBounce(row)
        )
        skipOffWater(shot)
        playCue(parts.bank(), BATTLE_SOUNDS.skim)
        parts.effects.splash({ x: shot.x, y: level, z: shot.z })
        return true
      }
      // …or it goes in and DOWN, and it does not go off. The quiet flag is the
      // engine's (0x437d34) — play remembered it before the binary said so,
      // "по-моему даже не взрываться" — and the couple of seconds of sinking are
      // the remake's, because there is nothing on these maps to sink through.
      douseInWater(shot)
      // The splash is drawn on the WATER LINE however deep it gets, because
      // effect 0x0E snaps its own y there (0x488c19).
      parts.effects.splash({ x: shot.x, y: level, z: shot.z })
      playCue(parts.bank(), BATTLE_SOUNDS.doused)
      return true
    }
    if (shot.y >= ground) {
      bounceLob(
        shot,
        ground,
        parts.query.normal(shot.x, shot.z),
        parts.query.tileType(shot.x, shot.z),
        !parts.query.walkable(shot.x, shot.z),
        lobBounce(row)
      )
      return true
    }
    // A box is a flat stop rather than a surface: the map's obstacles carry no
    // normal, so a grenade that goes into one is put back where it came from
    // and bounced off the vertical. Crude, and the same crudeness a bullet's
    // `solid` test has.
    if (parts.obstacles.solid(shot.x, shot.y, shot.z)) {
      bounceLob(shot, wasY, { x: 0, y: -1, z: 0 }, 0, true, lobBounce(row))
      return true
    }
    return false
  }

  const redraw = (): void => {
    // Index-aligned with `live`, and a splice shifts everything after it, so
    // the simplest correct thing is to rebuild rather than track identities:
    // there is never more than a handful in the air.
    if (meshes.length > live.length) clearMeshes()
    for (let i = 0; i < live.length; i++) {
      const shot = live[i]
      const mesh = meshAt(i, weaponModelName(shot.skill))
      if (!mesh) continue
      // Y-DOWN, so lifting is subtracting.
      mesh.position.set(shot.x, shot.y - MESH_LIFT * MODEL_SCALE, shot.z)
      // It POINTS along its flight, nose down as it falls. Nothing has been
      // read about a projectile's orientation — the constructor hands the
      // body a yaw and a pitch and the drawing half is not decoded — so this
      // is the remake's, and it is the same pair the launch was built from.
      mesh.rotation.y = Math.atan2(shot.vx, shot.vz) + Math.PI
      mesh.rotation.x = Math.atan2(shot.vy, Math.hypot(shot.vx, shot.vz))
      // Nothing special for a SINKING one: the water sheet is see-through, so it
      // is simply visible under it (three/terrain.ts, `WATER_ALPHA`). It was drawn
      // through the sheet with the depth test off while the sheet was opaque; play
      // asked for the sheet fixed instead — "так сделай просвечиваемой, в чём
      // проблема?" — and with that done the stand-in is gone.
    }
  }

  return {
    throwOne(soldier, aim, charge, yaw = 0) {
      const skill = soldier.pig.holding
      if (skill === null || !lobOf(skill)) return false
      const bone = soldier.mesh.bones[HAND] ?? soldier.mesh.bones[0]
      // The mixer wrote this frame's rotations and three would not fold them
      // into the world matrices until it drew; the throw leaves first.
      bone.updateMatrixWorld(true)
      at.set(THROW_FROM.x, THROW_FROM.y, THROW_FROM.z)
      bone.localToWorld(at)
      parts.root.worldToLocal(at)
      const shot = lob(
        skill,
        { x: at.x, y: at.y, z: at.z },
        // The sights' tremor turns the throw as well as the picture, or the
        // crosshair is telling lies (lib/game/wobble.ts).
        soldier.pig.heading + aimRadians(yaw),
        aim,
        charge
      )
      if (!shot) return false
      live.push(shot)
      return true
    },
    update(delta) {
      for (let i = live.length - 1; i >= 0; i--) {
        const shot = live[i]
        // DOUSED: it is under the water and on its way down. Nothing steps it but
        // the sink — not the fuse, not the ground, not a bounce — and when its
        // couple of seconds are up it is simply gone. The engine's quiet flag is
        // the first thing the destructor tests and that branch spawns no effect
        // and plays no sound (0x4328c9), so there is no blast to hold back.
        if (shot.doused) {
          sinkLob(shot, delta)
          if (sunkAway(shot)) live.splice(i, 1)
          continue
        }
        // Substep by the grenade's OWN SIZE rather than by the blast: at full
        // charge it covers 4500 units a second, and a step of 512 walked it
        // clean through a slope — play saw it vanish under the ground where the
        // terrain tilts. 35 model units is what the body factory gives a
        // projectile (lib/game/projectile.ts, `bulletSize`).
        const speed = Math.hypot(shot.vx, shot.vy, shot.vz)
        const steps = Math.max(1, Math.ceil((speed * delta) / STEP_BY))
        let spent = false
        for (let step = 0; step < steps && !spent && !shot.doused; step++) {
          const wasY = shot.y
          spent = advanceLob(shot, delta / steps)
          settle(shot, wasY, delta / steps)
          // Whatever happened, it does not END below the ground. A bounce off
          // a slope reflects into the hill as often as out of it, and one
          // sub-step of that is enough to lose the thing.
          const floor = parts.query.height(shot.x, shot.z)
          if (!shot.doused && shot.y > floor) shot.y = floor
        }
        if (!spent) continue
        detonate(shot)
        live.splice(i, 1)
      }
      // The trail follows what is still up; anything gone stops laying and its
      // last six fade out on their own.
      for (const shot of live) trails.follow(shot, shot)
      trails.update(delta)
      redraw()
    },
    detonateNow() {
      // A DOUSED one is not set off by anything, ever: the engine's quiet flag is
      // the first thing the destructor tests and that branch has no blast in it
      // (0x4328c9). Play caught the hand-detonate going through it — "взрывать
      // руками когда граната тонет ещё можно" — and it goes on sinking instead.
      for (let i = live.length - 1; i >= 0; i--) {
        if (live[i].doused) continue
        detonate(live[i])
        live.splice(i, 1)
      }
      redraw()
    },
    /**
     * How many are LIVE — which a sinking one is not. It cannot be set off, it
     * cannot hurt anybody, and it must not hold the turn: this count is what says
     * the pig is committed, what keeps the shot sequence open, and what turns the
     * fire key into a detonator (three/battle.ts).
     */
    live: () => live.filter((one) => !one.doused).length,
    at: () => live.map((one) => ({ x: one.x, y: one.y, z: one.z, fuse: one.fuse })),
    head: () => live[0] ?? null,
    trail: () => trails.live(),
    clear() {
      trails.clear()
      live.length = 0
      clearMeshes()
    },
    dispose() {
      trails.dispose()
      live.length = 0
      clearMeshes()
      art.dispose()
    }
  }
}
