// WHAT THE HANDS DO once the pig is placed — the blade, the heal, the tiptoe,
// the disguise, the last resort, the gauge and the fuse, the weapon coming out
// and the sights — all of it after the move, because it comes off the HAND bone.

import { clipSeconds } from '../clips'
import type { Pig } from '../game'
import { weaponOf } from '../weapons'
import type { Weapon } from '../weapons'
import type { BattleCore } from './core'
import { committed } from './waits'

/** The hands' frame; answers the weapon in hand. */
export const advanceHands = (
  core: BattleCore,
  acting: Pig,
  delta: number,
  turning: number,
  barrel: readonly [number, number] | null
): Weapon => {
  const { anim, swings, heals, pockets, hides, sacrifice, emit, sights, attack, state } = core
  // The swing, after the pig has been placed: the blade's own points come off
  // the HAND bone, so where the pig is standing has to be settled first. It
  // may put the weapon away on the way out — the last bayonet.
  swings.update(delta, acting)
  // …and the heal's clip running out, which may put the hands away the same
  // way (lib/game/healing.ts).
  heals.update(delta, acting)
  // …and the tiptoe's, whose end is where the steal lands
  // (lib/game/pickpocket.ts).
  pockets.update(delta, acting)
  // …and the disguise's, whose end is where the pig becomes the bush
  // (lib/game/hide.ts).
  hides.update(delta, acting)
  // …and the gesture that ends the pig (lib/game/suicide.ts). It takes no
  // actor: the pig it is spending is the one it was begun with, and by the
  // time this lands the turn may already have moved on.
  sacrifice.update(delta)

  // The gauge and the fuse, after the pig has been placed for the same reason
  // a swing is: the muzzle comes off the HAND bone (lib/game/attack.ts).
  attack.update(delta, acting, state.holding)
  // …and the sequence is over when there is nothing left in the air. The
  // camera comes back off the bullet by TELEPORTING behind the pig rather
  // than flying home from wherever it ended up.
  if (attack.settled()) emit({ kind: 'cameraReset' })

  // The weapon in hand, and where it points. Choosing one out of the menu is
  // what starts it: the exe plays the getting-it-out clip and only puts the
  // model in the hand once that has run (`Pig::ReadyWeapon` 0x469090).
  const weapon = weaponOf(acting.holding)
  if (acting.holding !== state.holding) {
    state.holding = acting.holding
    // A weapon comes up pointing where its own record says: a rifle level, a
    // grenade already lobbing at 45° — and no further than the mount it is
    // bolted to allows.
    sights.rearm(state.holding, barrel)
    state.readying = weapon.readyClip > 0 ? clipSeconds(core.clips[weapon.readyClip]) : 0
    if (state.readying > 0) anim.playOnce(acting, weapon.readyClip)
  }
  state.readying = Math.max(0, state.readying - delta)

  // The aim, the tremor and the zoom, at the END of the frame — so a shot
  // fired above left along the angle the player last saw (lib/game/sights.ts).
  sights.advance({
    holding: state.holding,
    committed: committed(core),
    firing: attack.firing() !== null,
    turning,
    barrel,
    delta
  })
  return weapon
}
