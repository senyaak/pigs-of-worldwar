// PHASE 002 (domain) — typing a name on the frontend's letter grid.
//
// The rules are the exe's (`frontend/notes.md` in the disasm repo): the
// alphabet is one 42-character string, the cursor is an index into it, and the
// three values past its end are DELETE, SPACE and ENTER in that order.

import { test, expect } from '@playwright/test'

import {
  ALPHABET,
  KEYS,
  PIG_NAME_MAX,
  TEAM_NAME_MAX,
  keyAt,
  letterAt,
  moveCursor,
  newEntry,
  padded,
  press,
  type
} from '../src/lib/game/nameEntry'
import type { Alphabet, NameEntry } from '../src/lib/game/nameEntry'

/** Play's own layout, off a screenshot of the shipped game: seven letters
 * across, six rows down, and the keys as an eighth column. */
const GRID: Alphabet = { letters: ALPHABET, columns: 7, rows: 6 }

const typed = (text: string): NameEntry => ({ name: text, cursor: 0 })
const at = (cursor: number): NameEntry => ({ name: '', cursor })

test('the alphabet is the exe\'s own 42 characters', { tag: '@nodata' }, () => {
  expect(ALPHABET).toBe("ABCDEFGHIJKLMNOPQRSTUVWXYZ-*&'+,0123456789")
  expect(ALPHABET).toHaveLength(42)
  expect(TEAM_NAME_MAX).toBe(11)
  expect(PIG_NAME_MAX).toBe(7)
})

test('the three keys live past the end of the alphabet', { tag: '@nodata' }, () => {
  expect(KEYS).toEqual(['delete', 'space', 'enter'])
  expect(keyAt(at(41), GRID)).toBeNull()
  expect(letterAt(at(41), GRID)).toBe('9')
  expect(keyAt(at(42), GRID)).toBe('delete')
  expect(keyAt(at(43), GRID)).toBe('space')
  expect(keyAt(at(44), GRID)).toBe('enter')
  expect(letterAt(at(44), GRID)).toBeNull()
})

test('a letter appends until the name is full', { tag: '@nodata' }, () => {
  let entry = newEntry()
  expect(press(entry, GRID, 3).entry.name).toBe('A')
  entry = { name: 'ABC', cursor: 3 }
  // D would be the fourth, and three is the limit.
  expect(press(entry, GRID, 3).entry.name).toBe('ABC')
})

test('DELETE drops the last character and SPACE adds one', { tag: '@nodata' }, () => {
  const del = { ...typed('AB'), cursor: 42 }
  expect(press(del, GRID, TEAM_NAME_MAX).entry.name).toBe('A')
  // …and an empty name is left alone rather than going negative.
  expect(press({ ...del, name: '' }, GRID, TEAM_NAME_MAX).entry.name).toBe('')
  const space = { ...typed('AB'), cursor: 43 }
  expect(press(space, GRID, TEAM_NAME_MAX).entry.name).toBe('AB ')
  expect(press({ name: 'ABC', cursor: 43 }, GRID, 3).entry.name).toBe('ABC')
})

test('ENTER refuses an empty name and otherwise hands it over', { tag: '@nodata' }, () => {
  expect(press(at(44), GRID, TEAM_NAME_MAX)).toMatchObject({ refused: true })
  expect(press({ name: 'TOMMY', cursor: 44 }, GRID, TEAM_NAME_MAX).accepted).toBe('TOMMY')
})

test('ENTER judges the name TRIMMED, and hands the trimmed one over', { tag: '@nodata' }, () => {
  // `[deliberate]`: the exe tests the buffer's first byte, so a name of spaces
  // passes it. Play asked for the trim.
  expect(press({ name: ' ', cursor: 44 }, GRID, TEAM_NAME_MAX)).toMatchObject({ refused: true })
  expect(press({ name: '   ', cursor: 44 }, GRID, TEAM_NAME_MAX)).toMatchObject({ refused: true })
  expect(press({ name: ' TOMMY ', cursor: 44 }, GRID, TEAM_NAME_MAX).accepted).toBe('TOMMY')
  // And the middle of a name is left alone.
  expect(press({ name: ' A B ', cursor: 44 }, GRID, TEAM_NAME_MAX).accepted).toBe('A B')
})

test('the cursor wraps both ways over the grid', { tag: '@nodata' }, () => {
  // Row 0 is A..G; one left of A is the keys' column.
  expect(moveCursor(at(0), -1, 0, GRID).cursor).toBe(42)
  // One right of G wraps to the keys' column too, then round to A.
  expect(moveCursor(at(6), 1, 0, GRID).cursor).toBe(42)
  expect(moveCursor(at(42), 1, 0, GRID).cursor).toBe(0)
  // Down a row is seven along; up from the top row lands on the bottom one.
  expect(moveCursor(at(0), 0, 1, GRID).cursor).toBe(7)
  expect(moveCursor(at(0), 0, -1, GRID).cursor).toBe(35)
})

test('the keys are a column three tall and wrap among themselves', { tag: '@nodata' }, () => {
  expect(moveCursor(at(42), 0, 1, GRID).cursor).toBe(43)
  expect(moveCursor(at(44), 0, 1, GRID).cursor).toBe(42)
  expect(moveCursor(at(42), 0, -1, GRID).cursor).toBe(44)
})

test('a place past the last letter lands on the last letter', { tag: '@nodata' }, () => {
  // 42 letters in a 7 x 6 grid fill it exactly, so make one that does not.
  const ragged: Alphabet = { letters: 'ABCDEFGH', columns: 3, rows: 3 }
  // Row 2 is G, H and an empty place; moving down onto it lands on H.
  expect(moveCursor({ name: '', cursor: 5 }, 0, 1, ragged).cursor).toBe(7)
})

test('the field pads the name out with dots', { tag: '@nodata' }, () => {
  expect(padded('', TEAM_NAME_MAX)).toBe('...........')
  expect(padded('TOMMY', TEAM_NAME_MAX)).toBe('TOMMY......')
  expect(padded('TOOLONGANAME', 4)).toBe('TOOLONGANAME')
})

test('typing takes only what the alphabet carries, in capitals', { tag: '@nodata' }, () => {
  expect(type(newEntry(), GRID, TEAM_NAME_MAX, 'a').name).toBe('A')
  expect(type(newEntry(), GRID, TEAM_NAME_MAX, ' ').name).toBe(' ')
  expect(type(newEntry(), GRID, TEAM_NAME_MAX, '!').name).toBe('')
  expect(type({ name: 'ABC', cursor: 0 }, GRID, 3, 'D').name).toBe('ABC')
})
