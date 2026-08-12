// PHASE 002 — THE BAZOOKA: a rocket with its own model, its own report, and no
// fuse at all.
//
// Play: "продектайл со своей анимацией итд + звук выстрела + урон при касании —
// важно в воде не взрывается, а тонет." All four are in the engine and none of
// them was built: skill 29 was in neither the gun table nor the lob table, so it
// could be taken in hand and did nothing.
//
// Its row is kind **10**, and the field that separates it from every grenade is
// row +0x14 = 0. The constructor branches on that (0x43200c): non-zero starts
// the projectile in state 0, the arming count; nil takes `[proj+0xA2]` — row
// +0x1C's low byte, 0 here — through the table at 0x432590 into **state 2**, and
// states 2 and 3 are the two update arms that do nothing at all. It has no fuse.
// What ends it is the landscape handler, which turns state 2 into state 6 the
// moment it touches anything (0x437f2c) — and the destructor is where the blast
// is. `weapons/fire.md`.

import { expect, test } from '../app'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import { parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import { fuseSeconds, lobOf, isLobbed } from '../../src/lib/game/grenade'
import { blastRange } from '../../src/lib/game/grenade'
import { DAMAGE_UNIT } from '../../src/lib/game/projectile'
import { PROJECTILE_MODEL, SPAWNED_MODELS, projectileModel } from '../../src/lib/game/ammo'
import { BARREL_SOUND, BATTLE_SOUNDS } from '../../src/renderer/src/audio/battle'
import { WEAPON_MODEL, weaponModelName } from '../../src/lib/game/weapons'
import { createLobs } from '../../src/lib/game/lobs'
import { NO_OBSTACLES, PIG_RADIUS } from '../../src/lib/game/obstacles'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'
import { parsePog } from '../../src/lib/formats/pog'
import { targetsOf } from '../../src/lib/game/targets'
import { startGame } from '../menu'
import { beginTurn, press, release, warp } from '../controller'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))

type Page = import('@playwright/test').Page

/** The console's own: no crate on the way to the bazooka carries one. */
const give = (page: Page, skill: number): Promise<boolean> =>
  page.evaluate(
    (s) => (window as unknown as { pow: { give(x: number): boolean } }).pow.give(s),
    skill
  )

const holdingOf = (page: Page): Promise<number | null> =>
  page.evaluate(
    () => (window as unknown as { pow: { debug: { holding(): number | null } } }).pow.debug.holding()
  )

const charging = (page: Page): Promise<number | null> =>
  page.evaluate(
    () => (window as unknown as { pow: { debug: { charging(): number | null } } }).pow.debug.charging()
  )

const dummies = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        window as unknown as { pow: { debug: { props(): { at: { name: string }[] } } } }
      ).pow.debug.props().at.filter((each) => each.name === 'DUMMY').length
  )

const BAZOOKA = 29
const GRENADE = 19

const campQuery = (): TerrainQuery =>
  new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))

test('the row is the exe’s, and it is nothing like a grenade’s', () => {
  const row = lobOf(BAZOOKA)
  expect(row, 'skill 29 lobs something').not.toBeNull()
  expect(isLobbed(BAZOOKA)).toBe(true)
  // Projectile id 398, so kind 10 of the table at 0x4c2030.
  expect(row!.id).toBe(398)
  expect(row!.kind).toBe(10)
  // Five hundred a frame at full charge, where every grenade has three hundred.
  expect(row!.speed).toBe(500)
  expect(row!.speed).toBeGreaterThan(lobOf(GRENADE)!.speed)
  // Forty points at the core — enough to leave a fifty-point grunt with ten.
  expect(row!.damage / DAMAGE_UNIT).toBe(40)
  // …over TNT's reach rather than a grenade's. The RANGE is the row less the
  // exe's own 512 and plus the struck body's radius — `[[body+0x18]+0x4C]+0x0C`
  // at 0x48CC46, which is the pig's collider out of the same shape table its
  // body comes from (lib/game/grenade.ts, `blastReach`).
  expect(row!.blast).toBe(2048)
  expect(blastRange(row!)).toBe(2048 + PIG_RADIUS - 512)
  // And NO FUSE: arming nil is the switch into state 2.
  expect(row!.arming).toBe(0)
  expect(row!.fuse).toBe(0)
  expect(row!.contact, 'the rocket goes off on touch').toBe(true)
  expect(lobOf(GRENADE)!.contact, 'a grenade does not').toBe(false)
  // Nothing counts it down, so nothing may treat its fuse as a number.
  expect(fuseSeconds(row!, () => 0)).toBe(Number.POSITIVE_INFINITY)
  expect(fuseSeconds(lobOf(GRENADE)!, () => 0)).toBeLessThan(11)
})

test('the ROCKET is its own model, and it is not the launcher', () => {
  // Name table row 398 is `WE_BAZZ` (0x4d9680, `START_OF_AMMO` at 387). What is
  // in the HAND for skill 29 is `bazookr`, the launcher — so without the split a
  // fired rocket flew as a second launcher.
  expect(projectileModel(BAZOOKA)).toBe('WE_BAZZ')
  expect(weaponModelName(BAZOOKA)).toBe('bazookr')
  expect(WEAPON_MODEL).toContain('bazookr')
  expect(PROJECTILE_MODEL[BAZOOKA]).toBe('WE_BAZZ')
  // …and it lives in the MAP's archive, so the loader has to be told about it —
  // nothing in the .POG names it.
  expect(SPAWNED_MODELS).toContain('WE_BAZZ')
  // Every other lob still flies as what it was thrown as.
  expect(projectileModel(GRENADE)).toBeNull()
})

test('the REPORT is decoded, not picked', () => {
  // `Sound::Play(0x24, 100, 100)` at 0x47ae9d, and index 36 of `Audio/sfxday.srl`
  // is L_BAZOO.
  expect(BARREL_SOUND[BAZOOKA]).toBe('bazooka')
  expect(BATTLE_SOUNDS.bazooka).toMatchObject({ sound: 'L_BAZOO', volume: 100, pitch: 100 })
})

/** One rocket in the air over CAMP, with nothing to hit but the ground. */
const fireAt = (
  from: { x: number; y: number; z: number },
  aim: number,
  charge = 4095
): { heard: BattleEvent[]; lobs: ReturnType<typeof createLobs> } => {
  const query = campQuery()
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const lobs = createLobs(
    {
      query,
      obstacles: NO_OBSTACLES,
      mines: { buried: () => false, tread: () => false, live: () => 0, at: () => [], update: () => {}, clear: () => {} } as never,
      pose: { boneToWorld: () => from },
      random: () => 0,
      pigs: () => [],
      targets: [],
      present: () => true,
      training: false
    },
    bus.emit
  )
  const pig = { holding: BAZOOKA, heading: 0, position: { ...from } } as never
  expect(lobs.throwOne(pig, aim, charge), 'the rocket left the tube').toBe(true)
  return { heard, lobs }
}

test('it goes off the moment it touches the ground — no bounce, no wait', () => {
  const query = campQuery()
  // A clear patch of the training ground, a body's height up, fired flat.
  const at = { x: -6000, z: 2000 }
  const ground = query.height(at.x, at.z)
  const { heard, lobs } = fireAt({ x: at.x, y: ground - 400, z: at.z }, 0)
  // Four seconds is a long flight and far longer than any hop.
  for (let step = 0; step < 240 && lobs.live() > 0; step++) lobs.update(1 / 60)

  const blasted = heard.filter((one) => one.kind === 'blasted')
  expect(blasted, 'it never went off').toHaveLength(1)
  // …and it went off ONCE, on the FIRST contact. A grenade in the same place
  // would still be bouncing.
  expect(lobs.live(), 'something is still in the air').toBe(0)
  expect(heard.filter((one) => one.kind === 'fired')).toHaveLength(1)
})

test('…and a rocket SKIPS off water exactly as a grenade does', () => {
  // Play, correcting a divergence this file used to carry: "ракеты скачат! как и
  // гранаты! я про потонуть когда нельзя скакать!" There is no special case for
  // a contact weapon on water — the same in-plane speed that skips a grenade
  // skips a rocket, and only what cannot skip goes down.
  const query = campQuery()
  let wet: { x: number; z: number } | null = null
  for (let x = -12000; x < 12000 && !wet; x += 256) {
    for (let z = -12000; z < 12000 && !wet; z += 256) {
      if (query.isWater(x, z)) wet = { x, z }
    }
  }
  expect(wet, 'CAMP has water on it').not.toBeNull()
  // Flat and fast, a hair over the surface: a stone off a pond.
  const { heard, lobs } = fireAt(
    { x: wet!.x, y: query.surface(wet!.x, wet!.z) - 40, z: wet!.z },
    0,
    4095
  )
  for (let step = 0; step < 120; step++) lobs.update(1 / 60)
  const skimmed = heard.findIndex((one) => one.kind === 'skimmed')
  expect(skimmed, 'it went straight in instead of skipping').toBeGreaterThanOrEqual(0)
  // …and the skip itself did not set it off. What it does afterwards is ordinary
  // — a rocket that comes down on LAND goes off there, contact being contact.
  const burst = heard.findIndex((one) => one.kind === 'blasted')
  expect(burst === -1 || burst > skimmed, 'the water set it off').toBe(true)
})

test('…but WATER takes what cannot skip: it sinks, and nothing goes off', () => {
  const query = campQuery()
  // CAMP's own ditch. The rule is the engine's twice over — the water test comes
  // first in the handler (0x437c74) and the douse sets the quiet flag the
  // destructor reads before anything else (0x4328c9) — and play asked for it in
  // as many words: "важно в воде не взрывается, а тонет."
  let wet: { x: number; z: number } | null = null
  for (let x = -12000; x < 12000 && !wet; x += 256) {
    for (let z = -12000; z < 12000 && !wet; z += 256) {
      if (query.isWater(x, z)) wet = { x, z }
    }
  }
  expect(wet, 'CAMP has water on it').not.toBeNull()
  // Dropped straight onto it rather than fired across it: what is being tested
  // is the contact, and a flat shot from a tube leaves the tile before it lands.
  const { heard, lobs } = fireAt(
    { x: wet!.x, y: query.surface(wet!.x, wet!.z) - 200, z: wet!.z },
    0,
    0
  )
  for (let step = 0; step < 240; step++) lobs.update(1 / 60)

  expect(heard.some((one) => one.kind === 'doused'), 'it did not go in').toBe(true)
  expect(heard.filter((one) => one.kind === 'blasted'), 'it went off in the water').toHaveLength(0)
  expect(lobs.live(), 'a sinking rocket is not live').toBe(0)
})

test('IN THE APP: it is fired with the gauge, and the rocket flattens a dummy', async ({ app }) => {
  const { page } = app
  await startGame(page)

  // No crate on the way to it carries one — the bazooka's own crate is behind
  // the door (e2e/002/tutorial.spec.ts) — so the console hands it over.
  expect(await give(page, BAZOOKA)).toBe(true)
  await page.waitForTimeout(900) // the getting-it-out clip
  expect(await holdingOf(page)).toBe(BAZOOKA)

  // It CHARGES: the record's +0x14 is set, so the gauge is up and the fire key
  // is held rather than tapped (lib/game/gauge.ts).
  const dummy = targetsOf(CAMP)[0]
  const standoff = 2200
  await warp(page, dummy.x, dummy.z - standoff, 0)
  await beginTurn(page)
  const before = await dummies(page)
  expect(before).toBeGreaterThan(0)

  await press(page, 'fire')
  await expect.poll(async () => charging(page), { timeout: 4000 }).not.toBeNull()
  // Let it fill most of the way and let go — 500 a frame at full charge carries a
  // long way, and this is a tile and a bit.
  await page.waitForTimeout(700)
  await release(page, 'fire')

  // …and the rocket goes off where it touches. It is worth forty points at the
  // core against a dummy's one, so anything it reaches goes down.
  await expect.poll(async () => dummies(page), { timeout: 15_000 }).toBeLessThan(before)
})
