// SRL — the game's sound bank index. Pure, like the rest of src/lib/formats.
//
// Plain CRLF text, and the one format here that is not binary at all:
//
//     099            how many entries
//     000
//     000
//     AUDIO\SFXDAY   the bank's own name
//     0              then, per entry, its id …
//     AUDIO\AMB_1D.wav        … and its file
//     1
//     AUDIO\AMB_2D.wav
//     …
//
// Three ship: `Audio/sfxday.srl` and `Audio/sfxnight.srl` — 99 entries each
// and byte-identical, so the PC release has no separate night bank — and
// `FESounds/Fesounds.srl`, 27 entries for the frontend.
//
// It matters because the exe refers to a sound by NUMBER. Anything decoded
// out of the disassembly that plays a sound will name an index, and this is
// what turns it into a file.

export interface SoundEntry {
  /** The index the game refers to this sound by. */
  id: number
  /** Path as stored, backslashes and all, relative to the install. */
  path: string
  /** Base name without directory or extension, upper-cased: `FT_GRASS`. */
  name: string
}

export interface SoundBank {
  /** The bank's own name, as the file gives it (`AUDIO\SFXDAY`). */
  name: string
  entries: SoundEntry[]
}

const baseName = (path: string): string =>
  path
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, '')
    .toUpperCase()

export function parseSrl(data: Uint8Array): SoundBank {
  const lines = new TextDecoder('latin1')
    .decode(data)
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
  if (lines.length < 4) throw new Error(`SRL has ${lines.length} lines, too few for a header`)

  const count = Number.parseInt(lines[0], 10)
  if (!Number.isFinite(count)) throw new Error(`SRL count is ${JSON.stringify(lines[0])}`)
  const name = lines[3]

  const entries: SoundEntry[] = []
  for (let line = 4; line + 1 < lines.length; line += 2) {
    const id = Number.parseInt(lines[line], 10)
    if (!Number.isFinite(id)) throw new Error(`SRL entry id is ${JSON.stringify(lines[line])}`)
    const path = lines[line + 1]
    entries.push({ id, path, name: baseName(path) })
  }
  if (entries.length !== count) {
    throw new Error(`SRL says ${count} sounds, lists ${entries.length}`)
  }
  return { name, entries }
}
