// PHASE 002 (domain) — the mission title card. Pure, no Electron.
//
// The card's number is DERIVED from the map (lib/game/missions.ts,
// `campaignPosition`) — it used to be a parameter defaulting to 0 that the
// one caller never passed, which printed MISSION 00 on every level and no
// spec noticed, because none pinned the text. This one does.

import { test, expect } from '@playwright/test'

import { missionTitle } from '../src/renderer/src/ui/titleCard'
import { CAMPAIGN_LENGTH, mapAt, missionNameIndex } from '../src/lib/game/missions'

/** The two gtext formats and a name where the map's own index wants it. */
const strings = (map: string, name: string): string[] => {
  const text: string[] = []
  text[158] = 'MISSION >2N : >S'
  text[159] = 'TRAINING MISSION: >S'
  text[missionNameIndex(map)] = name
  return text
}

test('the first mission is 01 — never 00', { tag: '@nodata' }, () => {
  expect(missionTitle(strings('ESTU', 'THE WAR FOUNDATION'), 'ESTU')).toBe(
    'MISSION 01 : THE WAR FOUNDATION'
  )
})

test('the campaign final wears its own 25', { tag: '@nodata' }, () => {
  const finale = mapAt(CAMPAIGN_LENGTH - 1)!
  expect(missionTitle(strings(finale, 'THE LAST STAND'), finale)).toBe(
    'MISSION 25 : THE LAST STAND'
  )
})

test('the training ground takes the numberless format', { tag: '@nodata' }, () => {
  expect(missionTitle(strings('CAMP', 'BOOT CAMP'), 'CAMP')).toBe('TRAINING MISSION: BOOT CAMP')
})

test('a map outside the campaign gets no card at all', { tag: '@nodata' }, () => {
  expect(missionTitle(strings('ESTU', 'THE WAR FOUNDATION'), 'ARCHI')).toBeNull()
})
