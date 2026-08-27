// The POISON GAS canister's STREAM — skill 26, and what its clouds do to a
// pig they wash over.
//
// A gas grenade flies and rolls like any other (its row is in grenade.ts,
// `gas: true`), and everything special about it is here. The exe's projectile
// update has an every-5th-frame dispatcher (0x4365a2, byte map 0x436D08), and
// kind 28's arm (0x4366d6) spawns effect 0x5E at the canister's own position
// from **frame 15** of the flight on — so a full fuse lets go a couple of
// dozen little clouds, and a rolling canister DRAWS A LINE of them. The
// destructor spawns one last 0x5E and pops (I_BULIT1 at half volume,
// 0x432d83); there is **no 0x54 blast and no push** — the row's force is nil.
// A doused canister goes quiet entirely (`[proj+0x86]`, 0x437d3b): a gas
// grenade in the water is nothing at all, which lobs.ts already grants by
// never detonating a doused thing.
//
// The TOUCH is `Pig::OnHitObject`'s 0x5E arm (0x477b25): each cloud makes one
// phantom sweep — a sphere, **no line of sight, gas reaches round a corner**,
// and it wakes and pushes nobody. First service per THROW is fifteen points
// FLAT (the falloff 0x48cba0 is only the gate), the Sneeze clip, the squeal —
// and the poison bit. Every later cloud of the same throw only refreshes the
// bit: `[pig+0x3b1]` masks the service and is cleared per attack (0x46965e).
// The poison itself — ten a turn, for ever, cured by any heal — is
// lib/game/poison.ts.
//
// The read end to end is `weapons/gas.md` in the disasm repo (2026-08-27).
// Pigs only: whether a dummy answers a 0x5E is unread, and a dummy takes no
// turns to be poisoned on.
//
// Pure, game space (Y-down), like the rest of lib/game.

import { blastRange, blastShare, lobOf } from './grenade'
import type { Lobbed } from './grenade'
import { fromExeFrames } from './ballistics'
import { DAMAGE_UNIT } from './projectile'
import { hurt, isDead } from './health'
import { originY } from './body'
import type { Emit } from './events'
import type { Pig } from './game'

/** The frame of the flight the valve opens on (0x4365ba's compare). */
export const GAS_OPEN_FRAMES = 15
/** …and a cloud every 5th frame after it (the dispatcher's own stride). */
export const GAS_PUFF_FRAMES = 5

/** The Sneeze — clip 0x25, played on the pig the moment the gas takes it
 * (0x477bc4). The clip index is the exe's own, off the call site the way
 * every entry of ANIM is (lib/game/locomotion.ts). */
export const SNEEZE_CLIP = 37

export interface GasWorld {
  pigs: () => Pig[]
  training: boolean
  /** The bit the cloud leaves on a pig (lib/game/poison.ts). */
  poison: { afflict(pig: Pig): void }
}

export interface Gas {
  /**
   * One frame of a live canister — lobs.ts calls it for every flying or
   * rolling lob whose row says `gas`. Opens the valve at frame 15, lets a
   * cloud go every 5th frame after, each cloud sweeping once as it is born.
   */
  stream(shot: Lobbed): void
  /** The fuse ran out (or the hand detonated it): one last cloud and the pop
   * — INSTEAD of a blast, which is the exe's own shape. */
  pop(shot: Lobbed): void
  /** Water doused it mid-stream: the valve is forgotten, nothing more comes.
   * The pop never happens — lobs.ts never detonates a doused thing. */
  quench(shot: Lobbed): void
  /** Drop everything — a new battle. */
  clear(): void
}

export function createGas(world: GasWorld, emit: Emit): Gas {
  /** Per live canister: when the NEXT cloud is due, in seconds of `age`. */
  const valves = new Map<number, number>()
  /** Per throw: who has been SERVICED — paid the fifteen and sneezed. The
   * exe's `[pig+0x3b1]` mask, held per canister since a throw is one. */
  const serviced = new Map<number, Set<number>>()

  /** One cloud, born at the canister's own spot: the picture, then the sweep. */
  const puff = (shot: Lobbed): void => {
    const row = lobOf(shot.skill)
    if (!row) return
    const at = { x: shot.x, y: shot.y, z: shot.z }
    emit({ kind: 'gasPuffed', at })
    const paid = serviced.get(shot.id) ?? new Set<number>()
    serviced.set(shot.id, paid)
    const reach = blastRange(row)
    // Fifteen points FLAT — the row's damage over the health unit; the
    // falloff is only the gate, which is why there is no share in the amount.
    const points = row.damage / DAMAGE_UNIT
    for (const pig of world.pigs()) {
      // A body that is gone — inside a shelter, off the field — is not in the
      // cloud, whatever the distance says (the same skip the hands make,
      // lib/game/healing.ts).
      if (pig.gone || isDead(pig)) continue
      // …and a DISGUISED one is untouchable by gas ENTIRELY — read both ways
      // (2026-08-27): the hidden pig's body is inert (`[body+0x44] & 1`, the
      // sweep's first test at 0x406AEA skips it), and the decoy's own effect
      // arm EXCLUDES the status-gas ids 0x5C..0x61 (0x48EB18). A bush does
      // not breathe. `weapons/espionage.md` in the disasm repo.
      if (pig.hidden) continue
      const body = { x: pig.position.x, y: originY(pig.position.y, pig.body), z: pig.position.z }
      const away = Math.hypot(body.x - at.x, body.y - at.y, body.z - at.z)
      if (blastShare(away, reach) <= 0) continue
      // The bit goes on (or is refreshed) for EVERYONE the cloud reaches…
      world.poison.afflict(pig)
      // …and the fifteen is paid once per throw.
      if (paid.has(pig.id)) continue
      paid.add(pig.id)
      const outcome = hurt(pig, points, world.training)
      emit({ kind: 'damaged', at: body, amount: points, pig: pig.id })
      emit({ kind: 'gassed', pig: pig.id, at: body })
      // The Sneeze — over the hit, not instead of anything: a standing pig
      // sneezes and goes back to standing about.
      emit({ kind: 'clip', pig: pig.id, index: SNEEZE_CLIP, once: true })
      if (outcome === 'died' || outcome === 'gibbed')
        emit({ kind: 'killed', pig: pig.id, by: shot.owner, gibbed: outcome === 'gibbed' })
    }
  }

  return {
    stream(shot) {
      const open = fromExeFrames(GAS_OPEN_FRAMES)
      if (shot.age < open) return
      let due = valves.get(shot.id)
      if (due === undefined) {
        // The valve opens: the hiss starts here and runs as a poll, the way
        // the fuse's tick does (contracts/sound.ts).
        emit({ kind: 'gasStreaming', at: { x: shot.x, y: shot.y, z: shot.z } })
        due = open
      }
      while (shot.age >= due) {
        puff(shot)
        due += fromExeFrames(GAS_PUFF_FRAMES)
      }
      valves.set(shot.id, due)
    },
    pop(shot) {
      puff(shot)
      emit({ kind: 'gasPopped', at: { x: shot.x, y: shot.y, z: shot.z } })
      valves.delete(shot.id)
      serviced.delete(shot.id)
    },
    quench(shot) {
      valves.delete(shot.id)
      serviced.delete(shot.id)
    },
    clear() {
      valves.clear()
      serviced.clear()
    }
  }
}
