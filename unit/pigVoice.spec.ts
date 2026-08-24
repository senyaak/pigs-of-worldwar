// PHASE 002 (domain) — WHO SPEAKS, and IN WHAT. Pure: file names and table
// lookups, no audio context and no install.
//
// The read is `speech/pigs.md` (2026-08-24): the record a battle pig points
// at is its own 64-byte ROSTER SLOT, so the voice is the PIG'S IDENTITY —
// its row in the nation's name table, name k speaking Pig{k+1} — and the
// language is `Team::SkinOf(nation)`. Both used to be the SIDE's index, which
// is why every nation sounded English.

import { test, expect } from '@playwright/test'

import { voiceFile, voiceFor, VOICES } from '../src/renderer/src/audio/pigVoice'
import { SKIN_SPEECH, speechOf, LARD } from '../src/lib/game/nations'
import { mapSquads } from '../src/lib/game/muster'
import type { Team } from '../src/lib/game/teams'
import type { MapObject } from '../src/lib/formats/pog'

test('a NAME keeps its voice, whoever fields it', { tag: '@nodata' }, () => {
  // The identity is 0-based and the folder 1-based: row 0 speaks Pig01.
  expect(voiceFor(0)).toBe(1)
  expect(voiceFor(8)).toBe(VOICES)
  // Past the nine it wraps rather than asking for a folder that is not there.
  expect(voiceFor(VOICES)).toBe(1)
})

test('the file name is the builder\'s own arithmetic, in the side\'s tongue', { tag: '@nodata' }, () => {
  // A firing line (category 1): lines 1..6 land in file 02, 7..12 in 03 —
  // `if (line > 6) { category++; line -= 6 } category++` (0x43b215).
  expect(voiceFile(1, 1)).toBe('Speech/Sku1/Pig01/01EN0201.wav')
  expect(voiceFile(1, 7)).toBe('Speech/Sku1/Pig01/01EN0301.wav')
  // The TURN line passes category 0, which becomes file 01.
  expect(voiceFile(3, 2, 0)).toBe('Speech/Sku1/Pig03/03EN0102.wav')
  // …and the language is pasted where the exe pastes it, between the folder
  // number and the category.
  expect(voiceFile(3, 2, 0, 'RU')).toBe('Speech/Sku1/Pig03/03RU0102.wav')
  expect(voiceFile(9, 12, 3, 'JA')).toBe('Speech/Sku1/Pig09/09JA0506.wav')
})

test('a nation speaks its SKIN\'s row, and Lard falls back to English', { tag: '@nodata' }, () => {
  // Nation order is British, French, American, Russian, Japanese, German;
  // skin order is British, American, French, German, Russian, Japanese — so
  // the two disagree in the middle, and this is the disagreement.
  expect(speechOf(0)).toBe('EN')
  expect(speechOf(1)).toBe('FR')
  expect(speechOf(2)).toBe('AM')
  expect(speechOf(3)).toBe('RU')
  expect(speechOf(4)).toBe('JA')
  expect(speechOf(5)).toBe('GE')
  // TL ships no files at all and the exe never selects it: Lard pigs carry an
  // origin nation our roster has no room for. `[deliberate]`.
  expect(speechOf(LARD)).toBe('EN')
  expect(SKIN_SPEECH).not.toContain('TL')
})

/** A spawn marker, the way unit/nations.spec.ts builds one: the side is a
 * flag BIT and the campaign's own is field 28. */
const marker = (side: number, player: boolean, x = 0): MapObject => {
  const fields = new Int16Array(31)
  fields[28] = player ? 1 : 0
  return {
    name: 'GR_ME',
    id: x,
    type: 0,
    x,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    shape: 0,
    box: { x: 0, y: 0, z: 0 },
    flags: 1 << (8 + side),
    contents: null,
    fields
  } as unknown as MapObject
}

test('a squad hands each pig the voice its NAME earns', { tag: '@nodata' }, () => {
  const teams: Team[] = [
    { name: 'TOMMYS', pigNames: ['JONES', 'DEN', 'BASIL', 'GINGER', 'MONTY'] },
    { name: 'LES', pigNames: ['PIERRE', 'JACQUES', 'ANDRE', 'RENE', 'CLAUDE'] }
  ]
  const objects = [
    marker(0, true, 1),
    marker(0, true, 2),
    marker(5, false, 3),
    marker(5, false, 4)
  ]
  // The CAMPAIGN's own side is fielded off the roster, and its names came out
  // of this very list at NEW GAME — so BASIL keeps BASIL's voice even though
  // it stands in slot 0 of a three-pig mission.
  const squads = mapSquads(objects, teams, [0, 1], {
    name: 'MINE',
    pigs: [
      { name: 'BASIL', pigClass: 0 },
      { name: 'JONES', pigClass: 0 }
    ]
  })
  expect(squads[0].pigVoices).toEqual([3, 1])
  // The enemy takes its own nation's list in order.
  expect(squads[1].pigVoices).toEqual([1, 2])
})

test('a DRAFTED pig, whose name is nobody\'s row, takes its slot', { tag: '@nodata' }, () => {
  const teams: Team[] = [
    { name: 'TOMMYS', pigNames: ['JONES', 'DEN', 'BASIL'] },
    { name: 'LES', pigNames: ['PIERRE', 'JACQUES'] }
  ]
  const objects = [marker(0, true, 1), marker(0, true, 2), marker(5, false, 3)]
  const squads = mapSquads(objects, teams, [0, 1], {
    name: 'MINE',
    pigs: [
      { name: 'DRAFT1', pigClass: 0 },
      { name: 'BASIL', pigClass: 0 }
    ]
  })
  expect(squads[0].pigVoices).toEqual([1, 3])
})
