// PHASE 002 — A BLAST THROWS PIGS.
//
// Play: "мины не отбрасывают — как и тнт", and then "также мины и думаю гранаты
// тоже не отбрасывают — так что это общая проблемма." One cause for all three:
// this engine had a single locomotion state, the acting pig's, so there was
// nowhere to put a velocity for anybody else (lib/game/tumble.ts).
//
// Pure. What is asserted is the flight itself — a pig NOBODY is driving leaving
// the ground, coming down somewhere else, and the turn refusing to end while it
// is up.

import { expect, test } from '../app'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import { parsePmg, TILE_MINE, TILE_STEP } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { createMines } from '../../src/lib/game/mines'
import { BLAST_FLING, burst } from '../../src/lib/game/blast'
import { PITCH, createTumbles, flingVelocity } from '../../src/lib/game/tumble'
import { NO_OBSTACLES } from '../../src/lib/game/obstacles'
import { blastReach, blastShare } from '../../src/lib/game/grenade'
import { fromExeSpeed } from '../../src/lib/game/ballistics'
import { Game } from '../../src/lib/game/game'
import type { Pig } from '../../src/lib/game/game'
import { NO_BODY } from '../../src/lib/game/body'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'

const STEP = 1 / 60

const campQuery = (): TerrainQuery =>
  new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))

/** The first mine-flagged tile CAMP has, as a point on the ground. */
function firstMine(): { x: number; z: number } {
  const blocks = parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG')))
  for (const block of blocks) {
    for (let i = 0; i < block.tiles.length; i++) {
      if ((block.tiles[i].type & TILE_MINE) === 0) continue
      return {
        x: block.x + (i % 4) * TILE_STEP + TILE_STEP / 2,
        z: block.z + Math.floor(i / 4) * TILE_STEP + TILE_STEP / 2
      }
    }
  }
  throw new Error('CAMP has no minefield')
}

/**
 * Two pigs of one squad on the minefield, `apart` units apart in x, and the
 * mines wired to throw them.
 *
 * The second pig is what the fling is really about: it is nobody's turn, nothing
 * drives it, and before `tumble` there was no state in the engine that could
 * have moved it.
 */
function fielded(apart: number): {
  game: Game
  heard: BattleEvent[]
  mines: ReturnType<typeof createMines>
  tumbles: ReturnType<typeof createTumbles>
  query: TerrainQuery
  pigs: () => Pig[]
} {
  const at = firstMine()
  const query = campQuery()
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby', 'Percy'] }],
    spawns: [
      { x: at.x, z: at.z, y: query.height(at.x, at.z), body: NO_BODY },
      { x: at.x + apart, z: at.z, y: query.height(at.x + apart, at.z), body: NO_BODY }
    ]
  })
  const pigs = (): Pig[] => game.players.flatMap((player) => player.pigs)
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const tumbles = createTumbles({ query, pigs, obstacles: NO_OBSTACLES }, bus.emit)
  const mines = createMines(
    {
      pigs,
      targets: [],
      present: () => true,
      training: true,
      query,
      random: () => 0,
      // Every pig here is a pig nobody is driving, which is the whole case this
      // spec is about — the battle's own seam sends the ACTING one to `loco`
      // instead (lib/game/battle.ts `fling`).
      fling: (pig, speed, bearing) => tumbles.fling(pig, speed, bearing)
    },
    bus.emit
  )
  return { game, heard, mines, tumbles, query, pigs }
}

test('a fling is 45° UP along its bearing — the engine\'s own pitch', () => {
  // `0x4a9100(speed, 0x200, bearing, 0)` at every site that throws a pig about,
  // and 0x200 of 4096 is 45°.
  expect(PITCH).toBeCloseTo(Math.PI / 4, 10)

  const speed = fromExeSpeed(0x40)
  const up = flingVelocity(speed, 0)
  // Up is −Y, and at 45° the climb and the run are the same number.
  expect(up.vy).toBeLessThan(0)
  expect(Math.hypot(up.vx, up.vz)).toBeCloseTo(-up.vy, 6)
  expect(Math.hypot(up.vx, up.vy, up.vz)).toBeCloseTo(speed, 6)
  // Bearing 0 faces +Z, which is the convention the walk and the jump's own
  // push already use.
  expect(up.vz).toBeGreaterThan(0)
  expect(up.vx).toBeCloseTo(0, 6)
  const east = flingVelocity(speed, Math.PI / 2)
  expect(east.vx).toBeGreaterThan(0)
  expect(east.vz).toBeCloseTo(0, 6)

  expect(BLAST_FLING, 'the blast throws with 0x40 a frame').toBeCloseTo(fromExeSpeed(0x40), 6)
})

test('a mine THROWS the pig that trod on it — off the ground and down again', () => {
  const { game, mines, tumbles, query } = fielded(4000)
  const pig = game.currentPig
  const from = { ...pig.position }
  const ground = query.height(from.x, from.z)

  mines.tread(from.x, from.z)
  mines.update(1)
  expect(mines.live(), 'it went off').toBe(0)

  // It is in the air THE SAME STEP the blast lands: a pig with a mine under its
  // trotters is inside the core, so it takes the whole impulse.
  expect(tumbles.live(), 'nothing was thrown').toBe(1)
  expect(tumbles.has(pig)).toBe(true)
  const launch = tumbles.at()[0]
  expect(launch.vy, 'it was not thrown upward').toBeLessThan(0)
  expect(Math.hypot(launch.vx, launch.vy, launch.vz)).toBeCloseTo(BLAST_FLING, 4)

  // …and then it FLIES. Game space is Y-down, so off the ground is a smaller y.
  let highest = pig.position.y
  for (let i = 0; i < 60; i++) {
    tumbles.update(STEP)
    highest = Math.min(highest, pig.position.y)
  }
  expect(ground - highest, 'it never left the ground').toBeGreaterThan(50)

  // It comes down, and it comes down somewhere else — which is the whole of what
  // play asked for.
  for (let i = 0; i < 600 && tumbles.live() > 0; i++) tumbles.update(STEP)
  expect(tumbles.live(), 'it is still in the air after ten seconds').toBe(0)
  const moved = Math.hypot(pig.position.x - from.x, pig.position.z - from.z)
  expect(moved, 'it landed where it started').toBeGreaterThan(50)
  expect(pig.position.y, 'it did not come back down').toBeCloseTo(
    query.height(pig.position.x, pig.position.z),
    0
  )
})

test('…and the pig NEXT to it is thrown too, away from the blast and less hard', () => {
  // Far enough out to be past the 512-unit core and inside a mine's reach, so the
  // falloff has something to take off.
  const apart = 800
  const { game, mines, tumbles } = fielded(apart)
  const [near, far] = game.players[0].pigs
  const from = { ...far.position }

  mines.tread(near.position.x, near.position.z)
  mines.update(1)

  expect(tumbles.live(), 'both of them').toBe(2)
  const thrown = tumbles.at()
  const one = thrown.find((each) => each.pig === near.id)!
  const other = thrown.find((each) => each.pig === far.id)!
  // AWAY from it: the far pig sits at +x of the blast and goes on out that way.
  expect(other.vx, 'it was thrown back into the blast').toBeGreaterThan(0)
  expect(Math.abs(other.vz)).toBeLessThan(Math.abs(other.vx))
  // …and by the share the damage took, which is what makes standing back worth
  // doing: the one under it keeps the whole impulse.
  const share = blastShare(apart, blastReach(1024))
  expect(share).toBeLessThan(1)
  const flat = BLAST_FLING * share
  const got = Math.hypot(other.vx, other.vy, other.vz)
  // Within a percent of the share the flat distance gives, and UNDER it — the
  // falloff is measured in three dimensions from the blast to the body's own
  // origin, which stands above the soles (lib/game/body.ts), so the real gap is
  // always a little more than the two pigs' spacing.
  expect(got).toBeLessThan(flat)
  expect(got / flat).toBeGreaterThan(0.99)
  expect(Math.hypot(one.vx, one.vy, one.vz)).toBeGreaterThan(
    Math.hypot(other.vx, other.vy, other.vz)
  )

  for (let i = 0; i < 600 && tumbles.live() > 0; i++) tumbles.update(STEP)
  expect(Math.hypot(far.position.x - from.x, far.position.z - from.z)).toBeGreaterThan(20)
})

test('a blast with nobody to throw it to still hurts — the fling is optional', () => {
  // Which is what the pure specs about damage rely on: no bodies to move, no
  // ground to land on, and `burst` must not care (lib/game/blast.ts).
  const query = campQuery()
  const at = firstMine()
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby'] }],
    spawns: [{ x: at.x, z: at.z, y: query.height(at.x, at.z), body: NO_BODY }]
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const pig = game.currentPig
  burst(
    { x: pig.position.x, y: pig.position.y, z: pig.position.z },
    { damage: 2560, reach: blastReach(1024) },
    { pigs: () => [pig], targets: [], present: () => true, training: true },
    bus.emit
  )
  expect(pig.health).toBe(30)
  expect(heard.filter((one) => one.kind === 'blasted')).toHaveLength(1)
})
