// Loading game assets off disk through the pure format readers in
// src/lib/formats/. Everything here takes absolute paths that were already
// validated by gameDir.insideGameDir.

import { promises as fs } from 'node:fs'
import path from 'node:path'

import { parseArchive } from '../lib/formats/mad'
import type { ArchiveEntry } from '../lib/formats/mad'
import { boneWorldOffsets, parseHir } from '../lib/formats/hir'
import type { Bone } from '../lib/formats/hir'
import { parseModel } from '../lib/formats/model'
import type { Model } from '../lib/formats/model'
import { parseTim } from '../lib/formats/tim'
import type { Tim } from '../lib/formats/tim'
import { parseMcapClip } from '../lib/formats/mcap'
import type { McapClip } from '../lib/formats/mcap'
import { decodeMgl } from '../lib/formats/mgl'
import { parseBmp } from '../lib/formats/bmp'
import { punchBlack, punchIndexZero, punchMagenta } from '../lib/formats/alpha'
import { parseTab } from '../lib/formats/tab'
import type { GlyphTable } from '../lib/formats/tab'
import { parseText } from '../lib/formats/text'
import { parsePmg } from '../lib/formats/pmg'
import type { TerrainBlock } from '../lib/formats/pmg'
import { SPAWNED_MODELS } from '../lib/game/ammo'
import { parsePog } from '../lib/formats/pog'
import type { MapObject } from '../lib/formats/pog'
import { parsePtg } from '../lib/formats/ptg'
import { parseSrl } from '../lib/formats/srl'
import type { SoundBank } from '../lib/formats/srl'

export interface LoadedModel {
  model: Model
  textures: (Tim & { name: string })[]
  /** The .HIR skeleton the model binds to, when one sits next to the archive. */
  skeleton: Bone[]
}

export interface NamedClip extends McapClip {
  name: string
}

/** The skeleton file sitting next to an archive (Chars/pig.HIR), if any. */
async function siblingSkeleton(dir: string): Promise<Bone[]> {
  const siblings = await fs.readdir(dir)
  const hirName = siblings.find((name) => name.toLowerCase().endsWith('.hir'))
  if (!hirName) return []
  return parseHir(await fs.readFile(path.join(dir, hirName)))
}

/** The paired texture archive: same base name, .mtd extension. */
async function pairedTextures(full: string): Promise<(Tim & { name: string })[]> {
  const dir = path.dirname(full)
  const stem = path.basename(full).replace(/\.mad$/i, '')
  const siblings = await fs.readdir(dir)
  const mtdName = siblings.find((name) => name.toLowerCase() === `${stem.toLowerCase()}.mtd`)
  if (!mtdName) return []
  const mtdData = await fs.readFile(path.join(dir, mtdName))
  // Undecodable entries become 1×1 placeholders so face texture indices keep
  // lining up with entry order.
  return parseArchive(mtdData).entries.map((entry) => {
    try {
      return { name: entry.name, ...parseTim(mtdData.subarray(entry.offset, entry.offset + entry.size)) }
    } catch {
      return {
        name: entry.name,
        width: 1,
        height: 1,
        rgba: new Uint8Array([255, 0, 255, 255]),
        palette: new Uint16Array(),
        indices: new Uint8Array(1)
      }
    }
  })
}

/** A model out of a .mad archive: geometry, paired textures, skeleton. */
export async function loadModel(full: string, base: string): Promise<LoadedModel> {
  const data = await fs.readFile(full)
  const { entries } = parseArchive(data)
  const slice = (ext: string): Uint8Array => {
    const wanted = `${base}${ext}`.toLowerCase()
    const entry: ArchiveEntry | undefined = entries.find((e) => e.name.toLowerCase() === wanted)
    if (!entry) throw new Error(`no ${base}${ext} in ${path.basename(full)}`)
    return data.subarray(entry.offset, entry.offset + entry.size)
  }

  // Vertices are bone-local; without the skeleton's accumulated offsets every
  // body part piles up around the origin (docs/formats.md).
  const skeleton = await siblingSkeleton(path.dirname(full))
  const boneOffsets = skeleton.length > 0 ? boneWorldOffsets(skeleton) : undefined

  return {
    model: parseModel(slice('.VTX'), slice('.NO2'), slice('.FAC'), boneOffsets),
    textures: await pairedTextures(full),
    skeleton
  }
}

export interface FrontendImage {
  /** The FEBMP.MAD entry name, without its `.mgl` extension. */
  name: string
  width: number
  height: number
  /** RGBA with the magenta key already punched to transparent. */
  rgba: Uint8Array
}

/**
 * Frontend images out of FEBmps/FEBMP.MAD, by entry name (MGL → BMP), with
 * the sprite key punched. The whole screen's art comes out of one read of
 * the archive, so ask for every sprite at once.
 *
 * A name matches with or without its extension: the archive spells some
 * entries `.mgl` and a handful `.mgl1`.
 */
export async function loadFrontendImages(
  gameDir: string,
  entryNames: string[]
): Promise<FrontendImage[]> {
  const madPath = path.join(gameDir, 'FEBmps', 'FEBMP.MAD')
  const data = await fs.readFile(madPath)
  const stem = (name: string): string => name.replace(/\.mgl1?$/i, '').toLowerCase()
  const byName = new Map(parseArchive(data).entries.map((entry) => [stem(entry.name), entry]))
  return entryNames.map((wanted) => {
    const entry = byName.get(stem(wanted))
    if (!entry) throw new Error(`no ${wanted} in FEBMP.MAD`)
    const bmp = parseBmp(decodeMgl(data.subarray(entry.offset, entry.offset + entry.size)))
    return { name: stem(wanted), width: bmp.width, height: bmp.height, rgba: punchMagenta(bmp) }
  })
}

export interface LoadedFont {
  name: string
  atlas: { width: number; height: number; rgba: Uint8Array }
  table: GlyphTable
}

/**
 * A frontend font: `FEText/<name>.BMP` and its `.TAB`, which is the pair the
 * PC build itself loads (the sibling `.tim`s are the PSX's). The atlas comes
 * back with palette entry 0 transparent.
 *
 * The directory is searched case-insensitively — the install spells the same
 * font `CHARS2.tab` and `Chars2.bmp`.
 */
export async function loadFont(gameDir: string, name: string): Promise<LoadedFont> {
  const dir = path.join(gameDir, 'FEText')
  const siblings = await fs.readdir(dir)
  const find = (file: string): string => {
    const found = siblings.find((sibling) => sibling.toLowerCase() === file.toLowerCase())
    if (!found) throw new Error(`no ${file} in FEText`)
    return path.join(dir, found)
  }
  // The light and dark variants have no table of their own — they are the
  // same glyphs in another shade, so they borrow CHARS2's.
  const tableName = /^chars2[ld]$/i.test(name) ? 'CHARS2' : name
  const bmp = parseBmp(await fs.readFile(find(`${name}.bmp`)))
  const table = parseTab(await fs.readFile(find(`${tableName}.tab`)))
  return {
    name,
    atlas: { width: bmp.width, height: bmp.height, rgba: punchIndexZero(bmp) },
    table
  }
}

export interface TimImage {
  /** The archive entry name, lower-cased and without its `.tim`. */
  name: string
  width: number
  height: number
  /** RGBA; a TIM's colour 0 is already transparent (lib/formats/tim.ts). */
  rgba: Uint8Array
}

/**
 * Every TIM in one archive — `Language/Tims/dashtims.mad` is the battle's
 * dashboard, `TBOXTIMS.MAD` the message box. One read for the lot.
 *
 * An entry that will not parse is dropped with a note rather than taking the
 * archive down: the caller asks for pieces by name and says what it needs.
 */
export async function loadTims(full: string): Promise<TimImage[]> {
  const data = await fs.readFile(full)
  const images: TimImage[] = []
  for (const entry of parseArchive(data).entries) {
    try {
      const tim = parseTim(data.subarray(entry.offset, entry.offset + entry.size))
      images.push({
        name: entry.name.replace(/\.tim$/i, '').toLowerCase(),
        width: tim.width,
        height: tim.height,
        rgba: tim.rgba
      })
    } catch (error) {
      console.warn(`${path.basename(full)}: ${entry.name} — ${String(error)}`)
    }
  }
  return images
}

/**
 * Every BMP in one archive — `Language/Tims/MENUTIMS.MAD` is the skill menu:
 * its frame plus one 56×34 icon per skill, named after the skill rather than
 * numbered (TROTTER, KNIFE, BAYONET, … in the skill list's own order), and
 * `SELECT.BMP`, the 86×52 highlight that sits over the chosen one.
 *
 * Same archive shape as the TIMs next door, different pictures inside, so
 * the transparency has to be punched here — and the two halves key on
 * DIFFERENT colours. The frame's see-through is magenta and its black is the
 * widget's own inside, which must stay; the icons and the highlight sit on
 * black fields that have to go (lib/formats/alpha.ts).
 */
export async function loadArchiveBmps(full: string): Promise<TimImage[]> {
  const data = await fs.readFile(full)
  const images: TimImage[] = []
  for (const entry of parseArchive(data).entries) {
    try {
      const bmp = parseBmp(data.subarray(entry.offset, entry.offset + entry.size))
      const name = entry.name.replace(/\.bmp$/i, '').toLowerCase()
      images.push({
        name,
        width: bmp.width,
        height: bmp.height,
        rgba: name === 'menu' ? punchMagenta(bmp) : punchBlack(bmp)
      })
    } catch (error) {
      console.warn(`${path.basename(full)}: ${entry.name} — ${String(error)}`)
    }
  }
  return images
}

/** The game's strings: `fetext` for the frontend, `gtext` for the battle. */
export async function loadGameText(gameDir: string, which: string): Promise<string[]> {
  const dir = path.join(gameDir, 'Language', 'Text')
  const siblings = await fs.readdir(dir)
  const find = (ext: string): string => {
    const wanted = `${which}.${ext}`.toLowerCase()
    const found = siblings.find((file) => file.toLowerCase() === wanted)
    if (!found) throw new Error(`no ${which}.${ext} in Language/Text`)
    return path.join(dir, found)
  }
  return parseText(await fs.readFile(find('bin')), await fs.readFile(find('ofs')))
}

export interface LoadedTerrain {
  blocks: TerrainBlock[]
  textures: Tim[]
}

/** A map's ground: the .PMG mesh plus the sibling .PTG textures. */
export async function loadTerrain(full: string): Promise<LoadedTerrain> {
  const blocks = parsePmg(await fs.readFile(full))
  const dir = path.dirname(full)
  const stem = path.basename(full).replace(/\.pmg$/i, '')
  const siblings = await fs.readdir(dir)
  const ptgName = siblings.find((name) => name.toLowerCase() === `${stem.toLowerCase()}.ptg`)
  const textures = ptgName ? parsePtg(await fs.readFile(path.join(dir, ptgName))) : []
  return { blocks, textures }
}

/** A sound bank (`Audio/sfxday.srl`, `FESounds/Fesounds.srl`). */
export async function loadSoundBank(full: string): Promise<SoundBank> {
  return parseSrl(await fs.readFile(full))
}

/**
 * One sound file, as bytes for the renderer to decode.
 *
 * Everything the game ships is plain RIFF — 16-bit PCM mono at 22050 for
 * the effects and speech, Ogg Vorbis for the music — so nothing here needs
 * a decoder of our own; Chromium has both.
 */
export async function loadSound(full: string): Promise<Uint8Array> {
  return fs.readFile(full)
}

export interface LoadedProp {
  /** The POG name this geometry answers to. */
  name: string
  model: Model
}

export interface LoadedMapObjects {
  objects: MapObject[]
  /** One entry per distinct POG name the map's .MAD actually carries. The
   * `*_ME` spawn markers have no geometry there and so are absent — the
   * caller matches by name and skips what it cannot draw. */
  props: LoadedProp[]
  /** The map's one texture archive, shared by every prop on it. */
  textures: (Tim & { name: string })[]
}

/**
 * A map's placed objects: the .POG list, the geometry each record names out
 * of the sibling .MAD, and the map's textures — parsed ONCE and shared,
 * rather than per model as `loadModel` would.
 *
 * No skeleton is passed on purpose. Maps ship no .HIR, and prop vertices are
 * already absolute; their VTX bone field carries something else (it runs
 * 0..14 on static crates and trees alike) and adding offsets for it would
 * scatter them.
 */
export async function loadMapObjects(full: string): Promise<LoadedMapObjects> {
  const objects = parsePog(await fs.readFile(full))
  const dir = path.dirname(full)
  const stem = path.basename(full).replace(/\.pog$/i, '')
  const siblings = await fs.readdir(dir)
  const madName = siblings.find((name) => name.toLowerCase() === `${stem.toLowerCase()}.mad`)
  if (!madName) return { objects, props: [], textures: [] }

  const madPath = path.join(dir, madName)
  const data = await fs.readFile(madPath)
  const { entries } = parseArchive(data)
  const byName = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry]))
  const bytes = (name: string): Uint8Array | null => {
    const entry = byName.get(name.toLowerCase())
    return entry ? data.subarray(entry.offset, entry.offset + entry.size) : null
  }

  const props: LoadedProp[] = []
  // Every model a RECORD names, plus the handful the ENGINE spawns and no record
  // places — a mine on the ground is `WE_APMIN` out of this same archive and
  // nothing in the .POG mentions it (lib/game/ammo.ts).
  for (const name of new Set([...objects.map((object) => object.name), ...SPAWNED_MODELS])) {
    const vtx = bytes(`${name}.VTX`)
    const no2 = bytes(`${name}.NO2`)
    const fac = bytes(`${name}.FAC`)
    if (!vtx || !no2 || !fac) continue
    props.push({ name, model: parseModel(vtx, no2, fac) })
  }
  return { objects, props, textures: await pairedTextures(madPath) }
}

/**
 * Motion-capture clips from the mcap.mad sitting next to an archive
 * (Chars/mcap.mad — the game's one raw archive). Empty when there is none.
 */
export async function loadClips(dirOfArchive: string): Promise<NamedClip[]> {
  const siblings = await fs.readdir(dirOfArchive)
  const mcapName = siblings.find((name) => name.toLowerCase() === 'mcap.mad')
  if (!mcapName) return []
  const data = await fs.readFile(path.join(dirOfArchive, mcapName))
  return parseArchive(data).entries.map((entry) => ({
    name: entry.name,
    ...parseMcapClip(data.subarray(entry.offset, entry.offset + entry.size))
  }))
}
