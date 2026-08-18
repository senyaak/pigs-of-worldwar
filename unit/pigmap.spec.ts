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
  regionOf,
  regionSpan
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
