// What the 3D scene hands the dashboard once a frame, and nothing else.
//
// These two shapes are the ONLY thing the scene and the HUD have in common:
// the scene owns the camera, so only it can say where a point in the world
// lands on the screen, and the HUD owns the letters, so only it can draw the
// result. Before this module they said so by importing each other — the HUD
// took `FloatingNumber` out of `three/damageNumbers.ts` while `three/squad.ts`
// took `PigPlate` and the plate's own `lift` out of `ui/hud.ts` — which is a
// cycle between two domains that are supposed to be swappable.
//
// So the contract lives on its own, imports nobody, and both sides depend on
// it instead of on each other. Anything that is a NUMBER of the layout stays
// in `ui/hud.ts` and is passed IN: the scene projects, it does not decide how
// far over a pig's head its name floats.

/** Where one living pig's name plate hangs, in CSS pixels. */
export interface PigPlate {
  /** Screen position of the point the name hangs over. */
  x: number
  y: number
  name: string
  /** Points, not a percentage — the maximum is the pig's CLASS's
   * (lib/game/health.ts). */
  health: number
}

/** One damage number floating off whatever was just hurt. */
export interface FloatingNumber {
  /** Screen position, CSS pixels. */
  x: number
  y: number
  /** The damage, in points — what the exe puts on the effect. */
  value: number
  /** 0 at the moment of the hit, 1 as it goes out. */
  age: number
  /** Which of the exe's two number STYLES it is: a hit takes its colour from the
   * team, a heal a fixed pink and a heart beside it (lib/game/damage.ts). */
  style: 'damage' | 'heal'
}
