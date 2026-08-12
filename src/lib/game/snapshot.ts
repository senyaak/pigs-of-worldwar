// The battle as DATA: one flat reading of everything a picture is made of.
//
// The renderer used to walk the engine — `shots.live()`, `grenades.all()`,
// `dropIn.live()`, `battle.view()`, a pig object here, a live list there. All of
// it is free in one process and none of it survives a port: a method call is
// not a message, and an object handed over is a way to reach back in and change
// a battle you were only meant to draw.
//
// So the engine ANSWERS with this, once a step, and the renderer draws it and
// nothing else. Every field is a number, a string, a boolean or an array of
// those — structured-clone all the way down, which is what makes hosting the
// engine in its own process a transport change rather than a rewrite.
//
// What is deliberately NOT in it:
//
// - the POSE. It carries which clip and how far into it, and the renderer
//   works the bones out with the engine's own function (lib/game/clipPose.ts).
//   Sixty floats a pig a step, against four numbers — and it is the same code,
//   so there is no second implementation to drift.
// - the MAP. The ground and the map's boxes never change; whoever draws holds
//   its own copy built from the same records.
//
// Game space (Y-down) throughout.

import type { Firing } from './shot'
import type { Aftermath } from './aftermath'
import type { EndOfGame } from './endOfGame'
import type { LocomotionState } from './locomotion'
import type { Effect } from './effects'
import type { FloatingDamage } from './damage'

/** One pig, as it is drawn. */
export interface PigShot {
  id: number
  name: string
  health: number
  x: number
  y: number
  z: number
  heading: number
  /** The skill in hand, or null (lib/game/weapons.ts). */
  holding: number | null
  /** What it is wearing and how far into it — the pose, in four numbers
   * (lib/game/anim.ts). */
  clip: number | null
  clipOnce: boolean
  clipElapsed: number
  overlay: number
  overlayPhase: number
  /** Still coming down under a canopy, so it is drawn hanging and watched face
   * on (lib/game/dropIn.ts). */
  underCanopy: boolean
  /** On the opening drop at all — cut canopy or not, it is still falling. */
  arriving: boolean
  /**
   * Standing INSIDE a building, and so **not drawn at all**.
   *
   * The exe's own rule rather than a choice: both of its doors clear
   * `[pig+0x30]`, which is the byte the draw loop gates every object on
   * (lib/game/indoors.ts). It travels on the snapshot because hiding a mesh is
   * the renderer's job and being in a shelter is the engine's.
   */
  sheltered: boolean
}

/** One thing in the air. Bullets and grenades share a shape because what is
 * drawn of either is a place, a heading and which weapon threw it. */
export interface FlightShot {
  id: number
  skill: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

/** A crate coming down under a canopy — only its height moves. */
export interface DescentShot {
  id: number
  y: number
}

export interface BattleSnapshot {
  /** How many steps the battle has run. What a lockstep peer agrees on, and
   * what tells a renderer whether anything moved since it last looked. */
  step: number
  /** Whose turn, and how much of it is left. */
  turn: number
  player: string
  timeLeft: number
  starting: boolean
  over: boolean
  /** The acting pig's id. */
  acting: number
  pigs: PigShot[]
  /** The acting pig's frame-by-frame state — what the walk, the fall and the
   * swim are read off (lib/game/locomotion.ts). */
  loco: LocomotionState
  /** Where the weapon in hand points, tremor included, and what the view is
   * doing about it. */
  aimAngle: number
  scoped: boolean
  /** Whether the aim view is up at all — every weapon that aims gets one and a
   * THROWN weapon's is its own camera (lib/game/sights.ts, three/chase.ts). */
  sighting: boolean
  zoom: number
  readying: number
  still: number
  driving: boolean
  firing: Firing | null
  aftermath: Aftermath | null
  /** The mission being OVER, and which pig its camera is on — the exe's mode 2
   * (lib/game/endOfGame.ts). Null while there is a game to play. */
  ending: EndOfGame | null
  /** Whether a hand-to-hand swing is running — the camera goes side-on for it. */
  swinging: boolean
  /** Whether the level's opening drop is still going: nothing else runs while
   * it is. */
  dropping: boolean
  bullets: FlightShot[]
  lobs: FlightShot[]
  crates: DescentShot[]
  /** The rings, smoke and clouds a blow threw (lib/game/effects.ts) — already
   * plain numbers, so they travel as they are. */
  effects: Effect[]
  /** The damage floating off whatever was hit. */
  numbers: FloatingDamage[]
}
