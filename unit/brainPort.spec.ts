// PHASE 002 (domain) — THE BRAIN'S SEAT WHEN THE BRAIN IS NOT IN THE TICK.
// Pure, no Electron, no process: the transport is a pair of functions.
//
// What the port has to get right is not "does the brain think well" — that is
// unit/grunt.spec.ts — but the two things a split introduces: an answer that
// belongs to a question nobody is asking any more must never be acted on, and
// a brain that never answers must not hold the machine for the rest of the
// turn.

import { test, expect } from '@playwright/test'

import { BRAIN_PATIENCE, localBrain, remoteBrain } from '../src/lib/game/brainPort'
import type { BrainReply, BrainRequest } from '../src/lib/game/brainPort'
import type { AiFacts, Brain } from '../src/lib/game/ai'
import type { AiGround } from '../src/lib/game/aiGround'
import type { Order } from '../src/lib/game/orders'

/** The facts are carried, never read, by anything under test here. */
const FACTS = {
  timeLeft: 45,
  turnSeconds: 45,
  wits: 0,
  previous: null,
  acting: {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    aim: 0,
    health: 50,
    maxHealth: 100,
    holding: null,
    carrying: []
  },
  foes: [],
  friends: [],
  swimming: false,
  swims: false,
  thrown: null,
  planted: null,
  crates: []
} satisfies AiFacts

/** A pipe with a hand on it: nothing is answered until this spec says so. */
function wire(): {
  sent: BrainRequest[]
  reply: (message: BrainReply) => void
  transport: Parameters<typeof remoteBrain>[0]
} {
  const sent: BrainRequest[] = []
  let handler: ((message: BrainReply) => void) | null = null
  return {
    sent,
    reply: (message) => handler?.(message),
    transport: {
      post: (message) => sent.push(message),
      onMessage: (take) => {
        handler = take
      },
      close: () => {
        handler = null
      }
    }
  }
}

const NOTHING: AiGround = {
  // Never reached: no test here lets a decision run.
  query: null as never,
  obstacles: null as never,
  water: new Map()
}

const WATCH: Order = { kind: 'watch' }

test('the SETUP goes first, before anything can be asked', { tag: '@nodata' }, () => {
  const pipe = wire()
  remoteBrain(
    pipe.transport,
    { kind: 'battle', map: 'ESTU', objects: [], seed: 7 },
    () => ({ gone: [], moved: [] })
  )
  expect(pipe.sent).toHaveLength(1)
  expect(pipe.sent[0]).toMatchObject({ kind: 'battle', map: 'ESTU', seed: 7 })
})

test('an ask is outstanding until it is answered, and is not asked twice', { tag: '@nodata' }, () => {
  const pipe = wire()
  const port = remoteBrain(
    pipe.transport,
    { kind: 'battle', map: 'ESTU', objects: [], seed: 7 },
    () => ({ gone: [4], moved: [] })
  )
  port.ask(FACTS)
  expect(port.thinking(), 'the seat waits').toBe(true)
  expect(port.answer(), 'and there is nothing to take yet').toBeNull()
  // The seat polls every step of the turn; none of that may reach the pipe.
  port.ask(FACTS)
  port.ask(FACTS)
  expect(pipe.sent.filter((one) => one.kind === 'ask')).toHaveLength(1)
  // The scenery goes WITH the ask — a crate collected is no longer a wall.
  expect(pipe.sent[1]).toMatchObject({ kind: 'ask', id: 1, scenery: { gone: [4] } })

  pipe.reply({ kind: 'order', id: 1, order: WATCH, thought: null })
  expect(port.thinking(), 'the answer landed').toBe(false)
  expect(port.answer()).toEqual({ order: WATCH, thought: null })
  expect(port.answer(), 'and it is handed over exactly once').toBeNull()
})

test('an answer to a question nobody is asking is DROPPED unread', { tag: '@nodata' }, () => {
  const pipe = wire()
  const port = remoteBrain(
    pipe.transport,
    { kind: 'battle', map: 'ESTU', objects: [], seed: 7 },
    () => ({ gone: [], moved: [] })
  )
  port.ask(FACTS)
  // The pig was flung mid-thought: the seat gives up on that world
  // (lib/game/battle.ts, "no control, no thinking").
  port.drop()
  expect(port.thinking()).toBe(false)
  pipe.reply({ kind: 'order', id: 1, order: WATCH, thought: null })
  expect(port.answer(), 'the stale order never reaches the hands').toBeNull()

  // …and the NEXT ask is a new id, so the dropped one cannot answer it.
  port.ask(FACTS)
  pipe.reply({ kind: 'order', id: 1, order: WATCH, thought: null })
  expect(port.answer()).toBeNull()
  pipe.reply({ kind: 'order', id: 2, order: WATCH, thought: null })
  expect(port.answer()).toEqual({ order: WATCH, thought: null })
})

test('a brain that never answers does not hold the turn', { tag: '@nodata' }, () => {
  let clock = 100
  const pipe = wire()
  const port = remoteBrain(
    pipe.transport,
    { kind: 'battle', map: 'ESTU', objects: [], seed: 7 },
    () => ({ gone: [], moved: [] }),
    () => clock
  )
  port.ask(FACTS)
  clock += BRAIN_PATIENCE - 0.1
  expect(port.thinking(), 'a cold plan is worth waiting for').toBe(true)
  clock += 0.2
  expect(port.thinking(), 'a dead one is not').toBe(false)
  // The seat mulls and asks again, which is the only way back.
  port.ask(FACTS)
  expect(pipe.sent.filter((one) => one.kind === 'ask')).toHaveLength(2)
})

test('a turn handover tells the far brain to forget, and drops what was owed', { tag: '@nodata' }, () => {
  const pipe = wire()
  const port = remoteBrain(
    pipe.transport,
    { kind: 'battle', map: 'ESTU', objects: [], seed: 7 },
    () => ({ gone: [], moved: [] })
  )
  port.ask(FACTS)
  port.reset()
  expect(pipe.sent.at(-1)).toEqual({ kind: 'reset' })
  pipe.reply({ kind: 'order', id: 1, order: WATCH, thought: null })
  expect(port.answer(), "last turn's thought is not this turn's order").toBeNull()
})

test('the LOCAL brain answers on the step it is asked — the headless shape', { tag: '@nodata' }, () => {
  const said: Order = { kind: 'hold', skill: 7 }
  let resets = 0
  const brain: Brain = {
    decide: () => said,
    explain: () => null,
    reset: () => {
      resets++
    }
  }
  const port = localBrain(brain, NOTHING, () => 0.5)
  port.ask(FACTS)
  expect(port.thinking(), 'nothing is ever outstanding').toBe(false)
  expect(port.answer()).toEqual({ order: said, thought: null })
  expect(port.answer()).toBeNull()
  port.reset()
  expect(resets).toBe(1)
})
