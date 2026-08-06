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
import { parsePmg } from '../lib/formats/pmg'
import type { TerrainBlock } from '../lib/formats/pmg'
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
  width: number
  height: number
  rgba: Uint8Array
}

/** A frontend image out of FEBmps/FEBMP.MAD, by entry name (MGL → BMP). */
export async function loadFrontendImage(gameDir: string, entryName: string): Promise<FrontendImage> {
  const madPath = path.join(gameDir, 'FEBmps', 'FEBMP.MAD')
  const data = await fs.readFile(madPath)
  const entry = parseArchive(data).entries.find((e) => e.name.toLowerCase() === entryName.toLowerCase())
  if (!entry) throw new Error(`no ${entryName} in FEBMP.MAD`)
  return parseBmp(decodeMgl(data.subarray(entry.offset, entry.offset + entry.size)))
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
  for (const name of new Set(objects.map((object) => object.name))) {
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
