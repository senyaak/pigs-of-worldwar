// PHASE 002 (domain) — PICK POCKET steals the whole slot. Pure, no Electron.
//
// The exe's shape (`weapons/espionage.md` in the disasm repo): the healing
// hands' cone, a LOOSER filter (no team, no dead, no hidden test), a random
// WHOLE slot crossing, no reaction from the victim, the two P_OWW failure
// exits, the charge spent whiff or not — and the exe's own off-by-one: at 14
// slots the loot silently vanishes while the victim still loses it.

import { test, expect } from '@playwright/test'

import { STEAL_SLOT_CAP, createPockets, stealTarget } from '../src/lib/game/pickpocket'
import { UNLIMITED, amountOf } from '../src/lib/game/inventory'
import { SKILL } from '../src/lib/game/skills'
import { NO_BODY } from '../src/lib/game/body'
import type { Pig } from '../src/lib/game/game'
import type { BattleEvent } from '../src/lib/game/events'

const pigAt = (x: number, z: number, id = 1): Pig =>
  ({
    id,
    name: `P${id}`,
    index: 0,
    health: 75,
    carrying: [],
    holding: null,
    position: { x, y: 0, z },
    body: NO_BODY,
    heading: 0,
    pigClass: 8,
    gone: false,
    parachutes: false
  }) as unknown as Pig

const field = (
  pigs: Pig[]
): { pockets: ReturnType<typeof createPockets>; heard: BattleEvent[] } => {
  const heard: BattleEvent[] = []
  // No clips to time: the verdict lands at the press, which is what a bare
  // spec wants.
  const pockets = createPockets({ pigs: () => pigs, clips: [], random: () => 0 }, (event) =>
    heard.push(event)
  )
  return { pockets, heard }
}

test('the WHOLE slot crosses — and the victim does not react', { tag: '@nodata' }, () => {
  const thief = pigAt(0, 0, 1)
  thief.holding = SKILL.PICK_POCKET
  thief.carrying.push({ skill: SKILL.PICK_POCKET, amount: 2 })
  const victim = pigAt(0, 500, 2)
  victim.carrying.push({ skill: SKILL.GRENADE, amount: 3 })
  const { pockets, heard } = field([thief, victim])
  expect(pockets.begin(thief)).toBe(true)
  // The whole three, never one — and the charge went at the press.
  expect(amountOf(thief.carrying, SKILL.GRENADE)).toBe(3)
  expect(amountOf(victim.carrying, SKILL.GRENADE)).toBe(0)
  expect(amountOf(thief.carrying, SKILL.PICK_POCKET)).toBe(1)
  const stole = heard.find((one) => one.kind === 'stole')
  expect(stole).toMatchObject({ thief: 1, victim: 2, skill: SKILL.GRENADE, amount: 3 })
})

test('nobody in the cone, and a victim with empty pockets — the two refusals', { tag: '@nodata' }, () => {
  const thief = pigAt(0, 0, 1)
  thief.carrying.push({ skill: SKILL.PICK_POCKET, amount: UNLIMITED })
  // A pig BEHIND the thief is out of the ±45° cone however near it stands.
  const behind = pigAt(0, -300, 2)
  behind.carrying.push({ skill: SKILL.RIFLE, amount: 5 })
  const { pockets, heard } = field([thief, behind])
  pockets.begin(thief)
  expect(heard.find((one) => one.kind === 'stealFailed')).toMatchObject({ reason: 'reach' })
  expect(amountOf(behind.carrying, SKILL.RIFLE)).toBe(5)
  // …and a broke victim in front.
  const broke = pigAt(0, 400, 3)
  const second = field([thief, broke])
  second.pockets.begin(thief)
  expect(second.heard.find((one) => one.kind === 'stealFailed')).toMatchObject({
    reason: 'nothing'
  })
})

test('a DEAD pig is fair game — the exe screens nothing but distance and bearing', { tag: '@nodata' }, () => {
  const thief = pigAt(0, 0, 1)
  const corpse = pigAt(0, 600, 2)
  corpse.health = 0
  corpse.carrying.push({ skill: SKILL.TNT, amount: 1 })
  expect(stealTarget(thief, [thief, corpse])).toBe(corpse)
})

test('at FOURTEEN slots the loot vanishes — the victim still loses it', { tag: '@nodata' }, () => {
  const thief = pigAt(0, 0, 1)
  // Unlimited, so the spent charge does not free the slot under the test.
  thief.carrying.push({ skill: SKILL.PICK_POCKET, amount: UNLIMITED })
  // Thirteen more junk slots: fourteen in all, the exe's own append cap.
  for (let filler = 0; filler < STEAL_SLOT_CAP - 1; filler++) {
    thief.carrying.push({ skill: 30 + filler, amount: 1 })
  }
  const victim = pigAt(0, 500, 2)
  victim.carrying.push({ skill: SKILL.BAZOOKA, amount: 2 })
  const { pockets, heard } = field([thief, victim])
  pockets.begin(thief)
  expect(amountOf(victim.carrying, SKILL.BAZOOKA)).toBe(0)
  expect(amountOf(thief.carrying, SKILL.BAZOOKA)).toBe(0)
  // The theft still HAPPENED — the event says so, the loot just never
  // arrived, which is the exe's own off-by-one against GiveSkill's 15.
  expect(heard.some((one) => one.kind === 'stole')).toBe(true)
})
