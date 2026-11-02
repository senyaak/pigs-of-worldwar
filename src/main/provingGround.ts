// The proving ground, loaded: the remake's own map, put together out of the
// installed game's archives at the moment it is opened.
//
// Its ground and its records are BUILT, in the engine (lib/game/provingGround.ts,
// lib/game/provingTerrain.ts) — nothing is read for them and nothing is written
// into the install. What comes off the disk is the art: the ground's textures
// out of CAMP.PTG, and each model out of the shipped archive that carries it,
// in that archive's own textures (lib/game/provingSources.ts).
//
// The answer has the shape `loadTerrain` and `loadMapObjects` give a shipped
// map, so everything downstream treats the proving ground as one.

import { promises as fs } from 'node:fs'

import { parsePtg } from '../lib/formats/ptg'
import { SPAWNED_MODELS } from '../lib/game/ammo'
import { provingGroundObjects } from '../lib/game/provingGround'
import { provingGroundBlocks } from '../lib/game/provingTerrain'
import { GROUND_TEXTURES, PROVING_ARCHIVES, SPAWNED_ARCHIVE } from '../lib/game/provingSources'
import { loadProps } from './assets'
import type { LoadedMapObjects, LoadedProp, LoadedTerrain } from './assets'

export interface LoadedProvingGround {
  terrain: LoadedTerrain
  objects: LoadedMapObjects
}

/**
 * Build the proving ground and dress it. `resolve` turns a path relative to
 * the install into one on disk — the IPC handler's validated one in the app,
 * a plain join in a headless spec.
 */
export async function loadProvingGround(resolve: (relPath: string) => string): Promise<LoadedProvingGround> {
  const textures = parsePtg(await fs.readFile(resolve(GROUND_TEXTURES)))
  const objects = provingGroundObjects()
  const wanted = new Set(objects.map((object) => object.name.toUpperCase()))

  const props: LoadedProp[] = []
  for (const { archive, models } of PROVING_ARCHIVES) {
    props.push(...(await loadProps(resolve(archive), models.filter((name) => wanted.has(name)))))
  }
  // What the engine spawns rather than places — a mine on the ground, a
  // rocket in flight — comes off a map archive too (lib/game/ammo.ts).
  props.push(...(await loadProps(resolve(SPAWNED_ARCHIVE), SPAWNED_MODELS)))

  return { terrain: { blocks: provingGroundBlocks(), textures }, objects: { objects, props } }
}
