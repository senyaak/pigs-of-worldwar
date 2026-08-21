// PHASE 002 (domain) — THE SERGEANT's end-of-turn remark. Pure, no Electron.
//
// Play asked for it off their own memory of the original — "именно убить надо и
// тебя похвалят типо" — and the arm turned out to be fully decoded: 0x43B850
// builds `Speech/Sku1/Sarge/SGEN{CC}{VV}.wav`, and 0x498310 decides which
// section at the end of a turn. This pins the two things that are easy to get
// subtly wrong: the file arithmetic's SPILL, and the gate being about the
// SCORE and not only about the kill.

import { test, expect } from '@playwright/test'

import {
  SARGE_AHEAD,
  SARGE_BEHIND,
  SARGE_GOAD_ODDS,
  SARGE_LINES,
  SARGE_LOST,
  SARGE_SECTIONS,
  SARGE_WON,
  noTally,
  sargeAfterTurn,
  sargeAtTurnStart,
  sargeFile,
  winOrLose
} from '../src/lib/game/sergeant'

test('a section and a line make a file, spill and all', { tag: '@nodata' }, () => {
  // CC is the section PLUS ONE — the exe increments after the spill test
  // (0x43b920) — and both halves are padded to two digits.
  expect(sargeFile(SARGE_LOST, 1)).toBe('Speech/Sku1/Sarge/SGEN0101.wav')
  expect(sargeFile(SARGE_WON, 1)).toBe('Speech/Sku1/Sarge/SGEN0301.wav')
  expect(sargeFile(SARGE_WON, 8)).toBe('Speech/Sku1/Sarge/SGEN0308.wav')

  // **A LINE PAST EIGHT SPILLS INTO THE NEXT CATEGORY** (0x43b90d), which is
  // how the "hurry up" pool of sixteen spans files 13 and 14 — section 12,
  // lines 1..16.
  expect(sargeFile(12, 8)).toBe('Speech/Sku1/Sarge/SGEN1308.wav')
  expect(sargeFile(12, 9)).toBe('Speech/Sku1/Sarge/SGEN1401.wav')
  expect(sargeFile(12, 16)).toBe('Speech/Sku1/Sarge/SGEN1408.wav')

  // The front end's own is the last category, and the only one the install
  // ships seven of rather than eight.
  expect(sargeFile(21, 1)).toBe('Speech/Sku1/Sarge/SGEN2201.wav')

  // Out of range is CLAMPED to nought rather than refused — the exe complains
  // in its own words ("eSpeechSection is wrong = %d") and carries on.
  expect(sargeFile(SARGE_SECTIONS, 1)).toBe('Speech/Sku1/Sarge/SGEN0101.wav')
  expect(sargeFile(99, 1)).toBe('Speech/Sku1/Sarge/SGEN0101.wav')
})

test('the win-or-lose value is about HEALTH, not about kills', { tag: '@nodata' }, () => {
  // 0x498620, and its own debug line says so: "Current player health = %d.
  // Min, Max Other Players' health = %d, %d".
  expect(winOrLose(100, [50, 60])).toBe(1)
  expect(winOrLose(40, [50, 60])).toBe(-1)
  expect(winOrLose(55, [50, 60])).toBe(0)
  // Level with both ends is its own answer, 2 — neither best nor worst.
  expect(winOrLose(50, [50, 50])).toBe(2)
  // …and a battle with nobody else in it is never behind.
  expect(winOrLose(50, [])).toBe(2)
})

test('he praises a kill only from IN FRONT, and rotates his eight', { tag: '@nodata' }, () => {
  const counters = new Map<number, number>()

  // A kill while ahead: well done, and the first line of section 2.
  expect(sargeAfterTurn({ kills: 1, losses: 0 }, 1, counters)).toEqual({
    section: SARGE_WON,
    line: 1
  })
  // …and the NEXT one is the next line, in order rather than at random
  // (0x498402 steps the byte after the call).
  expect(sargeAfterTurn({ kills: 2, losses: 0 }, 1, counters)?.line).toBe(2)
  for (let i = 3; i <= SARGE_LINES; i++) {
    expect(sargeAfterTurn({ kills: 1, losses: 0 }, 1, counters)?.line).toBe(i)
  }
  // Past the eighth it comes round to the first.
  expect(sargeAfterTurn({ kills: 1, losses: 0 }, 1, counters)?.line).toBe(1)

  // **A KILL FROM BEHIND IS MET WITH SILENCE**, and that is the arm rather than
  // a taste: 0x4983CD tests the health value BEFORE it looks at the tally.
  expect(sargeAfterTurn({ kills: 3, losses: 0 }, -1, counters)).toBe(null)
  expect(sargeAfterTurn({ kills: 3, losses: 0 }, 0, counters)).toBe(null)
  // …and so is a quiet turn from in front.
  expect(sargeAfterTurn(noTally(), 1, counters)).toBe(null)
})

test('…and commiserates a loss only from BEHIND', { tag: '@nodata' }, () => {
  const counters = new Map<number, number>()
  expect(sargeAfterTurn({ kills: 0, losses: 1 }, -1, counters)).toEqual({
    section: SARGE_LOST,
    line: 1
  })
  expect(sargeAfterTurn({ kills: 0, losses: 1 }, 1, counters)).toBe(null)
  // The two sections count SEPARATELY — one byte each in the exe.
  expect(sargeAfterTurn({ kills: 0, losses: 1 }, -1, counters)?.line).toBe(2)
  expect(sargeAfterTurn({ kills: 1, losses: 0 }, 1, counters)?.line).toBe(1)
})

test('…and he GOADS you over the top of the enemy turn', { tag: '@nodata' }, () => {
  const counters = new Map<number, number>()
  const always = (): number => 0
  const never = (): number => 1 / SARGE_GOAD_ODDS

  // The enemy strictly BEHIND: "will you really let these amateurs beat you?"
  expect(sargeAtTurnStart(true, -1, always, counters)).toEqual({
    section: SARGE_BEHIND,
    line: 1
  })
  // …strictly AHEAD: the hole you would have to climb out of.
  expect(sargeAtTurnStart(true, 1, always, counters)).toEqual({
    section: SARGE_AHEAD,
    line: 1
  })
  // Level either way is silence, the same as the end-of-turn pair.
  expect(sargeAtTurnStart(true, 0, always, counters)).toBe(null)
  expect(sargeAtTurnStart(true, 2, always, counters)).toBe(null)

  // **It is not YOUR turn he says these on** (0x497F80 wants the acting
  // controller to be somebody other than the local human).
  expect(sargeAtTurnStart(false, -1, always, counters)).toBe(null)

  // One turn in FOUR — and the roll is drawn only once the section is
  // settled, so the battle's stream is touched in the exe's own order.
  let rolled = 0
  const counted = (): number => {
    rolled++
    return 1 / SARGE_GOAD_ODDS
  }
  expect(sargeAtTurnStart(true, 0, counted, counters)).toBe(null)
  expect(rolled).toBe(0)
  expect(sargeAtTurnStart(true, 1, never, counters)).toBe(null)

  // The rotation is the same one the end-of-turn lines walk, a byte a section.
  expect(sargeAtTurnStart(true, -1, always, counters)?.line).toBe(2)
  for (let i = 3; i <= SARGE_LINES; i++) {
    expect(sargeAtTurnStart(true, -1, always, counters)?.line).toBe(i)
  }
  expect(sargeAtTurnStart(true, -1, always, counters)?.line).toBe(1)

  // And the files they come to are 02 and 04.
  expect(sargeFile(SARGE_BEHIND, 1)).toBe('Speech/Sku1/Sarge/SGEN0201.wav')
  expect(sargeFile(SARGE_AHEAD, 1)).toBe('Speech/Sku1/Sarge/SGEN0401.wav')
})
