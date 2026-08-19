// PHASE 000 (formats) — which SHIPPED sprites carry alignment padding, by
// name. The rule is `spritePadding` (lib/formats/tim.ts, unit-tested in
// unit/timPadding.spec.ts); this pins what it measures over the real
// archives, because the whole point of the rule is to hit exactly the
// garbage columns and nothing else — a broadened rule would eat real art
// silently, and a narrowed one would put the white hairlines back on the
// world map and the clock.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'

import { GAME_DIR } from '../launch'
import { parseArchive } from '../../src/lib/formats/mad'
import { parseTim, spritePadding } from '../../src/lib/formats/tim'

const paddingByEntry = (relPath: string): Map<string, number> => {
  const data = readFileSync(path.join(GAME_DIR, relPath))
  const out = new Map<string, number>()
  for (const entry of parseArchive(data).entries) {
    try {
      const tim = parseTim(data.subarray(entry.offset, entry.offset + entry.size))
      out.set(entry.name.toLowerCase(), spritePadding(tim))
    } catch {
      // not a TIM — not this rule's business
    }
  }
  return out
}

test('the world map trims exactly its four garbage columns', () => {
  const pmap = paddingByEntry('Language/Tims/PigMap/PMAPTIMS.MAD')
  const trimmed = [...pmap.entries()].filter(([, pad]) => pad > 0).map(([name]) => name).sort()
  // The four striped masks play reported — one filler column each — and
  // nothing else: the flag, the pole, the marker parts and the other
  // twenty-one masks keep their width.
  expect(trimmed).toEqual(['hog2.tim', 'sau3.tim', 'sau4.tim', 'trot2.tim'])
  expect(pmap.get('sau4.tim')).toBe(1)
  expect(pmap.get('fpole.tim')).toBe(0)
  expect(pmap.get('flag.tim')).toBe(0)
})

test('the dashboard trims every clock digit and touches nothing else', () => {
  const dash = paddingByEntry('Language/Tims/dashtims.mad')
  const trimmed = [...dash.entries()].filter(([, pad]) => pad > 0).map(([name]) => name).sort()
  // All ten digits ship 24 wide with a solid white filler column — the
  // hairline on every digit of the clock — and the pause icons' own dark
  // rims stay: `pause5`'s right edge is art an earlier rule wrongly ate.
  expect(trimmed).toEqual(Array.from({ length: 10 }, (_, i) => `timer${i}.tim`))
  expect(dash.get('timer0.tim')).toBe(1)
  expect(dash.get('pause5.tim')).toBe(0)
})
