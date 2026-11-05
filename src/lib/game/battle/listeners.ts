// What the battle hears on its own bus.

import { beginAftermath, watchAftermath } from '../aftermath'
import { handling } from '../events'
import { sargeOnPoint } from '../sergeant'
import type { BattleCore } from './core'

const BOOTS_SECONDS = 1

// The battle LISTENS to its own weapons for the two things that stop a turn.
// A blow does not decide that a turn ends; the OBJECT breaking does, which is
// where the exe hangs it too (0x48d750), and every weapon simply announces.
export const listen = (core: BattleCore): void => {
  const { game, scenery, effects, walkHome, emit, everyone, state } = core
  core.bus.on(
    handling({
      killed: ({ pig }) => {
        const dead = everyone().find((one) => one.id === pig)
        if (!dead) return
        if (game.currentPlayer.pigs.includes(dead)) state.tally.losses++
        else state.tally.kills++
      },
      // **A BLOW ON THE ACTING PIG ENDS ITS TURN — the mine's answer.**
      // Play asked whether treading on one closes the turn ("вроде в оригинале
      // да"), and the tread path does not: it makes a projectile and clears the
      // tile, and no handover is anywhere in it. The rule is one level down, in
      // `Pig::TakeDamage` itself — 0x467c56 reads the routine's second argument
      // a second time and, when it is **0** and the pig being hurt is the one
      // being played, calls `Game::EndTurn` (0x494430). Every weapon path passes
      // 0; a status tick, a hard landing and a drowning pass something else,
      // which is what `blow` on the event carries (lib/game/events.ts). So the
      // mine ends the turn through the BLAST it sets off, not through the foot
      // that found it — and so does a pig's own grenade at its own trotters.
      //
      // Health does not come into it: the arm sits above the death checks and
      // one point is enough. It is a `spent` like a weapon's, cashed on the
      // quiet below, so the blast plays out and the pig is thrown before the
      // turn goes.
      damaged: ({ pig, blow }) => {
        if (!blow || pig === undefined) return
        // A blow stops a pig walking home, and it stands the wait again
        // (0x467C47..0x467C50, lib/game/walkHome.ts).
        walkHome.struck(pig)
        if (pig !== game.currentPig.id) return
        state.spent = true
        // …and it is mode 13 from this blow on in the exe, so the line no longer
        // holds this pig: its own blast can throw it past (`terrain/boundary.md`).
        state.loco.heldAtLimit = false
      },
      // **AND ON THE TRAINING GROUND THE FLOOR ENDS IT, WHATEVER THE CAUSE.**
      // The next arm of the same routine (0x467c76, `damage/training-floor.md`
      // in the disasm repo): a pig that cannot die pays with its turn instead,
      // if it is the one being played. Water, a fall and the poison pass no
      // `blow`, so this is the only thing that costs them a turn.
      spared: ({ pig }) => {
        if (pig !== game.currentPig.id) return
        state.spent = true
        state.loco.heldAtLimit = false
      },
      // THE BOOTS GET THEIR SECOND. The walk-away beat holds while a corpse
      // is playing out and could end the very frame the boots land — which
      // yanked the camera to the shooter for the sergeant's praise with the
      // boots barely on the ground. Play: "после смерти - ещё секунду видны
      // сапоги - а не сразу возвращается к стрелявшему." `[play]` — the exe's
      // own pacing here is not read.
      remains: () => {
        state.bootsFor = BOOTS_SECONDS
      },
      // A promotion point off the ground is worth a word from him — the one
      // category whose lines name a drop point (lib/game/sergeant.ts).
      promotionPoint: () => {
        const said = sargeOnPoint(state.sargeLines)
        emit({ kind: 'sergeant', section: said.section, line: said.line })
      },
      broke: ({ target, at }) => {
        // A different effect from the hit, and the one play remembers as smoke.
        effects.broke(at)
        scenery.remove(target)
        // The turn stops here and the camera stays on the spot. What comes
        // next — a crate under a canopy, most of the time — is watched from the
        // same wait (lib/game/aftermath.ts).
        state.aftermath = beginAftermath(at)
        // …and its own command, which is the last thing the exe's break handler
        // does (0x48d972). This is what drops the next crate in — but NOT YET:
        // the dummy has to finish coming apart before the crate starts coming
        // down, which is how the whole game is paced.
        state.pending = { id: target, y: at.y }
      },
      // Stay on the spot for the beat the blow's own wait gives it, which is
      // what makes the burst visible at all: the camera leaves the grenade the
      // frame it stops existing.
      blasted: ({ at }) => {
        if (!state.aftermath) state.aftermath = beginAftermath(at)
      },
      // …and a BULLET earns the same beat wherever it ended — a body, the
      // ground, a box. The exe's wait runs after every weapon use, not only
      // the ones that break something (`turns/aftermath.md`); without this a
      // rifle shot snapped straight back to the shooter, and play named it:
      // "выстрел должен держать камеру после попадания".
      shotLanded: ({ at }) => {
        if (!state.aftermath) state.aftermath = beginAftermath(at)
      },
      // **WATCHING DYING PIG — the exe's mode 16.** The dying clip starting
      // (lib/game/corpses.ts, the state 6 → 7 edge) is the frame the exe's
      // 0x497760 re-points the camera at whoever was hurt, and the beat to
      // show it in already exists: `settling()` counts the corpses, so the
      // aftermath cannot end under the death — it was just aimed at where
      // the SHOT landed instead of where the body lies. Re-point it, or
      // begin one for a death no blow announced (a drowning). The body may
      // go on moving — the sink — so the per-frame mirror below
      // (`corpses.watching()`, beside the crate's) keeps following it.
      dying: ({ pig }) => {
        const body = everyone().find((one) => one.id === pig)?.position
        if (!body) return
        if (state.aftermath) watchAftermath(state.aftermath, body)
        else state.aftermath = beginAftermath(body)
      }
    })
  )
}
