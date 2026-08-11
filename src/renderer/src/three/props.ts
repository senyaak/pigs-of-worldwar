// The map's placed objects — the .POG list drawn on the ground.
//
// Game space, Y-down, like everything else under the battle's converted
// root: the reader hands over x and z in the game's own convention and y as
// an ELEVATION, so the one conversion here is negating y.
//
// Geometry and materials are built once per distinct model and shared by
// every record that names it — a map is 148 objects on CAMP and 370 on
// TESTER, but only a couple of dozen models.

import * as THREE from 'three'
import type { MapObject, MapProp, Texture } from '../api'
import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'
import { modelRotationY } from '../../../lib/formats/pog'
import { RAMP_TILT, isRamp } from '../../../lib/game/ramps'
import { MODEL_SCALE } from '../../../lib/game/scale'
import { HEIGHT_SCALE } from '../../../lib/game/terrain'

/**
 * How solid a wall the view has to see through stays.
 *
 * The remake's own number, like the camera swing next door (lib/game/sightline.ts):
 * enough of the wall left to read as a wall, little enough to see a pig through it.
 */
const SEE_THROUGH = 0.25

/** The vertical the yaw turns about, and the ramp's own tilt — built once. */
const UP = new THREE.Vector3(0, 1, 0)
const TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), RAMP_TILT)

export interface MapProps {
  /** Add to the battle's game-space root; not converted on its own. */
  group: THREE.Group
  /** Records that got geometry. The rest are the `*_ME` spawn markers,
   * which have no model in the map's archive. */
  placed: number
  /** Take one record's art off the map — a crate that has been collected.
   * The geometry is shared with every other record of that model, so only
   * the mesh goes. */
  take(id: number): void
  /** Whether one record's art is on the map at all — false while the map
   * SCRIPT is still holding it back (lib/game/script.ts). */
  show(id: number, visible: boolean): void
  /** Move one record's art up or down, game space. What a crate coming down
   * under a canopy needs, and nothing else uses. */
  raise(id: number, y: number): void
  /** Where a record's art was placed, or null if it got none. */
  restingY(id: number): number | null
  /** One record's mesh, for hanging something on — a canopy over a crate on
   * its way down, and nothing else so far. */
  meshOf(id: number): THREE.Object3D | null
  /**
   * **Fade exactly these records, and put every other one back solid.**
   *
   * Play: "здание не просвечивает когда свинья внутри." WHICH records are in the
   * way is the engine's answer (lib/game/seeThrough.ts); this is the art half.
   * Once a frame.
   */
  fade(ids: readonly number[]): void
  /** How many are faded right now — what a spec can ask, since transparency is
   * not something markup can see. */
  faded(): number
  dispose(): void
}

export function buildMapProps(
  objects: MapObject[],
  props: MapProp[],
  textures: Texture[]
): MapProps {
  const group = new THREE.Group()
  const built = new Map<string, { geometry: THREE.BufferGeometry; materials: THREE.Material[] }>()
  for (const prop of props) {
    built.set(prop.name, {
      geometry: buildModelGeometry(prop.model, textures),
      // **UNLIT, and `modelMesh.ts` says why in full**: half of what a prop's
      // NO2 holds is not normals but fragments of the game's own machine code,
      // and a quad's normal indices are its vertex indices, so the faces point
      // straight into it. The original cannot be lighting props off that. This
      // puts them on the same footing as the ground, which has always been unlit
      // because the art carries its own light.
      materials: buildTextureMaterials(prop.model, textures, { lit: false })
    })
  }

  /**
   * A see-through copy of each model's materials, made on demand.
   *
   * Cloning rather than turning the shared originals transparent: every record of
   * a model shares one material array, so the house's near wall and its far wall
   * are the same object and fading one would fade the lot. A clone shares its
   * TEXTURE (three copies the map by reference), so this costs a material and not
   * an upload.
   *
   * `depthWrite` off, or a faded wall would still hide the pig behind it — the
   * whole point of the fade — and the pig is drawn in its own pass anyway.
   */
  const ghosts = new Map<string, THREE.Material[]>()
  const ghostOf = (name: string): THREE.Material[] | null => {
    const solid = built.get(name)
    if (!solid) return null
    const had = ghosts.get(name)
    if (had) return had
    const made = solid.materials.map((one) => {
      const copy = one.clone()
      copy.transparent = true
      copy.opacity = SEE_THROUGH
      copy.depthWrite = false
      return copy
    })
    ghosts.set(name, made)
    return made
  }
  /** Which records are faded as of the last `fade` call. */
  const dim = new Set<number>()

  let placed = 0
  /** Every placed mesh by its record's id, so one can be taken away again. */
  const byId = new Map<number, THREE.Mesh>()
  /** …and where each one belongs, so a crate that came down under a canopy
   * can be set back on its own spot. */
  const restingY = new Map<number, number>()
  for (const object of objects) {
    const model = built.get(object.name)
    if (!model) continue
    const mesh = new THREE.Mesh(model.geometry, model.materials)
    mesh.name = object.name
    byId.set(object.id, mesh)
    // Stored y is an ELEVATION in the PMG's own height space, so it rides
    // HEIGHT_SCALE exactly as the ground does; game space is Y-down, hence
    // the negation.
    mesh.position.set(object.x, -object.y * HEIGHT_SCALE, object.z)
    restingY.set(object.id, mesh.position.y)
    // The yaw is about the vertical and outside everything else; a RAMP is
    // then tilted about its OWN z, which is what stands its flat face up as
    // the slope (lib/game/ramps.ts).
    mesh.quaternion.setFromAxisAngle(UP, modelRotationY(object.yaw))
    if (isRamp(object.name)) mesh.quaternion.multiply(TILT)
    // A VTX unit is half a world unit (lib/game/scale.ts). The record's
    // position is already the world's, so the scale goes on the mesh alone
    // and a prop shrinks about its own origin — which the POG puts at the
    // model's CENTRE, so it stays where it was placed.
    mesh.scale.setScalar(MODEL_SCALE)
    // **A FIXED DRAW ORDER, and that is what stops the house flickering.**
    //
    // Play: "дом имеет мерцающие текстуры." Measured, and it is the MAP's own
    // art: CAMP's house is eighteen wall, floor and roof pieces, and at every
    // corner two wall pieces overlap by exactly 64 units — the wall's own
    // thickness — so their big faces are COPLANAR. Twelve such pairs, each
    // 64×512×64 (the same measurement over the AABBs of the placed models).
    //
    // The original never minded, because it has no depth buffer to fight over: a
    // PSX-style renderer sorts its polygons and draws them in that order, so the
    // second of two coplanar faces simply lands on the first. Three.js keeps a
    // z-buffer and `LessEqualDepth`, so at equal depth the LAST one drawn wins —
    // and its opaque sort falls back to distance from the camera, which reorders
    // the pair as the camera moves. That flip, once a frame, IS the flicker.
    //
    // `renderOrder` is the first key of that sort, ahead of the material and the
    // distance, so one distinct value per record makes the order the map's own
    // and fixes which face wins for good. It costs the material batching across
    // props, which for a map's hundred-odd objects is nothing.
    mesh.renderOrder = object.id
    group.add(mesh)
    placed++
  }

  return {
    group,
    placed,
    take(id) {
      const mesh = byId.get(id)
      if (!mesh) return
      group.remove(mesh)
      byId.delete(id)
    },
    show(id, visible) {
      const mesh = byId.get(id)
      if (mesh) mesh.visible = visible
    },
    raise(id, y) {
      const mesh = byId.get(id)
      if (mesh) mesh.position.y = y
    },
    restingY: (id) => restingY.get(id) ?? null,
    meshOf: (id) => byId.get(id) ?? null,
    fade(ids) {
      const want = new Set(ids)
      for (const id of dim) {
        if (want.has(id)) continue
        const mesh = byId.get(id)
        const solid = mesh && built.get(mesh.name)
        if (mesh && solid) mesh.material = solid.materials
      }
      for (const id of want) {
        if (dim.has(id)) continue
        const mesh = byId.get(id)
        const ghost = mesh && ghostOf(mesh.name)
        if (mesh && ghost) mesh.material = ghost
      }
      dim.clear()
      for (const id of want) dim.add(id)
    },
    faded: () => dim.size,
    dispose() {
      group.clear()
      byId.clear()
      restingY.clear()
      for (const { geometry, materials } of built.values()) disposeMesh(geometry, materials)
      // The ghosts share their maps with the originals, which have just been
      // disposed of, so only the material goes.
      for (const materials of ghosts.values()) for (const one of materials) one.dispose()
      ghosts.clear()
      dim.clear()
    }
  }
}
