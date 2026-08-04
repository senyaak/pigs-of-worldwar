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
      return { name: entry.name, width: 1, height: 1, rgba: new Uint8Array([255, 0, 255, 255]) }
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
