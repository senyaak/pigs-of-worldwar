// Just enough rotation maths for the engine to pose a skeleton of its own.
//
// The renderer has had three's for this all along, which is precisely the
// problem: where a bone IS decides where a shot starts, where a blade sweeps
// and where the scope's eye sits, and a rule cannot ask a scene graph for it
// (lib/game/pose.ts). None of it is clever — it is three's own conventions,
// written out, so the pose the rules work in and the pose that gets drawn are
// the same arithmetic rather than two implementations that agree by luck.

import type { Point } from './pose'

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export const NO_TURN: Quat = { x: 0, y: 0, z: 0, w: 1 }

/**
 * Euler angles to a quaternion, applied X then Y then Z.
 *
 * The order is not a choice: motion capture is smooth, and XYZ minimises
 * frame-to-frame joint travel over the shipped clips by a wide margin
 * (three/clips.ts has the measurement and the rest of the convention).
 */
export function fromEulerXYZ(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2)
  const c2 = Math.cos(y / 2)
  const c3 = Math.cos(z / 2)
  const s1 = Math.sin(x / 2)
  const s2 = Math.sin(y / 2)
  const s3 = Math.sin(z / 2)
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 + s1 * s2 * c3,
    w: c1 * c2 * c3 - s1 * s2 * s3
  }
}

/** `a` then `b`… the other way round: this is a·b, the rotation that applies b
 * first and a second, which is what composing a bone onto its parent wants. */
export function multiply(a: Quat, b: Quat): Quat {
  return {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  }
}

/** The short way round, which is what an animation between two keyframes is. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  if (t <= 0) return a
  if (t >= 1) return b
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
  // The two halves of the sphere are the same rotation; take the near one or
  // a limb spins the long way round between frames.
  let end = b
  if (cos < 0) {
    cos = -cos
    end = { x: -b.x, y: -b.y, z: -b.z, w: -b.w }
  }
  // Barely apart: lerp and normalise, which is both cheaper and steadier than
  // dividing by a sine that is on its way to zero.
  if (cos > 0.9995) {
    const near = {
      x: a.x + (end.x - a.x) * t,
      y: a.y + (end.y - a.y) * t,
      z: a.z + (end.z - a.z) * t,
      w: a.w + (end.w - a.w) * t
    }
    const size = Math.hypot(near.x, near.y, near.z, near.w) || 1
    return { x: near.x / size, y: near.y / size, z: near.z / size, w: near.w / size }
  }
  const angle = Math.acos(cos)
  const sin = Math.sin(angle)
  const from = Math.sin((1 - t) * angle) / sin
  const to = Math.sin(t * angle) / sin
  return {
    x: a.x * from + end.x * to,
    y: a.y * from + end.y * to,
    z: a.z * from + end.z * to,
    w: a.w * from + end.w * to
  }
}

/** Turn a point by a rotation. */
export function turn(q: Quat, at: Point): Point {
  const ix = q.w * at.x + q.y * at.z - q.z * at.y
  const iy = q.w * at.y + q.z * at.x - q.x * at.z
  const iz = q.w * at.z + q.x * at.y - q.y * at.x
  const iw = -q.x * at.x - q.y * at.y - q.z * at.z
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
  }
}

/** A turn about the vertical, which is the only one a pig's own facing is. */
export const aboutY = (radians: number): Quat => ({
  x: 0,
  y: Math.sin(radians / 2),
  z: 0,
  w: Math.cos(radians / 2)
})
