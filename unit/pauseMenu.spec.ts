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
  clickLevel,
  newPause,
  pausePress
} from '../src/lib/game/pauseMenu'
import {
  DWELL_FRAMES,
  NEAR_ENOUGH,
  ORBIT_FRAMES,
  ORBIT_RADIUS,
  ORBIT_STEP,
  advanceBearing,
  easeOver,
  orbitPoint
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

test('the map view FLIES, and the path is a figure-eight', { tag: '@nodata' }, () => {
  // `add eax,6` every frame (0x4A4E5E), wrapped to 4096 — so a lap of the long
  // axis is 4096/6 frames, a bit under twenty-three seconds.
  expect(ORBIT_STEP).toBe(6)
  expect(ORBIT_RADIUS).toBe(11000)
  expect(ORBIT_FRAMES).toBeCloseTo(4096 / 6, 6)

  // THE SINE'S INDEX IS DOUBLED (0x4A4E67), which is what makes it a
  // figure-eight rather than a circle: z closes two cycles while x closes one.
  // A circle holds `x² + z²` constant and this is nowhere near it.
  const at = (bearing: number): { x: number; z: number } => orbitPoint(bearing)
  const reach = (bearing: number): number => Math.hypot(at(bearing).x, at(bearing).z)

  // The two ENDS of the eight, half a turn apart, both R out along x.
  expect(at(0)).toMatchObject({ x: expect.closeTo(ORBIT_RADIUS, 6), z: expect.closeTo(0, 6) })
  expect(at(2048)).toMatchObject({ x: expect.closeTo(-ORBIT_RADIUS, 6), z: expect.closeTo(0, 6) })
  // The CROSSING, at a quarter and three quarters of the turn: the path comes
  // back through the middle of the map, which is the one thing a circle can
  // never do.
  expect(reach(1024)).toBeCloseTo(0, 6)
  expect(reach(3072)).toBeCloseTo(0, 6)
  // …and between end and crossing it BULGES past the radius, to R·√1.5 — the
  // widest the flight ever gets.
  expect(reach(512)).toBeCloseTo(ORBIT_RADIUS * Math.SQRT2 * Math.sqrt(0.75), 4)
  expect(reach(512)).toBeGreaterThan(ORBIT_RADIUS)

  // The bearing wraps rather than growing without end.
  expect(advanceBearing(0, 1)).toBe(6)
  expect(advanceBearing(4092, 1)).toBe(2)
  expect(advanceBearing(0, ORBIT_FRAMES)).toBeCloseTo(0, 6)
  // …and it advances on FRACTIONS of a frame, because our frames are not the
  // exe's.
  expect(advanceBearing(0, 0.5)).toBeCloseTo(3, 9)
})

test('the look runs out at 126 frames, or when the flight comes near', { tag: '@nodata' }, () => {
  // `cmp ecx,7Dh` is tested BEFORE the increment, so the dwell is 126.
  expect(DWELL_FRAMES).toBe(126)
  // `cmp eax,1286BB5h` is a SQUARED distance in XZ.
  expect(NEAR_ENOUGH).toBeCloseTo(Math.sqrt(0x1286bb5), 9)
  expect(Math.round(NEAR_ENOUGH)).toBe(4408)
})

test('an easing is the same curve however the frames are cut', { tag: '@nodata' }, () => {
  // One frame of a sixth is a sixth.
  expect(easeOver(1 / 6, 1)).toBeCloseTo(1 / 6, 9)
  // Two frames of a sixth leave (5/6)² of the gap, and asking for two at once
  // has to agree with asking for one twice — which is the whole point.
  const once = easeOver(1 / 6, 2)
  const twice = 1 - (1 - easeOver(1 / 6, 1)) * (1 - easeOver(1 / 6, 1))
  expect(once).toBeCloseTo(twice, 12)
  // Nothing at all for no time, and never past the whole gap.
  expect(easeOver(1 / 6, 0)).toBe(0)
  expect(easeOver(1 / 6, 1000)).toBeLessThanOrEqual(1)
  expect(easeOver(1 / 6, -1)).toBe(0)
})

test('the menu CLICK rides both sliders — it is the volume preview', { tag: '@nodata' }, () => {
  // Full mix clicks at full; either slider scales it; both at half is a
  // quarter; a mix dragged to nothing clicks not at all. The product is what
  // makes one click preview BOTH rows (lib/game/pauseMenu.ts, clickLevel —
  // applied by audio/menuClick.ts, the player outside the suspended mixer).
  expect(clickLevel(VOLUME_MAX, VOLUME_MAX)).toBe(1)
  expect(clickLevel(50, VOLUME_MAX)).toBeCloseTo(0.5, 9)
  expect(clickLevel(VOLUME_MAX, 50)).toBeCloseTo(0.5, 9)
  expect(clickLevel(50, 50)).toBeCloseTo(0.25, 9)
  expect(clickLevel(0, VOLUME_MAX)).toBe(0)
  // …and nothing outside 0..100 leaks through the clamp.
  expect(clickLevel(200, VOLUME_MAX)).toBe(1)
  expect(clickLevel(-10, VOLUME_MAX)).toBe(0)
})
