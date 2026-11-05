// PHASE 000 (continued) — THE LOB BENCH: each thrown and lobbed skill of the issue
// thrown on the proving ground through the real attack (e2e/bench.ts), what its burst
// does to a dummy against the numbers read from the exe.
//
// Four things every case asserts, and where each is read:
//
// - **The throw of the thing itself**: the row's speed at a full gauge
//   (weapons/fire/gauge.md, 0x493812: the charge tops out at 0xFFF), and when it goes
//   off (weapons/gas.md, 0x436A62: arming + fuse + `rand & 7` frames, or a contact
//   round, weapons/fire/bazooka.md, 0x437F2C, with nothing counting it down).
// - **Damage at the core**: row +0x0C over 128, whole inside 512 units of the burst
//   (weapons/fire/damage.md, 0x48CC33). The dummy stands where the thing goes off, so
//   the row's figure is what it pays.
// - **Reach**: a dummy just inside the remake's rim and one just outside it.
// - **The throw of the dummy**: row +0x08 over a pig's mass of 30
//   (weapons/fire/phantom-sweep.md, 0x40A500), as a speed in exe units a frame. Its
//   DIRECTION is `[play]` and not asserted here (`hurlVelocity`, lib/game/tumble.ts;
//   docs/facts/knock-and-throw.md), the vertical the exe doubles with it.
//
// **A case that says DIFFERS or KNOWN SHORT pins what the remake does today, with what
// the exe does beside it and the issue that owns the gap.** When that issue lands the
// case goes red, and whoever landed it writes the exe's number in.
//
// A dummy stands with far more points than a grunt has, or a blast that kills it would
// hide the next one: what is on trial is what a blast takes off, not who survives it.
//
// Run with `npm run e2e:locked -- e2e/000/proving-bench-lobs.spec.ts`: it needs the
// installed game and no window.

import { expect, test } from '@playwright/test'

import { OFF_THE_LINE_Z, benchInstalled, inHand, openBench, standAt, stepUntil } from '../bench'
import type { Bench } from '../bench'
import { GAME_DIR } from '../launch'
import { AIM_LOB } from '../../src/lib/game/aim'
import { EXE_FRAME_SECONDS, PLAIN_GRAVITY, fromExeSpeed } from '../../src/lib/game/ballistics'
import { originY } from '../../src/lib/game/body'
import type { Pig } from '../../src/lib/game/game'
import type { Lobbed } from '../../src/lib/game/grenade'
import { maxHealthFor } from '../../src/lib/game/health'
import { restingY } from '../../src/lib/game/locomotion'
import type { Point } from '../../src/lib/game/pose'

/** A skill, as a pig holds it. */
type Skill = NonNullable<Pig['holding']>

const GRENADE = 19
const CLUSTER_GRENADE = 20
const HIGH_EXPLOSIVE = 21
const ROLLER = 22
const POISON = 26
const SUPER_GRENADE = 27
const MORTAR = 28
const BAZOOKA = 29
const MEDICINE_BALL = 33

/** The gauge a burst is measured at: half of it puts every gauge weapon's burst on the
 * flat of the strip, where a full one carries it to the map's edge. What a burst does
 * does not read the charge it was thrown with. */
const HALF_GAUGE = 0.5
const FULL_GAUGE = 1
/** Where the mortar is pointed for its burst, 78° up: with no gauge the aim is the
 * whole of its range, and at the 45° it comes up at it lands off the map. */
const MORTAR_AIM = 888
/** 4096 to a turn, the engine's angle (weapons/cluster.md, 0x433A48). */
const TURN = 4096

/** The points a dummy stands with, far past anything thrown here. */
const STOUT = 1000

/** One burst of a throw. */
interface Burst {
  at: Point
  effect: number
  /** The engine step it came on, counted from the throw: two on one step cannot be
   * stood on one at a time. */
  step: number
}

/** A throw with nobody in the way: where everything it let go went off. */
interface Flight {
  bursts: Burst[]
  /** A gas canister's clouds, in the order they were let go. */
  clouds: Point[]
  /** Where the last of it ended: the burst, or a canister's pop. */
  end: Point
  /** What the first burst threw out, the step it was born. */
  children: Lobbed[]
  /** Where the throw, coming down, passes the height of a pig's centre. */
  comeDown: Point
}

/** What a dummy went through. */
interface Struck {
  /** Each blow's points off it, in order. */
  damage: number[]
  /** Each heal's points. */
  healed: number[]
  /** The speed of each throw, in exe units a frame. */
  throws: number[]
  health: number
  poisoned: boolean
  /** Clips it was put in by something thrown: the sneeze, here. */
  clips: number[]
}

/** The rest of the second side off the strip. */
function clearTheStrip(bench: Bench, except: Pig[] = []): void {
  for (const dummy of bench.dummies) {
    if (!except.includes(dummy)) standAt(bench, dummy, dummy.position.x, OFF_THE_LINE_Z)
  }
}

/** The skill in hand and pointed: everything comes up where it comes up, the mortar
 * raised to where its burst lands on the map. */
function takeUp(bench: Bench, skill: Skill, raise: boolean): void {
  const { engine } = bench
  inHand(bench, skill)
  if (skill !== MORTAR || !raise) return
  engine.battle.setAim(1)
  stepUntil(bench, () => (engine.battle.aim() ?? 0) >= MORTAR_AIM, 'the mortar is raised')
  engine.battle.setAim(0)
}

/** The fire key held to this much of the gauge and let go, and on until the thing has
 * left the hand. A weapon with no gauge goes on the press. */
function throwIt(bench: Bench, gauge: number): void {
  const { engine, heard } = bench
  engine.battle.setFiring(true, true)
  stepUntil(
    bench,
    () => heard.some((event) => event.kind === 'fired'),
    'the throw leaves the hand',
    () => engine.battle.setFiring((engine.battle.charging() ?? 1) < gauge, false)
  )
  engine.battle.setFiring(false, false)
}

const blastsHeard = ({ heard }: Bench): Burst[] =>
  heard.flatMap((event) =>
    event.kind === 'blasted' ? [{ at: event.at, effect: event.effect, step: 0 }] : []
  )

const popped = ({ heard }: Bench): boolean => heard.some((event) => event.kind === 'gasPopped')

const allDown = ({ engine }: Bench): boolean => engine.grenades.live() === 0 && engine.tumbles.live() === 0

/** A throw at a full gauge, read the step it leaves: its speed and pitch less the
 * gravity of its own age, and how long it has to burn. */
async function launchOf(skill: Skill): Promise<{ speed: number; pitch: number; frames: number }> {
  const bench = await openBench()
  clearTheStrip(bench)
  takeUp(bench, skill, false)
  throwIt(bench, FULL_GAUGE)
  const [shot] = bench.engine.grenades.all()
  const vy = shot.vy - PLAIN_GRAVITY * shot.age
  return {
    speed: Math.hypot(shot.vx, vy, shot.vz) / fromExeSpeed(1),
    pitch: Math.atan2(-vy, Math.hypot(shot.vx, shot.vz)),
    frames: (shot.fuse + shot.age) / EXE_FRAME_SECONDS
  }
}

/** The throw with nobody near it: where it all goes off. */
async function flightOf(skill: Skill): Promise<Flight> {
  const bench = await openBench()
  const { engine, heard } = bench
  clearTheStrip(bench)
  takeUp(bench, skill, true)
  throwIt(bench, HALF_GAUGE)
  const bursts: Burst[] = []
  let children: Lobbed[] = []
  let comeDown: Point | null = null
  let step = 0
  stepUntil(
    bench,
    () => allDown(bench),
    `skill ${skill} goes off and everything it let go comes down`,
    () => {
      step += 1
      const all = blastsHeard(bench)
      const [shot] = engine.grenades.all()
      if (comeDown === null && shot !== undefined && shot.vy > 0) {
        const centre = originY(restingY(engine.query, shot.x, shot.z), bench.pig.body)
        if (shot.y >= centre) comeDown = { x: shot.x, y: shot.y, z: shot.z }
      }
      if (bursts.length === 0 && (all.length > 0 || popped(bench))) {
        children = engine.grenades.all().map((one) => ({ ...one }))
      }
      for (const burst of all.slice(bursts.length)) bursts.push({ ...burst, step })
    }
  )
  const pops = heard.flatMap((event) => (event.kind === 'gasPopped' ? [event.at] : []))
  const ends = [...bursts.map(({ at }) => at), ...pops]
  if (comeDown === null) throw new Error(`skill ${skill} never came down past a pig's height`)
  return {
    bursts,
    clouds: heard.flatMap((event) => (event.kind === 'gasPuffed' ? [event.at] : [])),
    end: ends[ends.length - 1],
    children,
    comeDown
  }
}

/** What the bus says this dummy went through. */
function reportOn({ engine, heard }: Bench, dummy: Pig): Struck {
  return {
    damage: heard.flatMap((event) =>
      event.kind === 'damaged' && event.pig === dummy.id && event.blow === true ? [event.amount] : []
    ),
    healed: heard.flatMap((event) => (event.kind === 'healed' && event.pig === dummy.id ? [event.amount] : [])),
    throws: heard.flatMap((event) =>
      event.kind === 'flung' && event.pig === dummy.id
        ? [Math.hypot(event.vx, event.vy, event.vz) / fromExeSpeed(1)]
        : []
    ),
    health: dummy.health,
    poisoned: engine.poison.poisoned(dummy),
    clips: heard.flatMap((event) => (event.kind === 'clip' && event.pig === dummy.id ? [event.index] : []))
  }
}

/** The bursts that come on one step, together: they are stood on at once. */
function byStep(bursts: Burst[]): Burst[][] {
  const groups: Burst[][] = []
  for (const burst of bursts) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last[0].step === burst.step) last.push(burst)
    else groups.push([burst])
  }
  return groups
}

/** The dummy stood where the throw goes off. When it lets children go, the flight of the
 * blast before is called off and the dummy stood where the next one comes down, so each
 * burst is measured at its own core: nothing a child does reads where the dummy is.
 * `groups` are the bursts to stand on, in turn; two on one step are stood between. */
async function atTheCore(
  skill: Skill,
  flight: Flight,
  health: number = STOUT,
  groups: Burst[][] = byStep(flight.bursts)
): Promise<Struck> {
  const bench = await openBench()
  const { engine, dummies } = bench
  const [target] = dummies
  clearTheStrip(bench, [target])
  const standOn = (group: Burst[]): void => {
    const x = group.reduce((sum, { at }) => sum + at.x, 0) / group.length
    const z = group.reduce((sum, { at }) => sum + at.z, 0) / group.length
    standAt(bench, target, x, z)
  }
  if (groups.length > 0) standOn(groups[0])
  else standAt(bench, target, flight.end.x, flight.end.z)
  target.health = health
  takeUp(bench, skill, true)
  throwIt(bench, HALF_GAUGE)
  let next = 1
  let heardSoFar = 0
  stepUntil(
    bench,
    () => allDown(bench),
    `skill ${skill} goes off on the dummy and it comes down`,
    () => {
      const count = blastsHeard(bench).length
      if (count === heardSoFar) return
      heardSoFar = count
      if (next >= groups.length) return
      engine.tumbles.clear()
      standOn(groups[next])
      next += 1
    }
  )
  return reportOn(bench, target)
}

/** How far this spot is from the nearest of what goes off. */
const nearest = (from: Point[], x: number, y: number, z: number): number =>
  Math.min(...from.map((at) => Math.hypot(x - at.x, y - at.y, z - at.z)))

/**
 * Stand a dummy off to one side of `end`, as far along z as keeps its body's centre
 * this far from the nearest of `from`, on whatever ground is there.
 */
function standOff(bench: Bench, dummy: Pig, from: Point[], end: Point, side: number, distance: number): void {
  const { engine } = bench
  const away = (off: number): number => {
    const z = end.z + side * off
    return nearest(from, end.x, originY(restingY(engine.query, end.x, z), dummy.body), z)
  }
  let off = 0
  while (away(off + 1) <= distance) off += 1
  standAt(bench, dummy, end.x, end.z + side * off)
}

/** One dummy a unit inside this rim, and one a unit outside it, at the first burst. */
async function atTheRim(
  skill: Skill,
  flight: Flight,
  rim: number,
  health: number = STOUT
): Promise<{ inside: Struck; outside: Struck }> {
  const bench = await openBench()
  const [inside, outside] = bench.dummies
  clearTheStrip(bench, [inside, outside])
  const gas = flight.clouds.length > 0
  const from = gas ? flight.clouds : [flight.bursts[0].at]
  const end = gas ? flight.end : flight.bursts[0].at
  standOff(bench, inside, from, end, 1, rim - 1)
  standOff(bench, outside, from, end, -1, rim + 2)
  inside.health = health
  outside.health = health
  takeUp(bench, skill, true)
  throwIt(bench, HALF_GAUGE)
  stepUntil(
    bench,
    () => blastsHeard(bench).length > 0 || popped(bench),
    `skill ${skill} goes off`
  )
  return { inside: reportOn(bench, inside), outside: reportOn(bench, outside) }
}

test.beforeEach(() => {
  test.skip(!benchInstalled(), `no game install at ${GAME_DIR}`)
})

test('19 GRENADE: 300 a frame, a 153-frame fuse, 30 points at the core', async () => {
  const { speed, frames } = await launchOf(GRENADE)
  // exe: weapons/gas.md, 0x4C2030: kind 24 runs at 300 a frame at a full charge.
  expect(speed).toBeCloseTo(300, 6)
  // exe: weapons/gas.md, 0x436A62: arming 3 + fuse 150 + `rand & 7`.
  expect(frames).toBeGreaterThanOrEqual(153)
  expect(frames).toBeLessThanOrEqual(160)

  const flight = await flightOf(GRENADE)
  // exe: weapons/fire/phantom-sweep.md, 0x432E51: effect 0x54, and one burst.
  expect(flight.bursts.map(({ effect }) => effect)).toEqual([0x54])

  const core = await atTheCore(GRENADE, flight)
  // exe: weapons/fire/damage.md, 0x48CC33: 3840 is 30 points inside 512 units.
  expect(core.damage).toEqual([30])
  expect(STOUT - core.health).toBe(30)
  // DIFFERS, #213: the remake has the throw's falloff keep the damage's core, so
  // this is the whole 2600 / 30. exe: weapons/fire/phantom-sweep.md, 0x40A500: it runs
  // from the burst, 1 - 3d/4R with R the row's 1024, so 78.2 from the 133.5 to the
  // body's centre.
  expect(core.throws).toHaveLength(1)
  expect(core.throws[0]).toBeCloseTo(2600 / 30, 3)

  const { inside, outside } = await atTheRim(GRENADE, flight, 1109)
  // DIFFERS, #212: the remake's divisor is 1024 + 85 - 512, and it rounds. exe:
  // weapons/fire/blast-range-and-rim.md, 0x48CC46, 0x405710: a pig's term is 147, so
  // 659; 0x477C4A: the points are cut, so 9 at this distance.
  expect(inside.damage).toEqual([8])
  // DIFFERS, #213: the same falloff as the core's. exe:
  // weapons/fire/phantom-sweep.md, 0x40A500: 16.3 at this distance.
  expect(inside.throws).toHaveLength(1)
  expect(inside.throws[0]).toBeCloseTo(21.8, 0)
  // The remake's rim. exe: weapons/fire/phantom-sweep.md, 0x409EF0: a sphere of the row's
  // radius; weapons/fire/blast-range-and-rim.md, 0x405710: a pig is 85 across its axes.
  // That the two add is inferred: the sweep's fine test is not read.
  expect(outside.damage).toEqual([])
  expect(outside.throws).toEqual([])
})

test('20 CLUSTER GRENADE: the grenade, then five bomblets of 15 points at 250 a frame', async () => {
  const { speed, frames } = await launchOf(CLUSTER_GRENADE)
  // exe: weapons/gas.md, 0x4C2030: kind 25 is kind 24's row.
  expect(speed).toBeCloseTo(300, 6)
  expect(frames).toBeGreaterThanOrEqual(153)
  expect(frames).toBeLessThanOrEqual(160)

  const flight = await flightOf(CLUSTER_GRENADE)
  // exe: weapons/cluster.md, 0x43290E: effect 0x46, then five that go off with 0x47
  // (0x433038).
  expect(flight.bursts.map(({ effect }) => effect)).toEqual([0x46, 0x47, 0x47, 0x47, 0x47, 0x47])
  // exe: weapons/cluster.md, 0x432C04: the five leave at the row's 250 at a full charge,
  // each on its own fuse (0x4C2030 + 33 × 40: arming 3, fuse 150, `rand & 7`).
  expect(flight.children).toHaveLength(5)
  for (const child of flight.children) {
    expect(Math.hypot(child.vx, child.vy, child.vz) / fromExeSpeed(1)).toBeCloseTo(250, 6)
    expect(child.fuse / EXE_FRAME_SECONDS).toBeGreaterThanOrEqual(153)
    expect(child.fuse / EXE_FRAME_SECONDS).toBeLessThanOrEqual(160)
  }
  const pitches = flight.children.map((child) => Math.atan2(-child.vy, Math.hypot(child.vx, child.vz)))
  // exe: weapons/cluster.md, 0x432AAE: one dead vertical at 0x400; 0x4329C1: four at 0x3E8.
  expect(pitches[0]).toBeCloseTo((0x400 / TURN) * 2 * Math.PI, 6)
  for (const pitch of pitches.slice(1)) expect(pitch).toBeCloseTo((0x3e8 / TURN) * 2 * Math.PI, 6)
  // exe: weapons/cluster.md, 0x4329C1: the four a quarter turn apart. Measured between
  // themselves: the note has their first yaw two ways, and this strip runs along an axis.
  const ring = flight.children.slice(1).map((child) => Math.atan2(child.vx, child.vz))
  for (let i = 1; i < ring.length; i++) {
    const apart = Math.abs(Math.atan2(Math.sin(ring[i] - ring[i - 1]), Math.cos(ring[i] - ring[i - 1])))
    expect(apart).toBeCloseTo(Math.PI / 2, 6)
  }
  // exe: weapons/cluster.md, 0x432C04: heights stepped 40, the vertical last and highest.
  const heights = flight.children.map((child) => flight.bursts[0].at.y - child.y).map(Math.round)
  expect(heights).toEqual([160, 0, 40, 80, 120])

  const core = await atTheCore(CLUSTER_GRENADE, flight)
  // exe: weapons/cluster.md, 0x43290E: the grenade's 30; 0x433038: 15 for each of five,
  // "worst case on one body: 30 + 5×15".
  expect(core.damage).toEqual([30, 15, 15, 15, 15, 15])
  expect(STOUT - core.health).toBe(105)
  // DIFFERS, #213: each the whole force / 30. exe: weapons/fire/phantom-sweep.md,
  // 0x40A500: 1 - 3d/4R from the burst. Force: weapons/cluster.md, 0x43290E 2600;
  // the bomblet's row (0x4C2030 + 33 × 40) carries 1300 in the same place.
  expect(core.throws).toHaveLength(6)
  expect(core.throws[0]).toBeCloseTo(2600 / 30, 3)
  for (const thrown of core.throws.slice(1)) expect(thrown).toBeCloseTo(1300 / 30, 3)

  const { inside, outside } = await atTheRim(CLUSTER_GRENADE, flight, 1109)
  // DIFFERS, #212: as 19. exe: weapons/fire/blast-range-and-rim.md, 0x48CC46: 9.
  expect(inside.damage).toEqual([8])
  expect(outside.damage).toEqual([])
})

test('21 HIGH EXPLOSIVE: 300 a frame, 60 points at the core over a 1536 field', async () => {
  const { speed, frames } = await launchOf(HIGH_EXPLOSIVE)
  // exe: weapons/gas.md, 0x4C2030: kind 29 runs at 300 a frame.
  expect(speed).toBeCloseTo(300, 6)
  // exe: weapons/gas.md, 0x436A62: arming 3 + fuse 150 + `rand & 7`.
  expect(frames).toBeGreaterThanOrEqual(153)
  expect(frames).toBeLessThanOrEqual(160)

  const flight = await flightOf(HIGH_EXPLOSIVE)
  expect(flight.bursts).toHaveLength(1)

  const core = await atTheCore(HIGH_EXPLOSIVE, flight)
  // exe: weapons/fire/damage.md, 0x48CC33: 7680 is 60 points inside 512 units.
  expect(core.damage).toEqual([60])
  expect(STOUT - core.health).toBe(60)
  // DIFFERS, #213: the whole 3900 / 30. exe: weapons/fire/phantom-sweep.md,
  // 0x40A500: 1 - 3d/4R with R 1536, so 121.5 from the 133.5 to the body's centre.
  expect(core.throws).toHaveLength(1)
  expect(core.throws[0]).toBeCloseTo(3900 / 30, 3)

  const { inside, outside } = await atTheRim(HIGH_EXPLOSIVE, flight, 1621)
  // DIFFERS, #212: the remake's divisor is 1536 + 85 - 512, and it rounds. exe:
  // weapons/fire/blast-range-and-rim.md, 0x48CC46, 0x405710: 1171; 0x477C4A: 17 here.
  expect(inside.damage).toEqual([15])
  expect(outside.damage).toEqual([])
  expect(outside.throws).toEqual([])
})

test('22 ROLLER: 300 a frame, 40 points at the core over a 1024 field', async () => {
  const { speed, frames } = await launchOf(ROLLER)
  // exe: weapons/gas.md, 0x4C2030: kind 31 runs at 300 a frame.
  expect(speed).toBeCloseTo(300, 6)
  // exe: weapons/gas.md, 0x436A62: arming 3 + fuse 150 + `rand & 7`.
  expect(frames).toBeGreaterThanOrEqual(153)
  expect(frames).toBeLessThanOrEqual(160)

  const flight = await flightOf(ROLLER)
  expect(flight.bursts).toHaveLength(1)

  const core = await atTheCore(ROLLER, flight)
  // exe: weapons/fire/damage.md, 0x48CC33: 5120 is 40 points inside 512 units.
  expect(core.damage).toEqual([40])
  expect(STOUT - core.health).toBe(40)
  // DIFFERS, #213: the whole 2600 / 30. exe: weapons/fire/phantom-sweep.md,
  // 0x40A500: 78.2 from the 133.5 to the body's centre.
  expect(core.throws).toHaveLength(1)
  expect(core.throws[0]).toBeCloseTo(2600 / 30, 3)

  const { inside, outside } = await atTheRim(ROLLER, flight, 1109)
  // DIFFERS, #212: as 19. exe: weapons/fire/blast-range-and-rim.md, 0x48CC46: 12.
  expect(inside.damage).toEqual([10])
  expect(outside.damage).toEqual([])
  expect(outside.throws).toEqual([])
})

test('26 POISON: 300 a frame, a stream of clouds, 15 flat once a throw and the bit, nobody thrown', async () => {
  const { speed, frames } = await launchOf(POISON)
  // exe: weapons/gas.md, 0x4C2030: kind 28 runs at 300 a frame.
  expect(speed).toBeCloseTo(300, 6)
  // exe: weapons/gas.md, 0x436A62: arming 3 + fuse 150 + `rand & 7`.
  expect(frames).toBeGreaterThanOrEqual(153)
  expect(frames).toBeLessThanOrEqual(160)

  const flight = await flightOf(POISON)
  // exe: weapons/gas.md, 0x432D2C: "no 0x54 blast on the gas family".
  expect(flight.bursts).toEqual([])
  // exe: weapons/gas.md, 0x4365A2: a cloud every 5th frame from frame 15, and 0x432D2C one
  // last at the pop: 15 to 150 is 28, on this seed's fuse of 153 frames.
  expect(flight.clouds).toHaveLength(29)

  const core = await atTheCore(POISON, flight)
  // exe: weapons/gas.md, 0x477B25: 1920 is 15 points flat, once a throw however many
  // clouds wash over it; `[pig+0x3B1]`, cleared at 0x46965E.
  expect(core.damage).toEqual([15])
  expect(STOUT - core.health).toBe(15)
  expect(core.poisoned).toBe(true)
  // exe: weapons/gas.md, 0x477B25: clip 0x25, "Sneeze".
  expect(core.clips).toContain(37)
  // exe: weapons/gas.md, 0x4C2030: force 0, and the phantom's flags let it push nobody.
  expect(core.throws).toEqual([])

  const { inside, outside } = await atTheRim(POISON, flight, 597)
  // exe: weapons/gas.md, 0x477B25: flat, whatever the distance: the falloff is the gate.
  expect(inside.damage).toEqual([15])
  expect(inside.poisoned).toBe(true)
  // The remake's rim; the sweep's edge as in 19: the fine test is not read.
  expect(outside.damage).toEqual([])
  expect(outside.poisoned).toBe(false)
})

test('27 SUPER GRENADE: 300 a frame, 30 points at the core over a 1024 field', async () => {
  const { speed, frames } = await launchOf(SUPER_GRENADE)
  // exe: weapons/gas.md, 0x4C2030: kind 32 runs at 300 a frame.
  expect(speed).toBeCloseTo(300, 6)
  // exe: weapons/gas.md, 0x436A62: arming 3 + fuse 150 + `rand & 7`.
  expect(frames).toBeGreaterThanOrEqual(153)
  expect(frames).toBeLessThanOrEqual(160)

  const flight = await flightOf(SUPER_GRENADE)
  expect(flight.bursts).toHaveLength(1)

  const core = await atTheCore(SUPER_GRENADE, flight)
  // exe: weapons/fire/damage.md, 0x48CC33: 3840 is 30 points inside 512 units.
  expect(core.damage).toEqual([30])
  expect(STOUT - core.health).toBe(30)
  // DIFFERS, #213: as 19.
  expect(core.throws).toHaveLength(1)
  expect(core.throws[0]).toBeCloseTo(2600 / 30, 3)

  const { inside, outside } = await atTheRim(SUPER_GRENADE, flight, 1109)
  // DIFFERS, #212: as 19. exe: weapons/fire/blast-range-and-rim.md, 0x48CC46: 9.
  expect(inside.damage).toEqual([8])
  expect(outside.damage).toEqual([])
  expect(outside.throws).toEqual([])
})

test('28 MORTAR: no gauge, 45° at its floor, 50 points at the core, then three sub-shells of 20', async () => {
  const { speed, pitch, frames } = await launchOf(MORTAR)
  // `[play]`, docs/facts/weapons/mortar.md: the no-gauge lob flies at the row's own speed.
  // exe: weapons/cluster.md, 0x4C26C0: 500 a frame. That the charge becomes the full one is
  // the hole that note names: the press writes a 1 (0x493A98).
  expect(speed).toBeCloseTo(500, 6)
  // exe: weapons/cluster.md, 0x46A86D: 0x200 is its floor.
  expect(pitch).toBeCloseTo((AIM_LOB / TURN) * 2 * Math.PI, 6)
  // exe: weapons/cluster.md, 0x43200C: arming 0 and a2 0 is state 2, nothing counts it.
  expect(frames).toBe(Number.POSITIVE_INFINITY)

  const flight = await flightOf(MORTAR)
  // exe: weapons/cluster.md, 0x4339A6: effect 0x58; 0x433249: its children's 0x4A.
  expect(flight.bursts.map(({ effect }) => effect)).toEqual([0x58, 0x4a, 0x4a, 0x4a])
  // exe: weapons/cluster.md, 0x4339A6: three at the row's 250 and aim 0x3B6, a third of a
  // turn apart off the shell's own yaw, heights stepped 40, the camera's third first.
  expect(flight.children).toHaveLength(3)
  for (const child of flight.children) {
    expect(Math.hypot(child.vx, child.vy, child.vz) / fromExeSpeed(1)).toBeCloseTo(250, 6)
    expect(Math.atan2(-child.vy, Math.hypot(child.vx, child.vz))).toBeCloseTo((0x3b6 / TURN) * 2 * Math.PI, 6)
  }
  const [third, first, second] = flight.children
  const apart = (0x555 / TURN) * 2 * Math.PI
  expect(second.heading - first.heading).toBeCloseTo(apart, 6)
  expect(third.heading - second.heading).toBeCloseTo(apart, 6)
  const heights = flight.children.map((child) => flight.bursts[0].at.y - child.y).map(Math.round)
  expect(heights).toEqual([80, 0, 40])

  // The three come down far apart at this aim, and two of them on one step, so each is
  // stood on in a battle of its own.
  const [shell, ...subShells] = flight.bursts
  for (const subShell of subShells) {
    const core = await atTheCore(MORTAR, flight, STOUT, [[shell], [subShell]])
    // exe: weapons/cluster.md, 0x4339A6: 6400 is 50 points; 0x433249: 2560 is 20.
    expect(core.damage).toEqual([50, 20])
    expect(STOUT - core.health).toBe(70)
    // DIFFERS, #213: each the whole force / 30. exe: weapons/fire/phantom-sweep.md,
    // 0x40A500: 1 - 3d/4R from the burst. Force: weapons/cluster.md, 0x4C26C0 3900;
    // 0x4C21E8 1300.
    expect(core.throws).toHaveLength(2)
    expect(core.throws[0]).toBeCloseTo(3900 / 30, 3)
    expect(core.throws[1]).toBeCloseTo(1300 / 30, 3)
  }

  const { inside, outside } = await atTheRim(MORTAR, flight, 2133)
  // exe: weapons/fire/blast-range-and-rim.md, 0x48CC46: 1683, so 13 here; the remake's
  // 1621 rounds to the same 13.
  expect(inside.damage).toEqual([13])
  expect(outside.damage).toEqual([])
  expect(outside.throws).toEqual([])
})

test('28 MORTAR and 29 BAZOOKA go through a dummy in the way, DIFFERS from the exe (#214)', async () => {
  for (const skill of [MORTAR, BAZOOKA]) {
    const flight = await flightOf(skill)
    const landed = flight.bursts[0].at

    const bench = await openBench()
    const [target] = bench.dummies
    clearTheStrip(bench, [target])
    // Where the round, coming down, is at the height of the body's centre.
    standAt(bench, target, flight.comeDown.x, flight.comeDown.z)
    target.health = STOUT
    takeUp(bench, skill, true)
    throwIt(bench, HALF_GAUGE)
    stepUntil(bench, () => blastsHeard(bench).length > 0, `skill ${skill} goes off`)
    const [burst] = blastsHeard(bench)
    // DIFFERS, #214: the remake's round meets only the ground, so it lands where it
    // lands with nobody there. exe: weapons/cluster.md, 0x438462: state 2 goes to 6 on
    // touching a body, unless that is a projectile or an effect.
    expect(burst.at.x).toBeCloseTo(landed.x, 3)
    expect(burst.at.y).toBeCloseTo(landed.y, 3)
    expect(burst.at.z).toBeCloseTo(landed.z, 3)
  }
})

test('29 BAZOOKA: 500 a frame, no fuse, 40 points at the core over a 2048 field', async () => {
  const { speed, frames } = await launchOf(BAZOOKA)
  // exe: weapons/fire/bazooka.md, 0x4C2030 + 10 × 40: 500 a frame at a full charge.
  expect(speed).toBeCloseTo(500, 6)
  // exe: weapons/fire/bazooka.md, 0x43200C: arming 0 and low byte 0 is state 2, and
  // 0x436150 counts nothing down.
  expect(frames).toBe(Number.POSITIVE_INFINITY)

  const flight = await flightOf(BAZOOKA)
  expect(flight.bursts).toHaveLength(1)

  const core = await atTheCore(BAZOOKA, flight)
  // exe: weapons/fire/bazooka.md, 0x4C2030 + 10 × 40: 5120 is 40 points;
  // weapons/fire/damage.md, 0x48CC33: whole inside 512 units.
  expect(core.damage).toEqual([40])
  expect(STOUT - core.health).toBe(40)
  // DIFFERS, #213: the whole 3900 / 30. exe: weapons/fire/phantom-sweep.md,
  // 0x40A500: 1 - 3d/4R with R 2048, so 123.6 from the 133.5 to the body's centre.
  expect(core.throws).toHaveLength(1)
  expect(core.throws[0]).toBeCloseTo(3900 / 30, 3)

  const { inside, outside } = await atTheRim(BAZOOKA, flight, 2133)
  // DIFFERS, #212: the remake's divisor is 2048 + 85 - 512, and it rounds. exe:
  // weapons/fire/blast-range-and-rim.md, 0x48CC46, 0x405710: 1683; 0x477C4A: 11 here.
  expect(inside.damage).toEqual([10])
  expect(outside.damage).toEqual([])
  expect(outside.throws).toEqual([])
})

test('33 MEDICINE BALL: 300 a frame, a 152-frame fuse, 40 points put back and nobody thrown', async () => {
  const { speed, frames } = await launchOf(MEDICINE_BALL)
  // exe: weapons/medic.md, 0x4C25F8: 300 a frame at a full charge.
  expect(speed).toBeCloseTo(300, 6)
  // exe: weapons/medic.md, 0x4C25F8: arming 2 + fuse 150 + `rand & 7`.
  expect(frames).toBeGreaterThanOrEqual(152)
  expect(frames).toBeLessThanOrEqual(159)

  const flight = await flightOf(MEDICINE_BALL)
  // exe: weapons/medic.md, 0x4331D1: effect 0x60.
  expect(flight.bursts.map(({ effect }) => effect)).toEqual([0x60])

  // A grunt on its last point, with all of the forty missing.
  const core = await atTheCore(MEDICINE_BALL, flight, 1)
  // exe: weapons/medic.md, 0x4778C6: min(missing, falloff), forty at the centre.
  expect(core.healed).toEqual([40])
  expect(core.health).toBe(41)
  expect(core.damage).toEqual([])
  // exe: weapons/medic.md, 0x4C25F8: force 0; Init 0x489A00: no push.
  expect(core.throws).toEqual([])

  // Five points short: the clamp to what is missing.
  const bench = await openBench()
  const ceiling = maxHealthFor(bench.dummies[0].pigClass)
  const nearlyWhole = await atTheCore(MEDICINE_BALL, flight, ceiling - 5)
  // exe: weapons/medic.md, 0x4778C6: min(missing, falloff).
  expect(nearlyWhole.healed).toEqual([5])
  expect(nearlyWhole.health).toBe(ceiling)

  const { inside, outside } = await atTheRim(MEDICINE_BALL, flight, 2133, 1)
  // DIFFERS, #212: the remake's divisor is 2048 + 85 - 512, and it rounds. exe:
  // weapons/fire/blast-range-and-rim.md, 0x48CC46, 0x405710: 1683; weapons/medic.md,
  // 0x4778C6: the falloff, cut to whole points at 0x47790A: 11 here.
  expect(inside.healed).toEqual([10])
  expect(outside.healed).toEqual([])
})
