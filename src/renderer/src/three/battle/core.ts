// The scene's CORE: everything the battle scene built, handed whole to each
// of its parts in this folder. `three/battle.ts` builds it, in the order the
// pieces need each other.

import type { Engine } from '../../../../lib/game/engine'
import type { Game } from '../../../../lib/game/game'
import type { Obstacle } from '../../../../lib/game/obstacles'
import type { TerrainQuery } from '../../../../lib/game/terrain'
import type { SceneSound } from '../../contracts/sound'
import type { BattleAssets } from '../battle'
import type { Chase } from '../chase'
import type { DecoyArt } from '../decoyArt'
import type { DropInArt } from '../dropIn'
import type { GrenadeArt } from '../grenades'
import type { HeldWeapons } from '../heldWeapon'
import type { ActiveMarker } from '../marker'
import type { MineArt } from '../mineArt'
import type { MapProps } from '../props'
import type { RemainsArt } from '../remains'
import type { SceneHost } from '../scene'
import type { SkyArt } from '../sky'
import type { Squad } from '../squad'
import type { Tween } from '../tween'
import type { Weather } from '../weather'
import type { BrainLink } from './brainLink'
import type { SceneState } from './state'
import type { Subject } from './subject'
import * as THREE from 'three'

export interface SceneCore {
  host: SceneHost
  assets: BattleAssets
  query: TerrainQuery
  game: Game
  onGameChanged: () => void
  sounds: SceneSound
  root: THREE.Group
  sky: SkyArt | null
  weather: Weather | null
  props: MapProps
  blockers: Obstacle[]
  squad: Squad
  dropInArt: DropInArt
  marker: ActiveMarker
  chase: Chase
  subject: Subject
  link: BrainLink
  engine: Engine
  battle: Engine['battle']
  scenery: Engine['scenery']
  swings: Engine['swings']
  heals: Engine['heals']
  shots: Engine['shots']
  grenades: Engine['grenades']
  mines: Engine['mines']
  effects: Engine['effects']
  airDrops: Engine['airDrops']
  dropIn: Engine['dropIn']
  weapons: HeldWeapons
  openFov: number
  grenadeArt: GrenadeArt
  mineArt: MineArt
  remainsArt: RemainsArt
  decoyArt: DecoyArt
  tween: Tween
  state: SceneState
}
