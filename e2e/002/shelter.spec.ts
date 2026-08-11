// PHASE 002 — THE SHELTER: a pig jumps in, is gone from the picture, and the
// only thing it can do in there is skip the turn.
//
// Play: "давай бомбоубежище доделаем — свин должен запрыгивать внутрь. И видит
// бомбоубежище — в инвентаре скилы только постройки, и у бомбоубежища это только
// пропустить ход. И просвечивать должны стены, которые мы взрываем — не
// бомбоубежище."
//
// The last clause is the one worth a spec of its own: a building must NOT be
// faded, and the reason it must not is the reason there is nothing to fade for —
// a pig inside one is not drawn at all.
//
// Pure but for the last two, which drive the APP: being inside is invisible by
// design, so "did it work" is a question only the running scene can answer.

import { expect, test } from '../app'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import {
  chooseSkill,
  cutTurnBeat,
  debugState,
  holding,
  hud,
  landed,
  press,
  release,
  tap,
  warp
} from '../controller'
import { startGame } from '../menu'
import { parsePog } from '../../src/lib/formats/pog'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseMcapClip } from '../../src/lib/formats/mcap'
import { ANIM } from '../../src/lib/game/locomotion'
import { WEAPON_TABLE } from '../../src/lib/game/weapons'
import { parsePmg } from '../../src/lib/formats/pmg'
import { TerrainQuery } from '../../src/lib/game/terrain'
import {
  BUILDING_NAMES,
  ENTER_REACH,
  INOUT_CLIP,
  buildingHealth,
  buildingKind,
  buildingRoom,
  buildingSkills
} from '../../src/lib/game/buildings'
import { choosableIn, createIndoors } from '../../src/lib/game/indoors'
import { sightBlockers } from '../../src/lib/game/seeThrough'
import { boxOf, isSolid } from '../../src/lib/game/obstacles'
import { SKILL } from '../../src/lib/game/skills'
import { DAMAGE_UNIT } from '../../src/lib/game/projectile'
import { Game } from '../../src/lib/game/game'
import { NO_BODY } from '../../src/lib/game/body'
import { createBus } from '../../src/lib/game/events'
import type { BattleEvent } from '../../src/lib/game/events'

type Page = import('@playwright/test').Page

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const SHELTER = CAMP.find((one) => one.name.toUpperCase() === 'SHELTER')!

const campQuery = (): TerrainQuery =>
  new TerrainQuery(parsePmg(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.PMG'))))

/** Which building the acting pig is in, which it could get into, and whether its
 * model is on the scene (three/debug.ts). */
const shelter = (
  page: Page
): Promise<{ inside: number | null; doorway: number | null; drawn: boolean }> =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          pow: {
            debug: {
              shelter(): { inside: number | null; doorway: number | null; drawn: boolean }
            }
          }
        }
      ).pow.debug.shelter()
  )

/** What clip the acting pig is wearing (three/debug.ts). */
const pose = (page: Page): Promise<{ clip: number | null }> =>
  page.evaluate(
    () =>
      (window as unknown as { pow: { debug: { pose(): { clip: number | null } } } }).pow.debug.pose()
  )

/** How many records are faded right now (three/props.ts). */
const faded = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as { pow: { debug: { props(): { faded: number } } } }).pow.debug.props().faded
  )

test("the SHELTER is a BUILDING, and a building carries its own health and room", () => {
  // Indices 1..6 of the object name table's BUILDINGS group, and the shelter is
  // the fifth of them.
  expect(BUILDING_NAMES).toHaveLength(6)
  expect(buildingKind('SHELTER')).toBe(5)
  expect(buildingKind('PILLBOX')).toBe(4)
  // …and everything else in the game is not one, which is what keeps the 349
  // breakable scenery names out of this (lib/game/breakable.ts).
  expect(buildingKind('STW04PPP')).toBeNull()
  expect(buildingKind('DUMMY')).toBeNull()

  // The 8-byte row at 0x4c2e08 that the constructor reads: health then capacity.
  // Three pigs fit in a shelter, one in a big gun.
  expect(buildingRoom(5)).toBe(3)
  expect(buildingRoom(1)).toBe(1)
  expect(buildingRoom(3)).toBe(4)
  // …and the health beside it, in the engine's 128ths. Read and NOT applied — a
  // building is not breakable in the remake yet — so this is the pin that keeps
  // the reading from rotting.
  expect(buildingHealth(5) / DAMAGE_UNIT, 'a shelter takes a hundred').toBe(100)
  expect(buildingHealth(1) / DAMAGE_UNIT, 'and a big gun two hundred').toBe(200)
  expect(buildingHealth(6) / DAMAGE_UNIT, 'a small tent twenty-five').toBe(25)

  // And a shelter offers NOTHING to do — which is what makes the menu inside it
  // one entry long. The pillbox's own 45 and 46 are read and deliberately absent
  // until they are built (lib/game/buildings.ts).
  expect(buildingSkills(5)).toEqual([])
  expect(buildingSkills(4)).toEqual([])
})

test("a pig at the shelter's wall can get in, and one a tile away cannot", () => {
  const query = campQuery()
  // Standing right against its long face, in the box's own frame.
  const box = boxOf(SHELTER)
  const at = {
    x: box.x + Math.cos(box.turn) * (box.halfX + 40),
    z: box.z - Math.sin(box.turn) * (box.halfX + 40)
  }
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby'] }],
    spawns: [{ x: at.x, z: at.z, y: query.height(at.x, at.z), body: NO_BODY }]
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const indoors = createIndoors(CAMP, bus.emit)
  const pig = game.currentPig

  expect(indoors.all().length, 'CAMP has its one shelter').toBe(1)
  expect(indoors.reachable(pig)?.id, 'standing at the wall').toBe(SHELTER.id)

  // …and one that has walked off is not: the slack is the exe's own 0x100 round
  // the footprint, so a tile away is well past it.
  pig.position.x += ENTER_REACH * 4
  expect(indoors.reachable(pig), 'a tile away').toBeNull()
})

test('…and going in takes the pig off the map, while coming out puts it back', () => {
  const query = campQuery()
  const box = boxOf(SHELTER)
  const at = {
    x: box.x + Math.cos(box.turn) * (box.halfX + 40),
    z: box.z - Math.sin(box.turn) * (box.halfX + 40)
  }
  const game = new Game({
    players: [{ name: 'Tommy', pigNames: ['Nobby', 'Percy', 'Ginger', 'Den'] }],
    spawns: Array.from({ length: 4 }, () => ({
      x: at.x,
      z: at.z,
      y: query.height(at.x, at.z),
      body: NO_BODY
    }))
  })
  const heard: BattleEvent[] = []
  const bus = createBus()
  bus.on((event) => heard.push(event))
  const indoors = createIndoors(CAMP, bus.emit)
  const [one, two, three, four] = game.players[0].pigs
  const doorstep = { ...one.position }

  expect(indoors.enter(one)).toBe(true)
  expect(indoors.inside(one)?.id).toBe(SHELTER.id)
  expect(heard.filter((e) => e.kind === 'wentIn')).toHaveLength(1)
  // It stands at the building's own middle, which is where the exe puts it —
  // 0x469fde copies the building's transform onto the pig.
  expect(one.position.x).toBe(box.x)
  expect(one.position.z).toBe(box.z)

  // THREE fit, and the fourth is turned away — `[+0xd8] == [+0xe4]` at 0x46ca50.
  expect(indoors.enter(two)).toBe(true)
  expect(indoors.enter(three)).toBe(true)
  expect(indoors.occupants(SHELTER.id)).toBe(3)
  expect(indoors.reachable(four), 'a full shelter takes nobody else').toBeNull()
  expect(indoors.enter(four)).toBe(false)

  // …and coming out is the doorstep, exactly.
  expect(indoors.leave(one)).toBe(true)
  expect(indoors.inside(one)).toBeNull()
  expect(one.position).toMatchObject(doorstep)
  expect(indoors.occupants(SHELTER.id)).toBe(2)
  expect(indoors.leave(one), 'twice').toBe(false)
})

test('the menu INSIDE is the building\'s, and a shelter offers only SKIP TURN', () => {
  const indoors = createIndoors(CAMP, createBus().emit)
  const carrying = [
    { skill: SKILL.GRENADE, amount: 3 },
    { skill: SKILL.TNT, amount: 1 }
  ]
  // Outside, what the pig carries — the menu adds SKIP TURN itself
  // (ui/skillMenu.ts), which is why it is not in this list.
  expect(choosableIn(carrying, null)).toEqual(carrying)
  // Inside, nothing of the pig's at all. The menu's own SKIP TURN is then the
  // whole of it, which is what play asked for.
  const building = indoors.all()[0]
  expect(choosableIn(carrying, building)).toEqual([])
})

test('the way IN is CLIP 7, and the archive says it is a climb', () => {
  // Play: "там просто анимация входа — запрыгивание", against a first pass of mine
  // that claimed there was none. Wrong, and wrong in a specific way: it read the
  // door ARM (0x469f21..0x469fb4), which sets no clip, and stopped — when the arm
  // is reached FROM `Pig::Attack`, which has already put the skill's own clip on.
  //
  // WHERE that clip is comes off `Pig::Attack` itself (0x469696): five 16-byte
  // slots per skill at `0x4d7320 + skill*80 + slot*16`. The pin on the reading is
  // TNT, whose slot 0 is the "Lay Mine" clip 77 this repo already knew.
  expect(WEAPON_TABLE[37][3], 'TNT lays with clip 77').toBe(77)
  expect(INOUT_CLIP).toBe(7)
  expect(WEAPON_TABLE[61][3], "skill 61 BUILDING INOUT's own clip").toBe(INOUT_CLIP)
  expect(WEAPON_TABLE[60][3], 'and the vehicle door uses the same one').toBe(INOUT_CLIP)

  // …and the archive says it is a CLIMB. Fifty-four frames, the body's own root
  // rising 494 units — a pig is 320 tall, so it lifts itself more than its own
  // height — where the jump's launch lifts 56 and the idle moves 3.
  const data = readFileSync(path.join(GAME_DIR, 'Chars', 'mcap.mad'))
  const { entries } = parseArchive(data)
  const clipAt = (index: number): ReturnType<typeof parseMcapClip> =>
    parseMcapClip(data.subarray(entries[index].offset, entries[index].offset + entries[index].size))
  const lift = (index: number): number => {
    const clip = clipAt(index)
    const ys = Array.from({ length: clip.frameCount }, (_, f) => clip.roots[f * 3 + 1])
    return Math.max(...ys) - Math.min(...ys)
  }
  expect(clipAt(INOUT_CLIP).frameCount).toBe(54)
  expect(Math.round(lift(INOUT_CLIP))).toBe(494)
  // 320 is the pig's own height in MODEL units, which is what a root track is in.
  expect(lift(INOUT_CLIP)).toBeGreaterThan(320)
  expect(lift(8), "the jump's own launch, for scale").toBeLessThan(60)
  expect(lift(ANIM.IDLE), 'and the idle barely moves').toBeLessThan(4)
})

test('a BUILDING is never faded — the wall we blow up is', () => {
  // Play: "просвечивать должны стены, которые мы взрываем — не бомбоубежище."
  const blockers = sightBlockers(CAMP)
  expect(blockers.some((one) => one.id === SHELTER.id), 'the shelter is a blocker').toBe(false)
  // …and it is solid all the same: it is a thing to walk into, just not a thing
  // to see through.
  expect(isSolid(SHELTER)).toBe(true)

  // The house's own pieces DO fade, which is the half that stays.
  const wall = CAMP.find((one) => one.name.toUpperCase().startsWith('STW') && isSolid(one))!
  expect(blockers.some((one) => one.id === wall.id)).toBe(true)
})

test('IN THE APP: the pig jumps into the shelter and is gone from the picture', async ({
  app
}) => {
  const { page } = app
  await startGame(page)

  // Up against its long face. A warp is how a spec reaches a spot without
  // testing the walk on the way (docs/testing.md).
  const box = boxOf(SHELTER)
  const at = {
    x: box.x + Math.cos(box.turn) * (box.halfX + 40),
    z: box.z - Math.sin(box.turn) * (box.halfX + 40)
  }
  await warp(page, at.x, at.z, 0)
  const turnBefore = (await hud(page)).turn
  await expect.poll(async () => (await shelter(page)).doorway, { timeout: 4000 }).not.toBeNull()
  expect((await shelter(page)).inside, 'not in it yet').toBeNull()
  expect((await shelter(page)).drawn, 'and drawn while it is outside').toBe(true)

  // **SPACE IS STILL ONLY A JUMP**, which is the whole reason the door has a key
  // of its own: a pig standing against a shelter must be able to hop.
  await tap(page, 'jump')
  await page.waitForTimeout(300)
  expect((await shelter(page)).inside, 'the jump key put it inside').toBeNull()
  await landed(page)

  // The DOOR key — its own, and not the jump's. Play: "я не говорил по пробелу…
  // сделай отдельную кнопку, пробел уже прыжок" (input/actions.ts).
  await tap(page, 'enter')
  // **AND HE CLIMBS IN FIRST.** Play: "там просто анимация входа — запрыгивание",
  // and the clip is read rather than invented: skill 61's own attack clip is 7,
  // fifty-four frames that lift the body 494 units (lib/game/buildings.ts). He is
  // still outside and still drawn while it runs.
  await expect
    .poll(async () => (await pose(page)).clip, { timeout: 2000 })
    .toBe(INOUT_CLIP)
  expect((await shelter(page)).inside, 'he was inside before the clip ran').toBeNull()
  expect((await shelter(page)).drawn, 'and he is on screen for it').toBe(true)
  // …and the clip finishing is what takes him in.
  await expect.poll(async () => (await shelter(page)).inside, { timeout: 4000 }).not.toBeNull()
  // **AND IT IS NOT DRAWN.** The exe clears `[pig+0x30]`, which is the byte its
  // own draw loop gates every object on.
  await expect.poll(async () => (await shelter(page)).drawn, { timeout: 4000 }).toBe(false)
  // …nor is the shelter faded for it: there is nothing behind the wall to see.
  expect(await faded(page), 'the shelter went see-through').toBe(0)

  // Driving does nothing at all in there.
  const held = await debugState(page)
  await press(page, 'walkForward')
  await page.waitForTimeout(400)
  await release(page, 'walkForward')
  const now = await debugState(page)
  expect(Math.hypot(now.x - held.x, now.z - held.z), 'it walked out of the shelter').toBeLessThan(1)
  expect((await shelter(page)).inside, 'and it is still in there').not.toBeNull()

  // **AND THE MENU IN THERE HAS ONE THING IN IT.** Play: "в инвентаре скилы только
  // постройки, и у бомбоубежища это только пропустить ход." Nothing the pig is
  // carrying is offered, and `chooseSkill` walks the whole grid — so landing on
  // SKIP TURN on the first cell is the menu having exactly one entry.
  expect(await chooseSkill(page, SKILL.SKIP_TURN), 'SKIP TURN was not in the menu').toBe(true)
  expect(await holding(page)).toBe(SKILL.SKIP_TURN)
  // …and it is not a decoration: it ENDS the turn from inside, which is the whole
  // of what a pig sitting one out in a bomb shelter is there to do.
  await press(page, 'fire')
  await release(page, 'fire')
  await expect.poll(async () => (await hud(page)).turn, { timeout: 6000 }).toBeGreaterThan(
    turnBefore
  )
  await cutTurnBeat(page)

  // …and the same key again puts it back on the doorstep it came from — out
  // FIRST, because a clip cannot be watched from inside, and the climb after it.
  await tap(page, 'enter')
  await expect.poll(async () => (await shelter(page)).inside, { timeout: 4000 }).toBeNull()
  await expect.poll(async () => (await shelter(page)).drawn, { timeout: 4000 }).toBe(true)
  const out = await debugState(page)
  expect(Math.hypot(out.x - at.x, out.z - at.z), 'it came out somewhere else').toBeLessThan(64)
  // …and it survived the handover in there: CAMP fields ONE pig, so the turn that
  // came back is the same pig's, still standing in the shelter it skipped from.
})
