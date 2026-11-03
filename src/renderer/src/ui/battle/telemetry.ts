// THE SESSION LOG: blasts, flings, the handover and every decision the
// machine makes, as lines in `_tmp/telemetry.log` and the devtools console.

import { handling } from '../../../../lib/game/events'
import type { BattleBus } from '../../../../lib/game/events'
import { skillName } from '../../../../lib/game/skills'
import type { UiCore } from './core'

/** The telemetry tap on the bus. */
export const listenTelemetry = (core: UiCore, bus: BattleBus): void => {
  const { state } = core
  // The AI tap's repeat squeeze: a live grenade is watched EVERY FRAME
  // (AI_FUSE_SECONDS = 0), which wrote 110 identical `watch` lines into one
  // throw's two seconds. An identical decision counts up silently and the
  // count is flushed when something new happens.
  let aiSaid = ''
  let aiAgain = 0
  // …and the squeeze is FLUSHED on a clock too: a turn whose every
  // decision was the same `watch` used to leave NOTHING in the log — the
  // count only printed when something new happened, and the turn ended
  // first. Six silent seconds read as "the seat died" (the GINGER triage)
  // when it was deciding every frame.
  let aiHeldSince = 0
  bus.on(
    handling({
      // FLING TELEMETRY — play has twice reported a knocked pig that went
      // nowhere, and three headless probes could not reproduce it. These two
      // lines put the actual launch of every real blast in the devtools
      // console: where it went off, and what velocity each victim left with.
      // Cheap (explosions only), and the next report carries numbers.
      blasted: ({ at, effect }) => {
        const line = `[blast] at ${at.x.toFixed(0)},${at.y.toFixed(0)},${at.z.toFixed(0)} effect 0x${effect.toString(16)}`
        console.log(line)
        window.api.logTelemetry(line)
      },
      // A DOUSED throw sinks silently — no blast, no fuse, nothing. In
      // the log that read as "the grenade vanished" (GERARD, the third
      // session's triage); one line makes the water's verdict visible.
      doused: ({ at }) => {
        window.api.logTelemetry(`[lob] doused at ${at.x.toFixed(0)},${at.z.toFixed(0)}`)
      },
      // …and the HANDOVER: without it a player's 56-second turn reads as
      // the machine hanging, and every "did the AI stall" question in the
      // triage had to be answered by matching fling coordinates.
      turnBegan: ({ player, computer }) => {
        window.api.logTelemetry(`[turn] side ${player}${computer ? ' (machine)' : ''}`)
      },
      flung: ({ pig, at, vx, vy, vz }) => {
        const line =
          `[fling] pig ${pig} at ${at.x.toFixed(0)},${at.y.toFixed(0)},${at.z.toFixed(0)} ` +
          `v ${vx.toFixed(0)},${vy.toFixed(0)},${vz.toFixed(0)} flat ${Math.hypot(vx, vz).toFixed(0)}`
        console.log(line)
        window.api.logTelemetry(line)
        // …and the answer to "did it actually MOVE": the same body, three
        // seconds later. Wall clock is fine here — this is a session log,
        // not a spec, and the flight is over in under two.
        setTimeout(() => {
          const one = state.game?.players
            .flatMap((player) => player.pigs)
            .find((p) => p.id === pig)
          if (!one) return
          const moved = Math.hypot(one.position.x - at.x, one.position.z - at.z)
          const end =
            `[fling-end] pig ${pig} at ${one.position.x.toFixed(0)},${one.position.y.toFixed(0)},${one.position.z.toFixed(0)} ` +
            `moved ${moved.toFixed(0)}`
          console.log(end)
          window.api.logTelemetry(end)
        }, 3000)
      },
      // AI TELEMETRY — the machine's every decision as one or two lines in
      // the session log (`_tmp/telemetry.log`), for exactly the report play
      // keeps making: "свин тупит". The first line is the decision — who,
      // where, how the last order ended (and on WHAT it was refused), which
      // ladder rung answered, what it wants now. The second is the price
      // list — every candidate weighed, best first, the winner starred —
      // because the flip-flop class of stupidity lives in the RUNNER-UP:
      // two foes pricing level swap the winner on a stride, and a log of
      // winners alone shows two sensible choices instead of one
      // oscillation. Lines stay under the IPC's 512 bytes (main/ipc.ts),
      // which is what the candidate cap is for.
      aiDecided: ({ name, at, health, previous, refusal, order, thought }) => {
        const skillTag = (skill: number | null): string =>
          skill === null
            ? 'nothing'
            : skill < 0
              ? 'health'
              : skillName(state.battleText, skill) || `#${skill}`
        const spot = (one: { x: number; z: number; name?: string }): string =>
          one.name ?? `${one.x.toFixed(0)},${one.z.toFixed(0)}`
        const said = ((): string => {
          switch (order.kind) {
            case 'hold':
              return `hold ${skillTag(order.skill)}`
            case 'walkTo':
              return `walkTo ${order.x.toFixed(0)},${order.z.toFixed(0)}`
            case 'turnTo':
              return `turnTo ${order.heading.toFixed(2)}`
            case 'aimTo':
              return `aimTo ${order.angle}`
            case 'fire':
              return order.charge === undefined ? 'fire' : `fire @${order.charge.toFixed(2)}`
            case 'watch':
              return 'watch'
          }
        })()
        const head =
          `[ai] ${name} hp${Math.round(health)} @${at.x.toFixed(0)},${at.z.toFixed(0)}` +
          (previous === null ? '' : ` prev=${previous}${refusal ? `(${refusal})` : ''}`) +
          ` [${thought?.rung ?? '-'}] -> ${said}`
        if (head === aiSaid) {
          aiAgain++
          if (Date.now() - aiHeldSince >= 2000) {
            const again = `[ai] …the same, ${aiAgain} more times`
            console.log(again)
            window.api.logTelemetry(again)
            aiAgain = 0
            aiHeldSince = Date.now()
          }
          return
        }
        if (aiAgain > 0) {
          const again = `[ai] …the same, ${aiAgain} more times`
          console.log(again)
          window.api.logTelemetry(again)
        }
        aiSaid = head
        aiAgain = 0
        aiHeldSince = Date.now()
        console.log(head)
        window.api.logTelemetry(head)
        // **THE PLAN**, once, the decision it was made (lib/game/plan.ts):
        // where this whole turn is going, what the legs pay for it, and
        // how much ground the turn's ONE flood had to settle — which is
        // the other half of a `[perf]` frame. A HELD plan prints nothing:
        // the turn has not changed its mind, and a line a beat is noise.
        if (thought?.plan && !thought.held) {
          const shape = thought.plan
          const line =
            `[ai:plan] ${name} -> ${spot(shape.goal)}` +
            `${shape.errand ? ' (errand)' : ''} walk ${Math.round(shape.walk)}` +
            ` legs ${shape.legs} cells ${shape.cells}`
          console.log(line)
          window.api.logTelemetry(line)
        }
        if (!thought || thought.candidates.length === 0) return
        // Sorted by the TRUE score — NOT the belief: `judged` exists only
        // on each slot's own winner (evaluate.ts prices one option per
        // slot through `judge`), so a belief-sorted list ranked judged
        // rows against raw ones and put the star under a row that was
        // never in the election (the GINGER triage, 2026-08-24). The
        // belief still prints after the tilde, and a HELD plan says so.
        const rows = [...thought.candidates].sort((a, b) => b.score - a.score)
        const shown = rows
          .slice(0, 6)
          .map(
            (c) =>
              `${c === thought.chose ? '*' : ''}${c.kind} ${skillTag(c.skill)}->` +
              `${spot(c.target)} s${Math.round(c.score)}` +
              (c.judged !== undefined && Math.round(c.judged) !== Math.round(c.score)
                ? `~${Math.round(c.judged)}`
                : '')
          )
        const more = rows.length > 6 ? ` +${rows.length - 6} more` : ''
        const kit = `[ai:kit] ${name}${thought.held ? ' (plan held)' : ''} ${shown.join(' | ')}${more}`
        console.log(kit)
        window.api.logTelemetry(kit)
      },
    })
  )
}
