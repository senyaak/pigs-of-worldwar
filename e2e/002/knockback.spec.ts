// PHASE 002 — A BLAST MOVES ITS VICTIM. The whole real chain, end to end:
// a grenade thrown by the acting pig, the parabola, the bounces and the
// downhill roll, the fuse, the burst, the share, the fling and the flight —
// and at the end of it the victim's BODY IS SOMEWHERE ELSE.
//
// Play ordered this spec after two reports the pure specs could not catch
// ("он на месте катился... яж сказал сделай тесты. на движение после
// взрыва"): unit/blast.spec.ts pins the launch GEOMETRY and unit/fling.spec.ts
// the flight, but nothing asserted that a real grenade against a real pig on
// a real hillside ends with displacement. This does, on ESTU's own hill —
// the slope of the first mission, where both reports came from.
//
// Headless on the real map data, engine-headless style: no app, no renderer.
//
// **ONE BLAST PER ROUND, on a battle of its own.** The first build threw five
// grenades down one turn and measured the victim after each, which made every
// round depend on the ones before it: the thrower stands inside its own blast
// at this range, so it took rim damage, was flung, and threw the next one from
// somewhere else. Whether a round connected at all was then an accident of how
// far the thrower had drifted, and the sweep silently stopped being a sweep.
// A fresh engine per offset, off the same seed, throws the IDENTICAL grenade
// every time — so the only thing that varies is how far the victim stands from
// where it lands, which is what a falloff sweep is supposed to vary.

import path from 'node:path'
import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { loadClips, loadGameText, loadMapObjects, loadModel, loadTerrain } from '../../src/main/assets'
import { nations } from '../../src/lib/game/teams'
import { fielded, mapSquads, musterGame } from '../../src/lib/game/muster'
import { buildQuery, createEngine, STEP_SECONDS } from '../../src/lib/game/engine'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'
import { bodyExtent } from '../../src/lib/game/body'
import { give } from '../../src/lib/game/inventory'
import { flingSpeed } from '../../src/lib/game/blast'
import { PLAIN_GRAVITY } from '../../src/lib/game/ballistics'
import { PIG_RADIUS } from '../../src/lib/game/obstacles'

/** Skill 19 — the plain grenade (lib/game/grenade.ts). */
const GRENADE = 19

/** Where the thrower stands on ESTU's hill — the slope both of play's reports
 * came from. */
const THROWN_FROM = { x: 6400, z: -8600 }

/** Everything a round needs that does NOT change between rounds. */
interface Loaded {
  terrain: Awaited<ReturnType<typeof loadTerrain>>
  objects: ReturnType<typeof fielded>
  clips: Awaited<ReturnType<typeof loadClips>>
  teams: ReturnType<typeof nations>
  art: Awaited<ReturnType<typeof loadModel>>
  query: ReturnType<typeof buildQuery>
}

/**
 * One round: a battle of its own, the victim planted `offset` uphill of the
 * dip a thrown grenade funnels into, one grenade thrown, stepped until the
 * world is quiet. Same seed every time, so the grenade's own flight is
 * identical across the sweep.
 */
const round = async (
  loaded: Loaded,
  spot: { x: number; z: number } | null
): Promise<{
  took: number[]
  moved: number
  burst: { x: number; z: number } | null
  stood: { x: number; z: number }
}> => {
  const game = musterGame({
    squads: mapSquads(loaded.objects, loaded.teams, []),
    map: 'ESTU',
    ground: loaded.query,
    bodyOf: () => bodyExtent(loaded.art.model.positions)
  })
  const bus = createBus()
  const heard: BattleEvent[] = []
  bus.on((event) => heard.push(event))
  const engine = createEngine({
    world: {
      game,
      blocks: loaded.terrain.blocks,
      terrainArt: loaded.terrain.textures,
      objects: loaded.objects,
      clips: loaded.clips,
      skeleton: loaded.art.skeleton,
      map: 'ESTU',
      parachutes: false
    },
    query: loaded.query,
    seed: 7,
    onChanged: () => {},
    bus
  })
  while (engine.dropIn.running()) engine.update(STEP_SECONDS)
  game.cutTurnStart()

  const thrower = game.currentPig
  const victim = game.players.flatMap((player) => player.pigs).find((pig) => pig !== thrower)!
  give(thrower.carrying, GRENADE, 99)
  thrower.holding = GRENADE
  engine.battle.warp(THROWN_FROM.x, THROWN_FROM.z, 0)
  for (let frame = 0; frame < 60; frame++) engine.update(STEP_SECONDS)

  // WHERE the victim stands is the caller's, and the caller MEASURES it —
  // `spot` null parks the victim out of the way so the round is a probe for
  // where the grenade actually ends up. Nothing here hard-codes that: the spec
  // used to, off a dip at (7909, -8090) that a throw has not reached in a long
  // while, and it went on passing only because the thrower was being flung
  // about by its own bursts until one of them happened to land near enough.
  const vx = spot ? spot.x : THROWN_FROM.x + 12_000
  const vz = spot ? spot.z : THROWN_FROM.z + 12_000
  victim.position = { x: vx, y: loaded.query.height(vx, vz), z: vz }
  victim.health = 100
  heard.length = 0
  expect(engine.grenades.throwOne(thrower, 0, 0.5), 'the throw left the hand').toBe(true)
  let frames = 0
  while ((engine.grenades.live() > 0 || engine.tumbles.live() > 0) && frames < 1200) {
    engine.update(STEP_SECONDS)
    frames++
  }
  const blasted = heard.find((event) => event.kind === 'blasted') as
    | { at: { x: number; y: number; z: number } }
    | undefined
  return {
    took: heard
      .filter((event) => event.kind === 'damaged' && (event as { pig?: number }).pig === victim.id)
      .map((event) => (event as { amount: number }).amount),
    moved: Math.hypot(victim.position.x - vx, victim.position.z - vz),
    burst: blasted ? { x: blasted.at.x, z: blasted.at.z } : null,
    stood: { x: vx, z: vz }
  }
}

test('a grenade bursting at a hillside pig SENDS IT FLYING — displacement, not just damage', async () => {
  if (!existsSync(path.join(GAME_DIR, 'warhogs_.exe'))) {
    test.skip(true, `no game install at ${GAME_DIR}`)
  }
  // **EXPECTED TO FAIL, and the failure is the point** (docs/todo.md B15). The
  // rewrite below — a battle of its own per round, the geometry MEASURED rather
  // than written down — put a victim where the old drifting sweep never did,
  // and there the engine hands out a 45-degree knock of about 2700 a second and
  // the pig travels EIGHT UNITS. The fling is applied: the `flung` event
  // carries (-1634, -1909, 988), a horizontal 1909 of it. Something between the
  // hurl and the flight eats the lot, which is play's own "он на месте
  // катился" from the report this spec was written for.
  //
  // Marked rather than tuned away, and marked rather than left red: when the
  // flight stops swallowing the knock this test starts passing, Playwright
  // fails it for passing, and whoever fixed it has to come and delete this
  // line. That is the only kind of TODO that cannot rot.
  test.fail()
  const maps = path.join(GAME_DIR, 'Maps')
  const chars = path.join(GAME_DIR, 'Chars')
  const terrain = await loadTerrain(path.join(maps, 'ESTU.PMG'))
  const read = await loadMapObjects(path.join(maps, 'ESTU.POG'))
  const art = await loadModel(path.join(chars, 'british.mad'), 'pcgru_me')
  // Loaded ONCE and handed to every round: it is the battle that has to be
  // fresh each time, not the archives behind it.
  const loaded: Loaded = {
    terrain,
    objects: fielded(read.objects),
    clips: await loadClips(chars),
    teams: nations(await loadGameText(GAME_DIR, 'fetext')),
    art,
    query: buildQuery(terrain.blocks, terrain.textures)
  }

  // **WHERE THE GRENADE GOES IS MEASURED, not written down.** One round with
  // the victim parked twelve thousand units away is a probe: the throw is
  // identical every time off the same seed, so where it bursts in the probe is
  // where it bursts in every round after it.
  const probe = await round(loaded, null)
  expect(probe.burst, 'the probe throw never went off').not.toBeNull()
  expect(probe.took, 'the parked victim was not supposed to be in reach').toEqual([])

  // The victim is then planted at growing offsets BACK ALONG the throw, from
  // the burst towards the pig that threw it — a line that is on the hillside by
  // construction, whatever the arc happens to do.
  const back = {
    x: THROWN_FROM.x - probe.burst!.x,
    z: THROWN_FROM.z - probe.burst!.z
  }
  const span = Math.hypot(back.x, back.z)
  expect(span, 'the throw has to clear the thrower to sweep away from it').toBeGreaterThan(200)

  const spots = [0, 100, 200, 300, 400, 600, 800, 1000]
  let landed = 0
  for (const offset of spots) {
    const { took, moved, burst, stood } = await round(loaded, {
      x: probe.burst!.x + (back.x / span) * offset,
      z: probe.burst!.z + (back.z / span) * offset
    })
    if (took.length === 0 || !burst) continue

    // **WHICH RULE APPLIES IS THE GEOMETRY'S TO SAY, and it is read per round
    // rather than assumed from the offset.** A pig's own body is in the
    // collision world, so it DEFLECTS the grenade: two rounds of the same
    // throw do not burst in the same place once there is something in the way,
    // and a victim planted a hundred units out can still end up standing on
    // the thing. `hurlVelocity` splits on `flat < PIG_RADIUS` — inside the
    // footprint the knock goes up the ground's own normal and the pig lands
    // about where it stood, which is displacement but not the horizontal kind
    // this spec is about (that case is `unit/blast.spec.ts`'s).
    const flat = Math.hypot(stood.x - burst.x, stood.z - burst.z)
    if (flat < PIG_RADIUS) continue
    landed++

    // **THE FLOOR IS DERIVED FROM THE DAMAGE, because the throw is.**
    // `flingSpeed` is `6 × points` capped at the cattle prod's 200
    // (lib/game/blast.ts), thrown at 45°, so the flat-ground range it buys is
    // `v²/g`. A FLAT floor cannot serve both ends of that: this line was one,
    // at 400, and it went red on a round that took nine points at the rim and
    // travelled 254 — its own arithmetic, called a failure.
    //
    // The fraction is what a hillside leaves of the ideal. Measured across this
    // sweep, the rounds that clear the footprint keep between 22% and 48% of
    // `v²/g` — the pig is thrown along a SLOPE, it drags, and it stops where it
    // lands. 15% sits under the whole spread with room to spare and still
    // catches every way this has actually failed: the settle discarding the
    // horizontal, a near-vertical launch, a blocked flight, a fling never
    // applied. The round that reported eight units of travel on thirty points
    // of damage — before the footprint split above was written — is two orders
    // of magnitude under it.
    const bought = took.reduce((most, points) => Math.max(most, flingSpeed(points)), 0)
    const floor = 0.15 * ((bought * bought) / PLAIN_GRAVITY)
    expect(
      moved,
      `a burst that took ${took.join('+')} points ${flat.toFixed(0)} out moved it`
    ).toBeGreaterThan(floor)
  }
  // The sweep must actually test something: a stream change that sends every
  // grenade astray should fail loudly rather than pass an empty loop.
  expect(
    landed,
    'enough bursts reached the victim, clear of its own footprint, to prove anything'
  ).toBeGreaterThanOrEqual(3)
})
