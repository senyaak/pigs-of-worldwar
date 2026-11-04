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
import { provingGroundObjects, provingGroundSigns } from '../lib/game/provingGround'
import { provingGroundBlocks } from '../lib/game/provingTerrain'
import { signBoardArt } from '../lib/game/provingSigns'
import {
  BOARD_TEXTURE,
  GROUND_TEXTURES,
  PROVING_ARCHIVES,
  SIGN_ICONS,
  SIGN_SOURCE,
  SPAWNED_ARCHIVE
} from '../lib/game/provingSources'
import { SKILL_ICON } from '../lib/game/skills'
import { loadArchiveBmps, loadProps } from './assets'
import type { LoadedMapObjects, LoadedProp, LoadedTerrain, SignBoard, TimImage } from './assets'

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

  // Each signpost wears the skill of the crate beside it, in the menu's own art.
  const icons = await loadArchiveBmps(resolve(SIGN_ICONS))
  for (const prop of props) {
    if (prop.name === SIGN_SOURCE.name) prop.boards = signBoards(prop, icons)
  }

  return { terrain: { blocks: provingGroundBlocks(), textures }, objects: { objects, props } }
}

/** A board for every signpost: the group that wears the board's texture, with
 * the icon `SKILL_ICON` names for its skill in place of it. */
function signBoards(sign: LoadedProp, icons: TimImage[]): SignBoard[] {
  const group = sign.model.groups.findIndex(
    (one) => sign.textures[one.texture]?.name.toUpperCase() === BOARD_TEXTURE
  )
  if (group < 0) throw new Error(`${sign.name} has no face group in ${BOARD_TEXTURE}`)
  return provingGroundSigns().map(({ id, skill }) => {
    const icon = icons.find((one) => one.name === SKILL_ICON[skill])
    if (!icon) throw new Error(`${SIGN_ICONS} has no icon ${SKILL_ICON[skill]} for skill ${skill}`)
    return { id, group, art: signBoardArt(icon) }
  })
}
