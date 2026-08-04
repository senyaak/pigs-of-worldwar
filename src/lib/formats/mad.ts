// MAD/MTD archive reader (docs/formats.md). Pure — no fs, no Electron — so it
// can run in the main process, a worker, or a test alike.

export interface ArchiveEntry {
  name: string
  offset: number
  size: number
}

export interface Archive {
  /** 'named': 24-byte entries with names. 'raw': 8-byte entries (mcap.mad). */
  kind: 'named' | 'raw'
  entries: ArchiveEntry[]
}

const NAMED_ENTRY = 24
const RAW_ENTRY = 8
const NAME_LEN = 16

function readName(data: Uint8Array, offset: number): string | null {
  let name = ''
  for (let i = 0; i < NAME_LEN; i++) {
    const byte = data[offset + i]
    if (byte === 0) break
    // Printable ASCII or it is not a name — the raw layout has none, and this
    // check is what tells the two layouts apart.
    if (byte < 0x20 || byte > 0x7e) return null
    name += String.fromCharCode(byte)
  }
  return name.length > 0 ? name : null
}

function tryParseNamed(data: Uint8Array, view: DataView): ArchiveEntry[] | null {
  if (data.byteLength < NAMED_ENTRY) return null
  const tableEnd = view.getUint32(NAME_LEN, true)
  if (tableEnd === 0 || tableEnd % NAMED_ENTRY !== 0 || tableEnd > data.byteLength) return null
  const entries: ArchiveEntry[] = []
  for (let o = 0; o < tableEnd; o += NAMED_ENTRY) {
    const name = readName(data, o)
    if (name === null) return null
    const offset = view.getUint32(o + NAME_LEN, true)
    const size = view.getUint32(o + NAME_LEN + 4, true)
    if (offset < tableEnd || offset + size > data.byteLength) return null
    entries.push({ name, offset, size })
  }
  return entries
}

function tryParseRaw(data: Uint8Array, view: DataView): ArchiveEntry[] | null {
  if (data.byteLength < RAW_ENTRY) return null
  const tableEnd = view.getUint32(0, true)
  if (tableEnd === 0 || tableEnd % RAW_ENTRY !== 0 || tableEnd > data.byteLength) return null
  const entries: ArchiveEntry[] = []
  for (let o = 0; o < tableEnd; o += RAW_ENTRY) {
    const offset = view.getUint32(o, true)
    const size = view.getUint32(o + 4, true)
    if (offset < tableEnd || offset + size > data.byteLength) return null
    entries.push({ name: `#${String(o / RAW_ENTRY).padStart(3, '0')}`, offset, size })
  }
  return entries
}

/** Parse a MAD/MTD archive; throws if the data fits neither layout. */
export function parseArchive(data: Uint8Array): Archive {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const named = tryParseNamed(data, view)
  if (named) return { kind: 'named', entries: named }
  const raw = tryParseRaw(data, view)
  if (raw) return { kind: 'raw', entries: raw }
  throw new Error('data does not match the named or raw MAD/MTD layout')
}
