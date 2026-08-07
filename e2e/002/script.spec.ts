// PHASE 002 (domain) — the map's script, read off the shipped CAMP.
//
// Field 14 is an opcode and the objects are the program: each carries one
// command, and it runs when the object is FINISHED. Field 15's low byte is
// the label it waits for and its high byte the one it signals — except on a
// crate, where the high byte is the contents instead.
// `../../../pigs-disasm/script/notes.md`.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { GAME_DIR } from '../launch'
import { parsePog } from '../../src/lib/formats/pog'
import { CRATE, commandOf, createScript, startsAbsent } from '../../src/lib/game/script'

const CAMP = parsePog(readFileSync(path.join(GAME_DIR, 'Maps', 'CAMP.POG')))
const byId = (id: number): (typeof CAMP)[number] => CAMP.find((one) => one.id === id)!
/** The record at a given index of the file, which is what the notes name. */
const at = (index: number): (typeof CAMP)[number] => CAMP[index]

test('CAMP holds most of itself back — the script is why the map fills in', () => {
  const absent = CAMP.filter(startsAbsent)
  expect(absent.length).toBeGreaterThan(10)
  // The tutorial's second bridge is in there: seven records — two ramps, four
  // supports and a centre — all waiting on the same label, which is why it
  // arrives assembled rather than a plank at a time.
  const bridge = absent.filter((one) => one.fields[15] === -1530)
  expect(bridge.length).toBe(7)
  expect(bridge.map((one) => one.name)).toContain('BRID2_C')
  expect(bridge.map((one) => one.name)).toContain('BRID2_S')
})

test("a crate's high byte is its CONTENTS, so it signals nothing", () => {
  // #6 is the bayonet crate: field 15 is 768, whose high byte is 3 — the
  // skill — and whose low byte is 0, so it is on the ground from the start.
  const bayonet = at(6)
  expect(bayonet.fields[14]).toBe(CRATE)
  const command = commandOf(bayonet)!
  expect(command.waits).toBe(0)
  expect(command.signals).toBe(0)
  expect(startsAbsent(bayonet)).toBe(false)
  expect(bayonet.contents?.weapon).toBe(3)
})

test('a dummy signals, and what waits on it comes on', () => {
  // #0 is the dummy that is there from the first frame — opcode 20, which is
  // not one of the two the loader hides. It signals 2.
  const first = at(0)
  expect(startsAbsent(first)).toBe(false)
  expect(commandOf(first)!.signals).toBe(2)

  const script = createScript(CAMP)
  // The two dummies waiting on 2 are held back until it breaks.
  expect(script.absent(at(7).id)).toBe(true)
  expect(script.absent(at(10).id)).toBe(true)

  const placed = script.finish(first.id)
  const rising = (a: number, b: number): number => a - b
  expect(placed.map((one) => one.id).sort(rising)).toEqual(
    [at(7).id, at(10).id, at(11).id].sort(rising)
  )
  expect(script.absent(at(7).id)).toBe(false)
})

test('killing the FIRST dummy drops a crate in, and it holds the rifle', () => {
  // Play named this one before the disassembly did — "когда убиваешь первый —
  // падает ящик на парашутике с винтовкой" — and the record agrees down to
  // the contents: #11 is a crate waiting on 2, and its high byte is 7, which
  // is the RIFLE the tutorial's own script speaks a line about.
  const rifle = at(11)
  expect(rifle.name).toBe('CRATE1')
  expect(rifle.contents?.weapon).toBe(7)
  expect(commandOf(rifle)!.waits).toBe(2)

  const script = createScript(CAMP)
  expect(script.absent(rifle.id)).toBe(true)
  const placed = script.finish(at(0).id)
  const crate = placed.find((one) => one.id === rifle.id)
  expect(crate, 'breaking the first dummy places the rifle crate').toBeDefined()
  // A pickup, and the placer drops those from 0xC00 up rather than switching
  // them on where they stand — the two dummies beside it just appear.
  expect(crate!.parachute).toBe(true)
  expect(placed.filter((one) => one.parachute)).toHaveLength(1)
})

test('a signal fires once — the second dummy finds nothing left to place', () => {
  const script = createScript(CAMP)
  expect(script.finish(at(7).id).length).toBeGreaterThan(0)
  // #10 signals the same 3, and everything waiting on it is already down.
  expect(commandOf(at(10))!.signals).toBe(3)
  expect(script.finish(at(10).id)).toEqual([])
})

test('a record with no command finishes quietly', () => {
  const plain = CAMP.find((one) => one.fields[14] === 0)!
  expect(commandOf(plain)).toBeNull()
  expect(createScript(CAMP).finish(plain.id)).toEqual([])
  expect(byId(plain.id)).toBeDefined()
})
