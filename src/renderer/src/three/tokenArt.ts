// The PROMOTION-POINT token as ART: the map's own `PROPOINT` model rendered
// once into a strip of yaw frames, so a 2D screen can blit it SPINNING with
// no live scene behind it.
//
// Play placed it (2026-08-24): the debrief's token is not a badge and not a
// coin — "там прям сам объект с карты стоять должен". The exe agrees in
// kind: it spins `chars\propoint.mad` in world coordinates over the page.
// HOW it frames and lights it is unread, so the camera here is the remake's
// own (`[CHECK — remake]`): straight on, a hair above, the model unlit the
// way every model in this engine is drawn.
//
// One WebGLRenderer lives for the render and is disposed with the strip
// handed back — nothing here ticks, draws per frame, or holds GPU memory
// past the call.

import * as THREE from 'three'

import { buildModelGeometry, buildTextureMaterials, disposeMesh } from './modelMesh'
import type { Model, Texture } from '../api'

/** One square frame's edge, pixels — rendered at twice the size the debrief
 * draws it (`token.size` there), so the scale-down antialiases. The first
 * cut rendered AND drew at 32 and play could not see it: "медальки вроде
 * были но нифига не видно". */
export const TOKEN_SIZE = 96
/** How many yaw steps the strip holds — a full turn. */
export const TOKEN_FRAMES = 16

/**
 * Render `model` into a horizontal strip of TOKEN_FRAMES squares, one full
 * turn about the vertical. Transparent where the model is not.
 */
export function renderTokenStrip(model: Model, textures: Texture[]): HTMLCanvasElement {
  const geometry = buildModelGeometry(model, textures)
  const materials = buildTextureMaterials(model, textures)
  const mesh = new THREE.Mesh(geometry, materials)

  // Game space is Y-DOWN; the one conversion the whole engine uses is a
  // 180° X-rotation on a wrapping group (CLAUDE.md). The spin then turns
  // the OUTER group about the world's own up.
  const flipped = new THREE.Group()
  flipped.rotation.x = Math.PI
  flipped.add(mesh)
  const spun = new THREE.Group()
  spun.add(flipped)

  // Centre the model on its own box so it spins in place.
  geometry.computeBoundingSphere()
  const sphere = geometry.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(), 1)
  flipped.position.set(sphere.center.x, sphere.center.y, sphere.center.z).multiplyScalar(-1)
  // …undone through the flip: what the flip negates is y and z.
  flipped.position.y *= -1
  flipped.position.z *= -1

  const scene = new THREE.Scene()
  scene.add(spun)
  const camera = new THREE.PerspectiveCamera(40, 1, sphere.radius / 10, sphere.radius * 10)
  camera.position.set(0, sphere.radius * 0.5, sphere.radius * 3)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(TOKEN_SIZE, TOKEN_SIZE)

  const strip = document.createElement('canvas')
  strip.width = TOKEN_SIZE * TOKEN_FRAMES
  strip.height = TOKEN_SIZE
  const context = strip.getContext('2d')
  for (let i = 0; i < TOKEN_FRAMES; i++) {
    spun.rotation.y = (i / TOKEN_FRAMES) * 2 * Math.PI
    renderer.render(scene, camera)
    context?.drawImage(renderer.domElement, i * TOKEN_SIZE, 0)
  }

  disposeMesh(geometry, materials)
  renderer.dispose()
  return strip
}
