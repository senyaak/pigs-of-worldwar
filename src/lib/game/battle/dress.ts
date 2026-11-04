// WHAT THE PIGS WEAR: the acting pig's clip and the aiming arms over it, the
// stand at the START OF TURN beat, and everybody else's stand, swim or wound.

import { aimPhase, scrubsPose } from '../aim'
import type { Pig } from '../game'
import { isDead, woundBand } from '../health'
import { ANIM, inWater } from '../locomotion'
import { SKILL } from '../skills'
import type { Weapon } from '../weapons'
import type { BattleCore } from './core'

/** START OF TURN: the pig stands; true while the beat has the frame. */
export const startingBeat = (core: BattleCore, acting: Pig): boolean => {
  const { game, anim } = core
  // "START OF TURN - press any key to continue": the pig stands, and nothing
  // here ends the beat. ENDING it belongs to the input layer, and to one
  // place in it: `starting` is a control SET whose whole rule is that any
  // press ends the turn's beat and is then read again in the set that
  // follows (input/battleInput.ts, which polls ahead of this every frame).
  if (game.starting) {
    anim.setClip(acting, ANIM.IDLE)
    anim.overlay(acting, -1, 0)
    return true
  }
  return false
}

/** Everybody not being driven, dressed for where they are. */
export const dressBystanders = (core: BattleCore, acting: Pig): void => {
  const { query, anim, tumbles, everyone } = core
  for (const pig of everyone()) {
    if (pig === acting) continue
    // A body that has fallen stays fallen: its dying clip was played once
    // and clamped, and standing it back up is exactly what this loop would
    // otherwise do every frame.
    if (isDead(pig)) continue
    // …and neither does a pig IN THE AIR stand. Play: "отбрасывание не
    // запускает анимацию полёта. падение не запускает анимацию подьёма после
    // полёта" — both were this line: `tumble` puts the bounce clip on and then
    // this loop took it straight back off, once a frame, for the whole flight
    // and through the get-up as well (lib/game/tumble.ts).
    if (tumbles.has(pig)) continue
    // …and a clip played through once is played through: asking for the stand
    // is what would cancel it (lib/game/anim.ts), one frame in. It is the sneeze
    // of a pig the gas has just taken (0x477b74) and of one hurt with the bit on
    // (lib/game/reaction.ts); nobody here is being driven, and only a driven
    // pig's gait replaces one.
    if (anim.animating(pig)) continue
    // A CRIPPLED bystander stands in the wounded stance — the idle
    // picker's own health test (0x472040 test 8, ≤ 10 points), and nobody
    // but the acting pig has a weapon drawn to override it.
    // A bystander IN THE WATER swims instead of standing on it: a blast
    // threw it there this turn, and this loop used to stamp the stand back
    // on every frame until the end-of-turn beat (play: "он сначала стоит
    // долю секунды - затем плывёт").
    anim.setClip(
      pig,
      inWater(query, pig.position.x, pig.position.z, pig.position.y)
        ? ANIM.SWIM
        : woundBand(pig.health) === 2
          ? ANIM.WOUNDED
          : ANIM.IDLE
    )
    // Only the pig being driven holds its weapon up; the rest stand.
    anim.overlay(pig, -1, 0)
  }
}

/** The acting pig's clip, and the weapon's aiming clip over it. */
export const dressActing = (core: BattleCore, acting: Pig, weapon: Weapon): void => {
  const { anim, swings, sights, state } = core
  // A committed clip — the jump's crouch, a landing's get-up — is started
  // once and left to play out; anything else is simply worn. Getting a weapon
  // out is a commitment of the same kind, and holds the pig until it is done.
  if (state.readying > 0) {
    // The getting-it-out clip has the pig to itself.
  } else if (swings.swinging()) {
    // …and so does the swing. `Pig::Attack` puts its clip on the PRIMARY
    // channel and clears the weapon one (0x46971a).
  } else if (state.loco.commit) {
    if (!anim.animating(acting)) anim.playOnce(acting, state.loco.clip)
  } else if (anim.animating(acting) && state.loco.clip === ANIM.IDLE) {
    // **A ONCE-CLIP PLAYS OUT — while the pig is STANDING.** Play, of the charge
    // going down: "ТНТ ставится на землю — с анимацией", and there was none:
    // `setClip` below replaces a committed clip the very next frame, so every
    // weapon's attack clip was being wiped one frame after `playOnce` started it.
    // The swing was the only survivor, because `swings.swinging()` holds it a
    // branch earlier — which is why nothing had noticed.
    //
    // And the STANDING half is the exe's own rule rather than a hedge: the
    // run-cycle picker (0x46c476..0x46c52e) asks for a gait whenever the pig has
    // a step to take, and that request starts the clip over — so a pig that lands
    // on the run does not get up, and a pig left alone does
    // (`animations/notes.md`). A driven pig's gait wins; nothing else does.
  } else if (state.holding === SKILL.SKIP_TURN && state.loco.clip === ANIM.IDLE) {
    // A pig with SKIP TURN in hand stands there THINKING about it — clip 46,
    // which play named. It replaces the IDLE only.
    anim.setClip(acting, ANIM.THINKING)
  } else {
    anim.setClip(acting, state.loco.clip)
  }

  // And over the top of it, the arms: the weapon's aiming clip held at the
  // frame its angle points at. A SECOND channel, not a replacement.
  const holdingUp =
    state.readying === 0 && !swings.swinging() && state.loco.airborne === null && scrubsPose(state.holding)
  anim.overlay(acting, holdingUp ? weapon.aimClip : -1, aimPhase(sights.angle()))
}
