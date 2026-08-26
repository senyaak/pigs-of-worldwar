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
import { PLANT_PHASE, isLobbed, isPlanted } from './grenade'
import { isMine } from './mines'
import { weaponOf } from './weapons'
import { PHASE_UNITS } from './melee'
import { clipSeconds } from './clips'
import type { ClipTiming } from './clips'
import { layerFires, weaponLayer } from './controls'
import { SKILL } from './skills'
import { spend } from './inventory'
import { EXE_FRAME_SECONDS } from './ballistics'
import type { Pig } from './game'
import type { Bullets } from './bullets'
import type { Lobs } from './lobs'
import type { Strikes } from './strikes'
import type { Heals } from './healing'
import type { Sights } from './sights'
import type { Anim } from './anim'

/** What answering the button came to. */
export type Answered =
  /** Nothing, or something that carries on inside this state. */
  | 'none'
  /** SKIP TURN was used, and the caller has to end the turn. */
  | 'skip'
  /**
   * A WEAPON was used — the blade began its swing, the gun's fuse was lit, the
   * gauge started filling. Which is what SPENDS the turn (lib/game/spend.ts), so
   * it has to be told apart from a press that came to nothing: a second press
   * inside a shot is refused, and a press that only sets off a grenade already
   * lying about is not a fresh use of anything.
   */
  | 'used'

export interface AttackParts {
  shots: Bullets
  grenades: Lobs
  swings: Strikes
  /** The healing hands — the one skill the press answers on the spot
   * (lib/game/healing.ts). */
  heals: Heals
  /** Where a LAID mine goes — the sapper's plant, called at the lay clip's
   * own key-frame the way a charge's is (lib/game/mines.ts). */
  mines: { lay(pig: Pig, skill: number): boolean }
  /** Firing drops the sights, and the aim it leaves is what the shot takes. */
  sights: Sights
  anim: Anim
  /** How long every clip runs: a planted charge appears at a PHASE of its own
   * laying clip, which is a fraction of that clip's length
   * (lib/game/grenade.ts `PLANT_PHASE`). */
  clips: ClipTiming[]
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
  /**
   * Whether the acting pig is still SAYING its firing line — the shot waits for
   * it (play's rule, lib/game/shot.ts). Polled once a frame from wherever the
   * voice actually is, which is the presentation layer.
   */
  setSpeaking(saying: boolean): void
  /** A new turn, or a warp: a charge belongs to the pig that started it. */
  reset(): void
}

export function createAttack(parts: AttackParts): Attack {
  const { shots, grenades, swings, sights, anim } = parts
  /** Whether the fire key went down since the last frame. */
  let requested = false
  /** Whether the pig is still saying its line, as of this frame. */
  let speaking = false
  /** The fire button, last frame — both edges are wanted. */
  let held = false
  /** The power gauge, while one is filling (lib/game/gauge.ts). */
  let gauge: Gauge | null = null
  /** What it read when the button came up — the fuse carries it to the throw,
   * the way `Pig::Fire` parks it at `[pig+0x300]` (0x469371). */
  let thrownWith = 0
  /** The ten-frame fuse and then the flight. */
  let firing: Firing | null = null
  /**
   * A charge being LAID: seconds until the clip's own frame puts it down, and
   * seconds until the clip is spent (lib/game/grenade.ts `PLANT_PHASE`).
   *
   * Two numbers and not one, because they answer different questions. Play:
   * "не дожидается окончания анимации и можно идти в ней в последнюю секунду" —
   * the charge appears a third of the way in, and the pig is HELD until the
   * animation is over.
   */
  let laying: { untilDown: number; untilDone: number } | null = null

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
      // exe's fire handler has been read for it. THROWN ones only: a charge lying
      // where the pig planted it is not something a second press blows up, or
      // "plant it and run" would be one button away from suicide.
      if (grenades.thrown() > 0) {
        grenades.detonateNow()
        return 'none'
      }
      // …asked of the PIG rather than of the cached `holding`, which is only
      // synced further down the frame and is therefore a frame stale here.
      if (acting.holding === SKILL.SKIP_TURN) return 'skip'
      // HEALING HANDS answers the press ITSELF: no fuse, no gauge, no flight —
      // the exe's arm reads the pig list and puts the points back on the spot
      // (lib/game/healing.ts). Refused — nobody in the cone, or a body already
      // at its ceiling — the press comes to nothing and the charge stays.
      if (acting.holding === SKILL.HEALING_HANDS) {
        return parts.heals.begin(acting) ? 'used' : 'none'
      }
      // A MINE takes the lobbed family's door: it is `isPlanted` like TNT,
      // has no gauge (record +0x14 is 0), and its charge goes down at the
      // same clip phase — only what the key-frame DROPS differs
      // (lib/game/mines.ts).
      if (isLobbed(holding) || isMine(holding)) {
        if (gauge || firing || laying !== null) return 'none'
        // **A GAUGE IS THE WEAPON'S, not the throw's.** The record's +0x14 is
        // what says whether one fills (`weapons/fire.md`, and it is 1 on the
        // grenades and 0 on TNT), and the split at 0x493796 goes by that byte:
        // no gauge means the press writes a charge of ONE and fires now. Which
        // for a planted charge is the whole point — `speed * charge >> 12` is
        // nothing, so it goes down at the pig's feet (lib/game/grenade.ts).
        if (!weaponOf(holding).power) {
          thrownWith = 1
          arm()
          return 'used'
        }
        // The press starts it CHARGING and the throw comes on the release, or on
        // its own if it tops out first (0x493b39, lib/game/gauge.ts).
        gauge = beginGauge()
        return 'used'
      }
      if (isGun(holding)) {
        // A gun is a SEQUENCE, and a press while one is running is refused —
        // `Pig::MayAct` is false from `Pig::Fire` until `Pig::Attack`. That
        // refusal is the whole of why a rifle is not a machine gun.
        if (firing) return 'none'
        arm()
        return 'used'
      }
      // A blade, and it is the one that can refuse on its own account: a swing
      // already running, or nothing in hand that swings.
      return swings.begin(acting) ? 'used' : 'none'
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
      // A CHARGE BEING LAID: the clip is running and the thing is owed. Play:
      // "ТНТ ставится на землю — с анимацией", and the animation is not a
      // decoration over it — the clip's own key-frame event is what puts it down
      // (`PLANT_PHASE`, lib/game/grenade.ts).
      if (laying !== null) {
        const was = laying.untilDown
        laying.untilDown -= delta
        laying.untilDone -= delta
        if (
          was > 0 &&
          laying.untilDown <= 0 &&
          (isMine(holding)
            ? parts.mines.lay(acting, holding ?? 35)
            : grenades.plant(acting))
        ) {
          // **AND THE HANDS ARE EMPTY.** Play: "когда поставил тнт — руки после
          // пустые — а ты ещё держишь тнт." A charge is not a weapon you keep: it
          // left the trotters and it is on the ground. The round goes with it, the
          // way `Pig::Attack` spends one as the clip runs (0x46975e) — and the
          // holster is the same one the last bayonet gets, `ReadyWeapon(0)` when
          // the rounds are out (0x46e3ee); play's rule is that a planted charge
          // does it whether the slot ran down or not, which on the training ground
          // is the only way it ever could.
          spend(acting.carrying, holding ?? -1)
          acting.holding = null
        }
        // …and the pig is its own again only when the clip has run out.
        if (laying.untilDone <= 0) laying = null
      }
      // Ten frames between the press and the bullet, and the frame the fuse
      // runs out is the frame it leaves — unless the pig is still saying its
      // line, which holds the trigger down until it has finished (play's rule,
      // lib/game/shot.ts).
      if (firing && advanceFiring(firing, delta, speaking)) {
        const firearm = weaponOf(holding)
        // A PLANTED charge is the one thing the fuse does not loose. `Pig::Attack`
        // starts the clip either way (0x46971a); what a gun does at that moment,
        // a charge waits for its clip's own event to do.
        if (isPlanted(holding)) {
          const whole = clipSeconds(parts.clips[firearm.attackClip])
          laying = { untilDown: (whole * PLANT_PHASE) / PHASE_UNITS, untilDone: whole }
          anim.playOnce(acting, firearm.attackClip)
          // Nothing was loosed, so the sequence has nothing left to watch: the
          // charge itself is what holds the pig now.
          firing = null
        } else {
          // Where the sights were actually pointing — the drift is part of the
          // aim, not a decoration over it.
          const away = isLobbed(holding)
            ? grenades.throwOne(acting, sights.angle(), thrownWith)
            : shots.fire(acting, sights.angle())
          if (!away) firing = null
          else {
            // **THE ROUND IS SPENT AS IT LEAVES THE HAND** — play, 2026-08-25:
            // "оружия не отнимаются когда стреляешь — 3 было гранаты, 3 и
            // осталось." The swing has always spent one (lib/game/strikes.ts)
            // and so has the planted charge above; the loosed branch — every
            // gun and every lob — never did, so a pig threw its three grenades
            // and kept three. The exe spends where the clip goes on
            // (`Pig::Attack`, 0x46975e), which is this moment, and only what
            // actually LEFT the trotters is charged: `away` false is a refusal,
            // not a shot.
            //
            // `holding` is the skill the whole branch above already fired with
            // — the same one `weaponOf` and the clip took — so the round comes
            // off the slot the shot really came out of. Unlimited slots never
            // run down (lib/game/inventory.ts).
            //
            // NO HOLSTER HERE, unlike the melee's: every skill that reaches
            // this branch ends the turn (lib/game/spend.ts — the exceptions are
            // the planted family and the tools), so `endTurnBeat` puts the
            // weapon away a beat later. Emptying the hand at this instant would
            // take the DETONATOR's fire key with it while the grenade is still
            // in the air.
            spend(acting.carrying, holding ?? -1)
            // `Pig::Attack` puts the weapon's own attack clip on at the same
            // moment (0x46971a), the way a swing's does.
            if (firearm.attackClip >= 0) anim.playOnce(acting, firearm.attackClip)
          }
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
    // …and a charge being laid holds the pig for the whole of its clip: the exe's
    // own `[pig+0x2FF]` is up from `Pig::Attack` until the animation is spent.
    busy: () => gauge !== null || firing !== null || laying !== null,
    setSpeaking(saying) {
      speaking = saying
    },
    reset() {
      requested = false
      gauge = null
      thrownWith = 0
      firing = null
      laying = null
      speaking = false
    }
  }
}
