// THE BRAIN PROCESS — a Node process whose whole job is to be asked what the
// machine should do, and to answer.
//
// It runs beside the app rather than in it, and the reason is one number: a
// turn's plan floods the whole map (about 25 000 cells) and costs a few
// hundred milliseconds. In the renderer that stood on the frame the picture
// was about to be drawn from, so play saw the game freeze about a second
// every time a pig started thinking — "провисание рендера на 1 секунду… это
// отдельный нод процесс должен быть: получил данные — вернул план". Here it
// costs a few hundred milliseconds OF ITS OWN, and the frame never learns
// about it.
//
// **It holds its own copy of the map**, and that is the whole design. Four of
// the five things a brain asks the world (lib/game/ai.ts, `AiOracles`) are
// terrain and collision lookups that the searches make tens of thousands of
// times per plan; those can never be messages. So the FACTS come down the
// pipe (positions, health, kit, crates — small, once a second) and the map
// stays put on both sides. The terrain is read off the very same `.PMG` and
// `.PTG` the app read; the OBJECTS are sent, because the engine's list is the
// authority (`fielded` drops some and the map script places others).
//
// It decides. It does not act, it does not draw, and it owns nothing: an
// order goes back and the engine's actuator works it through the player's own
// inputs, exactly as before (docs/ai.md, "the brain holds the same gamepad").
//
// Spawned by the main process as an Electron `utilityProcess`, which is a
// plain Node process with a message port to the window. Nothing in here
// imports Electron: the transport is `process.parentPort`, and everything
// else is `lib/`.

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { parsePmg } from '../lib/formats/pmg'
import { parsePtg } from '../lib/formats/ptg'
import { createGruntBrain } from '../lib/game/grunt'
import { oraclesFor } from '../lib/game/aiGround'
import type { AiGround } from '../lib/game/aiGround'
import { createWaterMemo } from '../lib/game/pathfind'
import { ObstacleField } from '../lib/game/obstacles'
import { buildQuery } from '../lib/game/engine'
import { seeded } from '../lib/game/random'
import type { BrainReply, BrainRequest } from '../lib/game/brainPort'
import type { Brain } from '../lib/game/ai'

/** Electron's `utilityProcess` end of the pipe. Typed here rather than
 * imported, because importing `electron` would drag the whole app in for two
 * methods and this file must stay a plain Node module. */
interface ParentPort {
  on(event: 'message', handler: (message: { data: BrainRequest }) => void): void
  postMessage(message: BrainReply): void
}

const parent = (process as unknown as { parentPort?: ParentPort }).parentPort

/** The game directory, handed over when the process was started — the host
 * owns the path, and the renderer never sees one. `Maps/` under it is where
 * the terrain the engine loaded came from. */
const MAPS_DIR = path.join(process.argv[2] ?? '', 'Maps')

/** One battle's world, built once and kept until the next one. */
interface Seated {
  brain: Brain
  ground: AiGround
  roll: () => number
}

let seated: Seated | null = null
/** Asks that arrived before the map finished loading. One at most — the seat
 * never has two outstanding (lib/game/brainPort.ts). */
let queued: Extract<BrainRequest, { kind: 'ask' }> | null = null

/**
 * Find the map's own files however they are cased on disk.
 *
 * The shipped install is upper case and a copied one is not; the app's own
 * loader walks the directory for the same reason.
 */
async function mapFile(dir: string, stem: string, ext: string): Promise<string | null> {
  const wanted = `${stem}.${ext}`.toLowerCase()
  const found = (await fs.readdir(dir)).find((name) => name.toLowerCase() === wanted)
  return found === undefined ? null : path.join(dir, found)
}

async function seat(setup: Extract<BrainRequest, { kind: 'battle' }>): Promise<void> {
  const pmg = await mapFile(MAPS_DIR, setup.map, 'pmg')
  if (pmg === null) throw new Error(`no ${setup.map}.PMG under ${MAPS_DIR}`)
  const blocks = parsePmg(await fs.readFile(pmg))
  const ptg = await mapFile(MAPS_DIR, setup.map, 'ptg')
  // The textures are only ever used to build the WATER MASK — the per-texel
  // verdict that separates translucent water from the opaque ice art painted
  // with the same flag (lib/game/watermask.ts).
  const textures = ptg === null ? [] : parsePtg(await fs.readFile(ptg))
  seated = {
    brain: createGruntBrain(),
    ground: {
      query: buildQuery(blocks, textures),
      obstacles: new ObstacleField(setup.objects),
      water: createWaterMemo()
    },
    roll: seeded(setup.seed)
  }
}

/**
 * One decision.
 *
 * The scenery delta is applied FIRST and whole: a crate collected or a barrel
 * burst is no longer something to walk round, and a driven vehicle is a solid
 * box that has moved. It arrives as a snapshot with every ask rather than as
 * a stream of events, so nothing here can drift out of step with the battle
 * — replaying the same snapshot twice is a no-op.
 */
function answer(ask: Extract<BrainRequest, { kind: 'ask' }>, seat: Seated): void {
  for (const id of ask.scenery.gone) seat.ground.obstacles.remove(id)
  for (const box of ask.scenery.moved) {
    seat.ground.obstacles.moveTo(box.id, box.x, box.z, box.turn)
  }
  const order = seat.brain.decide({
    ...ask.facts,
    ...oraclesFor(seat.ground, ask.facts, seat.roll)
  })
  parent?.postMessage({
    kind: 'order',
    id: ask.id,
    order,
    thought: seat.brain.explain?.() ?? null
  })
}

parent?.on('message', ({ data }) => {
  switch (data.kind) {
    case 'battle':
      seated = null
      queued = null
      void seat(data).then(() => {
        // An ask that beat the map here is answered the moment it lands,
        // rather than being lost: the seat is patient (BRAIN_PATIENCE) but it
        // does not ask twice for the same beat.
        const waiting = queued
        queued = null
        if (waiting !== null && seated !== null) answer(waiting, seated)
      })
      return
    case 'ask':
      if (seated === null) queued = data
      else answer(data, seated)
      return
    case 'reset':
      // A new turn: the brain forgets the last one. The MAP is not touched —
      // it is the battle's, not the turn's, and so is the water memo whose
      // whole point is living longer than a turn.
      seated?.brain.reset()
      queued = null
      return
    case 'close':
      seated = null
      queued = null
      return
  }
})
