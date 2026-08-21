// PHASE 000 (formats) — the PROMOTION POINT over the shipped maps.
//
// The campaign's currency lies on the ground: object type 395, `PROPOINT`,
// eleven records across the 61 maps. This pins the census, because everything
// downstream is sized by it — the debrief pays out what was picked up
// (lib/game/save.ts, `missionReward`), and the exe's own bonus table promises
// up to five on a level where the maps place at most two.
//
// It is a spec rather than a comment because the number is what makes the
// feature testable in play at all: EIGHT maps out of sixty-one carry a live
// one, so "I never saw it" is the expected experience on the other fifty-three.

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { parsePog } from '../../src/lib/formats/pog'
import { PROPOINT_TYPE, isPickup } from '../../src/lib/game/obstacles'
import { pickupsOf } from '../../src/lib/game/pickups'

const maps = (): string[] => {
  const dir = path.join(GAME_DIR, 'Maps')
  return readdirSync(dir)
    .filter((name) => name.toUpperCase().endsWith('.POG'))
    .sort()
}

const objectsOf = (file: string): ReturnType<typeof parsePog> =>
  parsePog(readFileSync(path.join(GAME_DIR, 'Maps', file)))

test('PROPOINT is type 395, and nothing else is', () => {
  const byName = new Map<string, Set<number>>()
  for (const file of maps()) {
    for (const object of objectsOf(file)) {
      if (object.name !== 'PROPOINT' && object.type !== PROPOINT_TYPE) continue
      const seen = byName.get(object.name) ?? new Set<number>()
      seen.add(object.type)
      byName.set(object.name, seen)
    }
  }
  // One name, one type, and the type belongs to nobody else.
  expect([...byName.keys()]).toEqual(['PROPOINT'])
  expect([...(byName.get('PROPOINT') ?? [])]).toEqual([PROPOINT_TYPE])
})

test('EIGHT maps carry a live one, and BAY’s is inert', () => {
  const live: string[] = []
  const all: string[] = []
  for (const file of maps()) {
    const name = file.replace(/\.pog$/i, '')
    for (const object of objectsOf(file)) {
      if (object.type !== PROPOINT_TYPE) continue
      all.push(name)
      // Field 14 is what says a record hands something over. BAY's PROPOINT
      // carries 0 there where every other one carries 19, so the map draws it
      // and the game has nothing to give for it.
      if (isPickup(object)) live.push(name)
    }
  }
  expect(all.length).toBe(11)
  expect(live.length).toBe(10)
  expect([...new Set(live)].sort()).toEqual([
    'DESVAL',
    'EMPLACE',
    'EYRIE',
    'FJORDS',
    'GUNS',
    'LIBERATE',
    'MASHED',
    'TESTER'
  ])
  expect(all.filter((name) => !live.includes(name))).toEqual(['BAY'])
})

test('a point is a pickup of its own KIND, never a crate', () => {
  const objects = objectsOf('LIBERATE.POG')
  const pickups = pickupsOf(objects)
  const points = pickups.filter((one) => one.kind === 'point')
  expect(points.length).toBe(1)
  // …and the crates on the same map are untouched by it.
  expect(pickups.filter((one) => one.kind === 'crate').length).toBeGreaterThan(0)
  // What the record SAYS is inside is read and never used: all ten read the
  // same, which is why the kind carries the meaning.
  const record = objects.find((one) => one.type === PROPOINT_TYPE)
  expect(record?.contents).toEqual({ weapon: 1, amount: 1 })
})
