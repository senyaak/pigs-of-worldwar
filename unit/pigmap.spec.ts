// PHASE 002 (domain) — the pig map's tables, every one the exe's
// (`pigmap/notes.md`: 0x4D3658, 0x4D4AC0, 0x4D4A40, 0x4D34E0).

import { test, expect } from '@playwright/test'

import {
  BANNERS,
  FLAG_STANDS,
  REGION_PAGES,
  SITES,
  ZOOM_EASING,
  nationArt,
  nationColour,
  REVEAL_FIRST_MS,
  REVEAL_STEP_MS,
  regionOf,
  regionSpan,
  standsShown
} from '../src/lib/game/pigmap'

test('the map is 25 sites, six banners and six pages', { tag: '@nodata' }, () => {
  expect(SITES).toHaveLength(25)
  expect(BANNERS).toHaveLength(6)
  expect(REGION_PAGES).toHaveLength(6)
  expect(FLAG_STANDS).toHaveLength(25)
  expect(ZOOM_EASING).toHaveLength(32)
  expect(ZOOM_EASING[ZOOM_EASING.length - 1]).toBe(100)
})

test('a position lands in its region, five a region and the isle alone', { tag: '@nodata' }, () => {
  expect(regionOf(1)).toBe(0)
  expect(regionOf(5)).toBe(0)
  expect(regionOf(6)).toBe(1)
  expect(regionOf(20)).toBe(3)
  expect(regionOf(21)).toBe(4)
  expect(regionOf(24)).toBe(4)
  expect(regionOf(25)).toBe(5)
  expect(regionSpan(0)).toEqual([1, 6])
  // Arstria's four — the isle takes the twenty-fifth for itself (0x4833F1).
  expect(regionSpan(4)).toEqual([21, 25])
  expect(regionSpan(5)).toEqual([25, 26])
  // Every site's art belongs to the region its position computes.
  const prefixes = ['hog', 'sau', 'trot', 'bel', 'ars', 'ios']
  SITES.forEach((site, i) => {
    expect(site.art.startsWith(prefixes[regionOf(i + 1)])).toBe(true)
  })
})

test('a nation maps to its art and its colour', { tag: '@nodata' }, () => {
  // The frontend order goes through 0x4508E0's {0,2,1,4,5,3,6}: France (2)
  // wears art 1 — the level1n1 page, the blue-grey tint.
  expect(nationArt(0)).toBe(0)
  expect(nationArt(2)).toBe(1)
  expect(nationArt(5)).toBe(3)
  expect(nationColour(0)).toEqual([0x27, 0xaa, 0x69])
  // Anything off the table is the brown "nobody".
  expect(nationColour(99)).toEqual([0x6d, 0x38, 0x20])
})

test('the region reveals a stand at 100 ms and one every 150 after', { tag: '@nodata' }, () => {
  // `start + (ticks + 1) / 3` on a 50 ms tick (0x483877), integer division.
  expect(REVEAL_FIRST_MS).toBe(100)
  expect(REVEAL_STEP_MS).toBe(150)
  expect(standsShown(0, 5)).toBe(0)
  expect(standsShown(99, 5)).toBe(0)
  expect(standsShown(100, 5)).toBe(1)
  expect(standsShown(249, 5)).toBe(1)
  expect(standsShown(250, 5)).toBe(2)
  expect(standsShown(400, 5)).toBe(3)
  expect(standsShown(550, 5)).toBe(4)
  expect(standsShown(700, 5)).toBe(5)
  // Frozen once the region is full (0x483869), and never negative on the way
  // in — the phase's clock starts at zero, not at the first stand.
  expect(standsShown(10000, 5)).toBe(5)
  expect(standsShown(-1, 5)).toBe(0)
  // Arstria has four stands and the isle one; both stop where they stop.
  expect(standsShown(10000, regionSpan(4)[1] - regionSpan(4)[0])).toBe(4)
  expect(standsShown(10000, regionSpan(5)[1] - regionSpan(5)[0])).toBe(1)
})
