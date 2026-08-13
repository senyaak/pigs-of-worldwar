// Typing a name on the frontend's letter grid — the rules, with no screen.
//
// The original has no text field. It has a STRING and a cursor into it: the
// alphabet is `fetext` 0, and `[record+0x0C]` — the same field every other
// menu uses for "which item is lit" — is which character the cursor is on
// (0x4284D0). Three values past its end are three keys of their own, and their
// order is the order the art is loaded in: `chardel`, `charspc`, `charent`.
//
// Everything here is read out of `0x42AF50` and `0x42AE30`; `frontend/notes.md`
// in the disasm repo carries the addresses line by line.

/**
 * `fetext` 0, and the screen reads it from there rather than from here — this
 * copy is what the tests measure against and what a stripped install falls
 * back to. Screen 11, the level code, uses `fetext` 784, which ships
 * identical.
 */
export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ-*&'+,0123456789"

/** `[0x4C1F40]`, set by the arm that opens the screen: 0x42CE6C for a team's
 * name, 0x42CEB7 for a pig's. */
export const TEAM_NAME_MAX = 11
export const PIG_NAME_MAX = 7

/** What an unfilled place shows — `fetext` 745, taken one character at a time
 * to fill out the maximum (0x4286D4). An empty team name is eleven of these. */
export const PAD = '.'

/** The three keys past the end of the alphabet, in the order the cursor
 * reaches them. */
export const KEYS = ['delete', 'space', 'enter'] as const
export type Key = (typeof KEYS)[number]

export interface NameEntry {
  /** What has been typed. Always in capitals: the fonts have no lowercase. */
  readonly name: string
  /** Where the cursor is: below `alphabet.length` a letter, above it one of
   * `KEYS`. */
  readonly cursor: number
}

export interface Alphabet {
  readonly letters: string
  /** How many letters a row holds, and how many rows they make. The original
   * computes both from the box and the font (0x431380). */
  readonly columns: number
  readonly rows: number
}

/** How many rows `letters` needs at `columns` a row — the exe's own
 * `count / columns + 1` (0x4313D7). */
export function alphabetRows(letters: string, columns: number): number {
  return Math.floor(letters.length / columns) + 1
}

export function newEntry(name = ''): NameEntry {
  return { name, cursor: 0 }
}

/** Which key the cursor is on, or null when it is on a letter. */
export function keyAt(entry: NameEntry, alphabet: Alphabet): Key | null {
  const past = entry.cursor - alphabet.letters.length
  return past >= 0 ? KEYS[past] ?? null : null
}

/** The letter the cursor is on, or null when it is on a key. */
export function letterAt(entry: NameEntry, alphabet: Alphabet): string | null {
  return entry.cursor < alphabet.letters.length ? alphabet.letters[entry.cursor] : null
}

/**
 * Move the cursor, wrapping both ways.
 *
 * The grid is `columns` × `rows` of letters with ONE more column beside it
 * holding the three keys — which is what the walk at 0x42AE30 does when the
 * cursor is at or past the count: it takes `cursor - count` for the row and
 * the column past the last as the column, and wraps those three among
 * themselves by 3.
 */
export function moveCursor(entry: NameEntry, dx: number, dy: number, alphabet: Alphabet): NameEntry {
  const { letters, columns, rows } = alphabet
  const count = letters.length
  const onKey = entry.cursor >= count
  let column = onKey ? columns : entry.cursor % columns
  let row = onKey ? entry.cursor - count : Math.floor(entry.cursor / columns)

  column += dx
  row += dy

  if (column > columns) column = 0
  else if (column < 0) column = columns

  // The keys' column is three tall and the letters' is `rows`.
  const height = column === columns ? KEYS.length : rows
  if (row >= height) row = 0
  else if (row < 0) row = height - 1

  if (column === columns) return { ...entry, cursor: count + row }
  // A place past the last letter — the tail of the bottom row — is empty, so
  // the cursor lands on the last letter instead rather than on nothing.
  return { ...entry, cursor: Math.min(row * columns + column, count - 1) }
}

export interface Pressed {
  entry: NameEntry
  /** The finished name, once ENTER has taken it. */
  accepted?: string
  /** ENTER on an empty name, which the original answers with sound 21. */
  refused?: boolean
}

/**
 * Press whatever the cursor is on.
 *
 * A letter appends unless the name is already at `max`; SPACE appends a space
 * under the same limit (the exe writes byte 1, which is a space in the game's
 * `ASCII - 0x1F`); DELETE drops the last character; ENTER refuses an empty
 * name and otherwise hands it over.
 */
export function press(entry: NameEntry, alphabet: Alphabet, max: number): Pressed {
  const key = keyAt(entry, alphabet)
  if (key === 'delete') {
    return { entry: { ...entry, name: entry.name.slice(0, -1) } }
  }
  if (key === 'enter') {
    if (entry.name.length === 0) return { entry, refused: true }
    return { entry, accepted: entry.name }
  }
  const character = key === 'space' ? ' ' : letterAt(entry, alphabet)
  if (character === null || entry.name.length >= max) return { entry }
  return { entry: { ...entry, name: entry.name + character } }
}

/** Type a character directly — the remake's own keyboard, which the original
 * has no way to offer. Anything the alphabet does not carry is ignored. */
export function type(entry: NameEntry, alphabet: Alphabet, max: number, character: string): NameEntry {
  const upper = character.toUpperCase()
  if (upper !== ' ' && !alphabet.letters.includes(upper)) return entry
  if (entry.name.length >= max) return entry
  return { ...entry, name: entry.name + upper }
}

/** What the field SHOWS: the name, then dots out to the maximum (0x4286D4). */
export function padded(name: string, max: number): string {
  return name + PAD.repeat(Math.max(0, max - name.length))
}
