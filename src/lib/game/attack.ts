// The fire button, and everything one press sets going.
//
// One state again: whether the button went down, whether it is still down, the
// power gauge filling under it, what the gauge read when it came up, and the
// ten-frame fuse between the press and the thing leaving the hand. The battle's
// frame used to carry all five and the branching between them.
//
// WHICH weapon answers is `Pig::Fire`'s own switch (0x469415 against 0x46946d)
// and the arms are decoded in `weapons/fire.md`: a blade swings, a gun starts a
// sequence, a lobbed weapon charges instead of going off, and a live grenade
// answers the button before any of them.

import { beginGauge, chargeGauge, gaugeFraction } from './gauge'
import type { Gauge } from './gauge'
import { advanceFiring, beginFiring } from './shot'
import type { Firing } from './shot'
import { isGun } from './projectile'
import { isLobbed } from './grenade'
import { weaponOf } from './weapons'
import { layerFires, weaponLayer } from './controls'
import { SKILL } from './skills'
import { EXE_FRAME_SECONDS } from './ballistics'
import type { Pig } from './game'
import type { Bullets } from './bullets'
import type { Lobs } from './lobs'
import type { Strikes } from './strikes'
import type { Sights } from './sights'
import type { Anim } from './anim'

/** What answering the button came to. */
export type Answered =
  /** Nothing, or something that carries on inside this state. */
  | 'none'
  /** SKIP TURN was used, and the caller has to end the turn. */
  | 'skip'

export interface AttackParts {
  shots: Bullets
  grenades: Lobs
  swings: Strikes
  /** Firing drops the sights, and the aim it leaves is what the shot takes. */
  sights: Sights
  anim: Anim
  /** The pig says a line — the gun arm of `Pig::Fire` does it every shot. */
  bark: () => void
}

export interface Attack {
  /** The button went down this frame. */
  press(): void
  /** …and whether it is still down: the gauge wants the whole hold, and the
   * frame it ends. */
  hold(held: boolean): void
  /** Forget a press without acting on it. The opening drop and the beat after
   * a blow both swallow the button — nothing is answered while either runs. */
  swallow(): void
  /**
   * Answer the press, for the pig acting with `holding` in hand. Call once a
   * frame, before the walk.
   */
  begin(acting: Pig, holding: number | null): Answered
  /** Fill the gauge, run the fuse, and loose whatever it was. After the pig
   * has been placed: the muzzle comes off the HAND bone. */
  update(delta: number, acting: Pig, holding: number | null): void
  /** The shot in progress, or null. */
  firing(): Firing | null
  /**
   * Whether the sequence has just ENDED — nothing it threw is left in the air.
   * True on exactly the frame it does, which is when the camera comes back off
   * the bullet.
   */
  settled(): boolean
  /** Whether a gauge is filling — its own control set, not a hole in the
   * lock. */
  charging(): boolean
  /** How full it is, 0..1 — or **0 rather than null whenever the weapon in
   * hand has one at all**, because that is when the original shows the thing.
   * Null only when nothing in hand charges. */
  gauge(holding: number | null): number | null
  /** Whether the pig is committed on this state's account. */
  busy(): boolean
  /** A new turn, or a warp: a charge belongs to the pig that started it. */
  reset(): void
}

export function createAttack(parts: AttackParts): Attack {
  const { shots, grenades, swings, sights, anim } = parts
  /** Whether the fire key went down since the last frame. */
  let requested = false
  /** The fire button, last frame — both edges are wanted. */
  let held = false
  /** The power gauge, while one is filling (lib/game/gauge.ts). */
  let gauge: Gauge | null = null
  /** What it read when the button came up — the fuse carries it to the throw,
   * the way `Pig::Fire` parks it at `[pig+0x300]` (0x469371). */
  let thrownWith = 0
  /** The ten-frame fuse and then the flight. */
  let firing: Firing | null = null

  /** Both ways out of a gauge end in the SAME fuse a gun's press starts —
   * `Pig::Fire` writes `[pig+0x231] = 0x0A` whatever is in hand — so a release
   * does not throw, it arms. */
  const arm = (): void => {
    firing = beginFiring()
    // Out of the sights the moment the trigger goes, and they stay out until
    // the key is actually let go.
    sights.refuse()
    parts.bark()
  }

  return {
    press() {
      requested = true
    },
    hold(down) {
      held = down
    },
    swallow() {
      requested = false
    },
    begin(acting, holding) {
      // An EMPTY hand has nothing to fire, and that is the one layer that has
      // not: SKIP TURN has no weapon behind it and F still uses it.
      if (requested && !layerFires(weaponLayer(acting.holding))) requested = false
      if (!requested) return 'none'
      requested = false
      // A grenade already in the air answers the button before anything else
      // does: a second press sets it off where it lies. Play's — nothing in the
      // exe's fire handler has been read for it.
      if (grenades.live() > 0) {
        grenades.detonateNow()
        return 'none'
      }
      // …asked of the PIG rather than of the cached `holding`, which is only
      // synced further down the frame and is therefore a frame stale here.
      if (acting.holding === SKILL.SKIP_TURN) return 'skip'
      if (isLobbed(holding)) {
        // A weapon with a gauge does not go off on the press at all. The press
        // starts it CHARGING and the throw comes on the release, or on its own
        // if it tops out first (0x493796, lib/game/gauge.ts).
        if (!gauge && !firing) gauge = beginGauge()
      } else if (isGun(holding)) {
        // A gun is a SEQUENCE, and a press while one is running is refused —
        // `Pig::MayAct` is false from `Pig::Fire` until `Pig::Attack`. That
        // refusal is the whole of why a rifle is not a machine gun.
        if (!firing) arm()
      } else swings.begin(acting)
      return 'none'
    },
    update(delta, acting, holding) {
      if (gauge) {
        const topped = chargeGauge(gauge, delta / EXE_FRAME_SECONDS)
        if (topped || !held) {
          thrownWith = gauge.power
          gauge = null
          arm()
        }
      }
      // Ten frames between the press and the bullet, and the frame the fuse
      // runs out is the frame it leaves.
      if (firing && advanceFiring(firing, delta)) {
        // Where the sights were actually pointing — the drift is part of the
        // aim, not a decoration over it.
        const away = isLobbed(holding)
          ? grenades.throwOne(acting, sights.angle(), thrownWith)
          : shots.fire(acting, sights.angle())
        if (!away) firing = null
        else {
          // `Pig::Attack` puts the weapon's own attack clip on at the same
          // moment (0x46971a), the way a swing's does.
          const firearm = weaponOf(holding)
          if (firearm.attackClip >= 0) anim.playOnce(acting, firearm.attackClip)
        }
      }
    },
    firing: () => firing,
    settled() {
      if (firing?.phase !== 'flight') return false
      if (shots.live().length > 0 || grenades.live() > 0) return false
      firing = null
      return true
    },
    charging: () => gauge !== null && !gauge.spent,
    gauge(holding) {
      if (gauge) return gaugeFraction(gauge)
      return weaponOf(holding).power ? 0 : null
    },
    busy: () => gauge !== null || firing !== null,
    reset() {
      requested = false
      gauge = null
      thrownWith = 0
      firing = null
    }
  }
}
