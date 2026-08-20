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
import { MINE_DAMAGE, createMines } from '../../src/lib/game/mines'
import { DAMAGE_UNIT } from '../../src/lib/game/projectile'
import { FLING_CAP, FLING_PER_POINT, burst, flingSpeed } from '../../src/lib/game/blast'
import { PITCH, createTumbles, flingVelocity } from '../../src/lib/game/tumble'
import { NO_OBSTACLES, PIG_RADIUS, withPigs } from '../../src/lib/game/obstacles'
import { BLAST_CORE, blastReach, blastShare } from '../../src/lib/game/grenade'
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

  // …and how HARD: SIX times the damage in points, capped at the cattle prod's 200
  // a frame, which is the hardest knock anything in the exe hands out. Play twice —
  // "толчёк очень мелкий" against the flat 0x40 that was less than a punch, and then
  // "отбрасывание миной всё ещё кажется слабым" against four times. At six a mine
  // lands on the engine's other decoded knock.
  expect(FLING_PER_POINT).toBe(6)
  expect(flingSpeed(20), "a mine's core is 0x78").toBeCloseTo(fromExeSpeed(0x78), 6)
  expect(flingSpeed(30), "a grenade's is 180").toBeCloseTo(fromExeSpeed(180), 6)
  expect(flingSpeed(50), "TNT's fifty are held at the prod's 200").toBeCloseTo(
    fromExeSpeed(200),
    6
  )
  // Monotone up to the cap, and the cap is the hardest knock in the exe.
  expect(flingSpeed(20)).toBeLessThan(flingSpeed(30))
  expect(flingSpeed(30)).toBeLessThan(flingSpeed(50))
  expect(flingSpeed(500), 'nothing throws harder than the cap').toBe(FLING_CAP)
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
  // Twenty points at the core, so six times that a frame — 0x78.
  expect(Math.hypot(launch.vx, launch.vy, launch.vz)).toBeCloseTo(flingSpeed(20), 4)

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
  // The impulse rides the DAMAGE, and the damage is already the share for the
  // distance — so the far pig is thrown by four times whatever it lost. Under
  // the flat-distance figure, because the falloff is measured in three dimensions
  // from the blast to the body's own origin, which stands above the soles
  // (lib/game/body.ts).
  const flat = flingSpeed(Math.round((MINE_DAMAGE * share) / DAMAGE_UNIT))
  const got = Math.hypot(other.vx, other.vy, other.vz)
  expect(got).toBeLessThanOrEqual(flat)
  expect(got / flat).toBeGreaterThan(0.9)
  expect(Math.hypot(one.vx, one.vy, one.vz)).toBeGreaterThan(
    Math.hypot(other.vx, other.vy, other.vz)
  )

  for (let i = 0; i < 600 && tumbles.live() > 0; i++) tumbles.update(STEP)
  expect(Math.hypot(far.position.x - from.x, far.position.z - from.z)).toBeGreaterThan(20)
})

test('THE RIM IS THE RANGE: past it a blast does nothing at all', () => {
  // Play, of TNT: "радиус слишком большой — я отхожу задом все 4 секунды, а меня
  // всё равно задевает на 4 урона." Measured, they were about 2400 units out.
  //
  // `0x48CBA0` is a ramp from the core to a QUARTER at exactly `past = range`,
  // and this engine went on evaluating it past its own divisor to where the line
  // crosses zero — `512 + 4·range/3`. For a GRENADE the two land on the same
  // number and nothing ever looked wrong; for TNT, at twice the range, they are
  // hundreds of units apart, and those hundreds are what play walked through.
  const tnt = blastReach(2048)
  const grenade = blastReach(1024)
  // At the core, everything. At the rim, the exe's quarter and not nothing.
  expect(blastShare(0, tnt)).toBe(1)
  expect(blastShare(BLAST_CORE, tnt)).toBe(1)
  expect(blastShare(BLAST_CORE + tnt, tnt)).toBeCloseTo(0.25, 6)
  // …and one unit past it, nothing.
  expect(blastShare(BLAST_CORE + tnt + 1, tnt)).toBe(0)
  expect(blastShare(2400, tnt), 'four seconds of backing away is out of it').toBe(0)

  // And the change is SIZED by the range, which is why only TNT was ever
  // complained about: measured against what this engine used to reach — the
  // line's zero crossing, `512 + 4·range/3`, off the old range with no striker
  // term in it — a grenade loses under a hundred units and TNT loses four
  // hundred.
  const wasReaching = (blast: number): number => BLAST_CORE + (4 * (blast - BLAST_CORE)) / 3
  expect(wasReaching(1024) - (BLAST_CORE + grenade)).toBeLessThan(100)
  expect(wasReaching(2048) - (BLAST_CORE + tnt)).toBeGreaterThan(400)
  expect(blastShare(1500, grenade), 'and a grenade past its own rim is nothing').toBe(0)
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

test('a body thrown while it is INSIDE another still travels', () => {
  // Play, on a bayonet: "свинья будто на месте летит пол секунды вместо
  // настоящего отбрасывания — похоже застревания какието", and the arithmetic
  // agreed before the game did: a walking pig is stopped at exactly 2·PIG_RADIUS
  // from the one it is walking at, `withPigs` blocks at exactly that distance,
  // and a blocked step in the air ZEROES the horizontal velocity for good
  // (lib/game/locomotion.ts). So a body struck at melee range began its flight
  // already on the boundary and never left the spot.
  //
  // The two pigs here stand ONE unit apart — as deep inside each other as two
  // bodies can be — which is the worst case of the same thing.
  const { game, tumbles, pigs, query } = fielded(1)
  const thrown = pigs()[1]
  const from = { ...thrown.position }
  const obstacles = withPigs(
    NO_OBSTACLES,
    [{ ...game.currentPig.position }],
    { ...thrown.position }
  )
  expect(
    obstacles.blocks(from.x + 10, from.z, from.y, 0),
    'the body it is inside is not in its way'
  ).toBe(false)

  tumbles.fling(thrown, flingSpeed(30), Math.PI / 2)
  for (let i = 0; i < 200 && tumbles.live() > 0; i++) tumbles.update(STEP)
  const went = Math.hypot(thrown.position.x - from.x, thrown.position.z - from.z)
  expect(went, 'it was thrown, not held').toBeGreaterThan(PIG_RADIUS * 4)
  // …and along the bearing it was given, which is +x.
  expect(thrown.position.x - from.x).toBeGreaterThan(0)
  expect(query).toBeDefined()
})
