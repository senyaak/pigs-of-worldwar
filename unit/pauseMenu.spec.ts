// PHASE 002 (domain) — the in-battle PAUSE MENU's rules.
//
// Five rows and no more: the exe's lit row dispatches through a five-entry
// jump table at 0x45B560, so RESTART and INSTRUCTIONS — both of which have
// `gtext` strings sitting right beside these — are not options this build has.

import { test, expect } from '@playwright/test'

import {
  ARE_YOU_SURE,
  BAR_CELLS,
  CONFIRM_NO,
  CONFIRM_YES,
  PAUSE_PITCH,
  PAUSE_ROWS,
  PAUSE_TITLE,
  SPEECH_OFF,
  SPEECH_ON,
  VOLUME_MAX,
  VOLUME_STEP,
  barCells,
  newPause,
  pausePress
} from '../src/lib/game/pauseMenu'
import {
  MAP_CLOSE,
  MAP_DISTANCE,
  TOUR_FRAMES,
  TOUR_SECONDS,
  touredIndex
} from '../src/lib/game/mapView'
import type { PauseState, PauseVerb } from '../src/lib/game/pauseMenu'

/** Walk a list of presses in, and hand back what the last one answered. */
const press = (state: PauseState, ...verbs: PauseVerb[]): ReturnType<typeof pausePress> =>
  verbs.map((verb) => pausePress(state, verb)).slice(-1)[0]

test('five rows, in the jump table’s own order', { tag: '@nodata' }, () => {
  expect(PAUSE_ROWS.map((row) => row.kind)).toEqual(['continue', 'master', 'sfx', 'speech', 'abort'])
  // The ids are gtext's, and two of them are nowhere near the others: the
  // volumes are 238 and 239 while everything else sits in the 170s.
  expect(PAUSE_ROWS.map((row) => row.label)).toEqual([181, 238, 239, 175, 179])
  expect(PAUSE_TITLE).toBe(173)
  expect([SPEECH_ON, SPEECH_OFF]).toEqual([176, 177])
  expect([ARE_YOU_SURE, CONFIRM_YES, CONFIRM_NO]).toEqual([182, 183, 184])
})

test('the cursor clamps at both ends and never wraps', { tag: '@nodata' }, () => {
  const state = newPause()
  expect(state.row).toBe(0)
  // UP on the top row is refused, and a refusal makes no noise (0x4922FE).
  expect(pausePress(state, 'up')).toMatchObject({ sound: null })
  expect(state.row).toBe(0)
  expect(press(state, 'down', 'down', 'down', 'down').sound).toBe('plain')
  expect(state.row).toBe(4)
  expect(pausePress(state, 'down')).toMatchObject({ sound: null })
  expect(state.row).toBe(4)
})

test('a volume steps five at a time between nothing and a hundred', { tag: '@nodata' }, () => {
  const state = newPause()
  state.row = 1
  expect(pausePress(state, 'left')).toMatchObject({ sound: 'volume' })
  expect(state.master).toBe(VOLUME_MAX - VOLUME_STEP)
  // …and it stops at the top rather than going past it (0x492581).
  press(state, 'right', 'right', 'right')
  expect(state.master).toBe(VOLUME_MAX)
  // The floor is the remake's: the exe clamps only the top, and its bottom is
  // a word going through zero.
  for (let i = 0; i < 30; i++) pausePress(state, 'left')
  expect(state.master).toBe(0)
  // The two sliders are separate, and neither is the other.
  expect(state.sfx).toBe(VOLUME_MAX)
  state.row = 2
  pausePress(state, 'left')
  expect(state.sfx).toBe(VOLUME_MAX - VOLUME_STEP)
  expect(state.master).toBe(0)
})

test('the bar is twenty cells, one per five', { tag: '@nodata' }, () => {
  expect(BAR_CELLS).toBe(20)
  expect(barCells(100)).toBe(20)
  expect(barCells(0)).toBe(0)
  expect(barCells(50)).toBe(10)
  // It never runs off its own track, whatever it is handed.
  expect(barCells(1000)).toBe(20)
  expect(barCells(-5)).toBe(0)
})

test('SPEECH is written, not flipped — and turning it off cuts the line', { tag: '@nodata' }, () => {
  const state = newPause()
  state.row = 3
  expect(state.speech).toBe(true)
  // LEFT is OFF. It cuts what is being said, once.
  expect(pausePress(state, 'left')).toMatchObject({ sound: 'toggle', cutSpeech: true })
  expect(state.speech).toBe(false)
  // Pressing LEFT again writes the same value: still off, and nothing left to
  // cut. A toggle would have turned it back on here, which is the bug this
  // pins (0x4923AA writes 0, it does not xor).
  expect(pausePress(state, 'left')).toMatchObject({ sound: 'toggle', cutSpeech: false })
  expect(state.speech).toBe(false)
  expect(pausePress(state, 'right')).toMatchObject({ sound: 'toggle', cutSpeech: false })
  expect(state.speech).toBe(true)
})

test('only two rows answer SELECT at all', { tag: '@nodata' }, () => {
  const state = newPause()
  // CONTINUE lets the game go.
  expect(pausePress(state, 'select')).toMatchObject({ sound: 'plain', resume: true })
  // The sliders and the switch do nothing at all with it — they are worked
  // sideways.
  for (const row of [1, 2, 3]) {
    state.row = row
    expect(pausePress(state, 'select')).toMatchObject({ sound: null, resume: false, abort: false })
  }
  // ABORT arms the question rather than answering it.
  state.row = 4
  expect(pausePress(state, 'select')).toMatchObject({ sound: 'plain', abort: false })
  expect(state.confirming).toBe(true)
  expect(state.yes).toBe(false)
})

test('the confirm starts on NO and only YES ends the mission', { tag: '@nodata' }, () => {
  const state = newPause()
  state.row = 4
  pausePress(state, 'select')
  // NO is where it opens (0x492221) — so a player who mashes SELECT twice
  // stays in the mission.
  expect(pausePress(state, 'select')).toMatchObject({ abort: false })
  expect(state.confirming).toBe(false)

  pausePress(state, 'select')
  expect(pausePress(state, 'left')).toMatchObject({ sound: 'toggle' })
  expect(state.yes).toBe(true)
  // Arming what is already armed is silent, the way a refused cursor is.
  expect(pausePress(state, 'left')).toMatchObject({ sound: null })
  expect(pausePress(state, 'right')).toMatchObject({ sound: 'toggle' })
  expect(state.yes).toBe(false)
  pausePress(state, 'left')
  expect(pausePress(state, 'select')).toMatchObject({ abort: true, sound: 'plain' })
})

test('ESCAPE steps back one level, not two', { tag: '@nodata' }, () => {
  const state = newPause()
  // On the menu it is the key that opened it, so it closes it.
  expect(pausePress(state, 'back')).toMatchObject({ resume: true })
  // Over an armed confirm it takes the confirm down and leaves the pause up.
  // `[CHECK — remake]`: the exe's toggle was read, its confirm flag's fate
  // across one was not.
  state.row = 4
  pausePress(state, 'select')
  expect(pausePress(state, 'back')).toMatchObject({ resume: false, abort: false })
  expect(state.confirming).toBe(false)
})

test('every noise is one sample at one of three pitches', { tag: '@nodata' }, () => {
  // 0x64, 0x96 and 0x82 against the sample's own 0x64 (0x492586, 0x4923D2).
  expect(PAUSE_PITCH.plain).toBe(1)
  expect(PAUSE_PITCH.volume).toBeCloseTo(1.5, 6)
  expect(PAUSE_PITCH.toggle).toBeCloseTo(1.3, 6)
})

test('a pause opens on the settings it is handed, and on row zero', { tag: '@nodata' }, () => {
  const state = newPause({ master: 40, sfx: 15, speech: false })
  expect(state).toMatchObject({ row: 0, confirming: false, yes: false, master: 40, sfx: 15, speech: false })
})

test('the map view tours a pig every 0x7D frames, wrapping', { tag: '@nodata' }, () => {
  // The exe's own count (0x4A4D40), on its own clock — a bit over four
  // seconds a pig at 30 frames a second.
  expect(TOUR_FRAMES).toBe(0x7d)
  expect(TOUR_SECONDS).toBeCloseTo(125 / 30, 6)
  expect(touredIndex(0, 3)).toBe(0)
  expect(touredIndex(TOUR_SECONDS - 0.001, 3)).toBe(0)
  expect(touredIndex(TOUR_SECONDS, 3)).toBe(1)
  expect(touredIndex(TOUR_SECONDS * 2, 3)).toBe(2)
  // …and it WRAPS rather than stopping at the end of the list.
  expect(touredIndex(TOUR_SECONDS * 3, 3)).toBe(0)
  expect(touredIndex(TOUR_SECONDS * 7, 3)).toBe(1)
  // One pig is a tour of one; no pigs at all is nothing to look at, which is
  // a real case — every pig on the field can be indoors at once.
  expect(touredIndex(TOUR_SECONDS * 5, 1)).toBe(0)
  expect(touredIndex(1, 0)).toBe(-1)
  // The camera pulls back to 11000 against the chase's 3072 — row 7 of
  // 0x4D9528 against the chase's own.
  expect(MAP_DISTANCE).toBe(11000)
  expect(MAP_CLOSE).toBeCloseTo(11000 / 3072, 9)
})
