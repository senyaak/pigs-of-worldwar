// Where a pig's bones are this frame — the one thing the rules cannot work
// out for themselves, asked for as a PORT rather than reached for.
//
// The exe builds a blade, a muzzle and the rifle camera's eye the same way:
// a fixed offset in the space of bone 5, the hand, put through that bone's
// pose matrix (0x440fb0). The offset is data the domain owns; the matrix is
// the animation's, and the animation is played by whatever is drawing.
//
// So the domain declares what it needs and the renderer supplies it. Today
// `three/bonePose.ts` answers by reading the skinned mesh's bone; a headless
// engine answers with forward kinematics over HIR + MCAP and nothing changes
// on this side. Without the port every blow in the game holds a reference to
// a scene graph, which is what stops the battle running anywhere but here.
//
// Everything is game space (Y-DOWN), the space the rules already work in.

import type { Pig } from './game'

export interface Point {
  x: number
  y: number
  z: number
}

/** The bone a weapon — and the rifle camera — hangs off (exe 0x475a26,
 * dll 0x1000dbd1). */
export const HAND_BONE = 5

export interface Pose {
  /**
   * Where `offset`, given in bone `bone`'s own space, has ended up in game
   * space for this pig, as of the pose that is on it right now.
   *
   * Null when this pig has no posed body to ask — a squad drawn by nothing.
   * Every caller has to mean something sensible by that: a shot that cannot
   * find its muzzle does not go off.
   */
  boneToWorld(pig: Pig, bone: number, offset: Point): Point | null
}

/**
 * A pose with no bodies behind it — what a battle nobody is drawing has. It
 * answers null to everything, so a swing measures no blade and a gun finds no
 * muzzle. The pure specs run against this; nothing in play does.
 */
export const NO_POSE: Pose = { boneToWorld: () => null }
