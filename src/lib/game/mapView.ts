// THE MAP VIEW — the camera FLIES over the field, and it flies a figure-eight.
//
// It is the exe's camera mode 7, and two things enter it: skill 63 MAP VIEW,
// and the PAUSE (0x49205F sets it, the old mode is put back on the way out).
// So a paused mission is not a still picture: the world stops and the camera
// goes travelling. Play named it before it was built — "камера летает по кругу
// над картой" — and named the mistake in the first attempt too: switching
// SUBJECT pig by pig is the VICTORY camera (`lib/game/endOfGame.ts`), not this
// one.
//
// Every number here is read out of the per-frame handler 0x4A4D40, which was
// disassembled to its last instruction on 2026-08-19 after a first pass had
// missed the whole of the flight:
//
// ```
// 4a4e51  mov ax,[ebp+7Ah]                 ; the bearing
// 4a4e5e  add eax,6                        ; +6 of 4096, EVERY FRAME
// 4a4e64  fld  qword ptr [edx+ecx*8]       ; cos(theta)
// 4a4e67  add  ecx,ecx                     ; the sine's index is DOUBLED
// 4a4e74  fld  qword ptr [edx+ecx*8+8000h] ; sin(2*theta)
// 4a4e83  fmul dword ptr [4BD6E8h]         ; x 11000.0f
// ```
//
// So the flight path is `x = R·cos(θ)`, `z = R·sin(2θ)` — a 1:2 Lissajous,
// which is a FIGURE-EIGHT and not a circle, around the world origin. The
// bearing is unconditional: it advances whether or not the subject changes,
// which is why one pig on the field still gets a flight (the first pass
// concluded it would park, and that was wrong).
//
// **The radius is not the mode's table row.** Row 7 of 0x4D9528 does read
// (11000, 1024, 0), but nothing reads that row: the only two references to
// 11000 in the image are the float `[0x4BD6E8]` at 0x4A4E85 and 0x4A4E94. The
// match is a coincidence of authoring.
//
// Pure: numbers in, a point out.

import { fromExeY } from './terrain'

/** A full turn in the game's own angle units. */
export const TURN_UNITS = 4096
/** `[0x4BD6E8]`, the mode's own hardcoded half-extent. */
export const ORBIT_RADIUS = 11000
/** `add eax,6` (0x4A4E5E) — of 4096, every exe frame. */
export const ORBIT_STEP = 6
/** One lap of the long axis: 4096/6 frames, a bit under twenty-three seconds. */
export const ORBIT_FRAMES = TURN_UNITS / ORBIT_STEP

/**
 * How high it flies: `[landscape+0x30]`, filled at heightmap load with
 * `max(h*2)` over every vertex (0x4A5789). The exe's vertical units are the
 * doubled ones, so `fromExeY(2·h)` is `h` — the flight sits at exactly the
 * height of the map's own highest ground, which is what `TerrainQuery.peak`
 * already is. Fixed for the whole map; it never varies with the bearing.
 *
 * …with one clamp, in the mover: `y = max(y, HeightAt(x, z) + 0x300)`
 * (0x4A0C0B). On any map whose peak clears 768 units it never fires.
 */
export const FLOOR_CLEARANCE = fromExeY(0x300)

/** How long one pig is looked at: `cmp ecx,7Dh` tested BEFORE the increment. */
export const DWELL_FRAMES = 0x7d + 1
/**
 * …and the one thing that cuts a look short: the flight coming within this of
 * the pig it is watching, measured in XZ alone (`cmp eax,1286BB5h`, 0x4A4F3C
 * and again in the search at 0x4A4FE4 — the next subject has to be at least
 * this far off too).
 *
 * A first pass also listed "or leaves the screen". There is no frustum test
 * anywhere in the routine; what was misread is the `+0x30` DRAW flag, which is
 * the eligibility filter rather than an early-out.
 */
export const NEAR_ENOUGH = Math.sqrt(0x1286bb5)

/**
 * The three easings, each per exe frame, each the mode's own.
 *
 * The look-at point is the reason a change of subject reads as a sweep rather
 * than a cut: 1/13 a frame closes about nine tenths of the gap in a second.
 * `0x4A0A70` picks that factor for mode 7 alone (`cmp [cam+0x84],7`, 0x4A0A7C);
 * every other mode gets a third.
 */
export const LOOK_EASE = 1 / 13
/** The camera chasing its own flight point: 1/6 across, 1/5 up (0x4A0D07). */
export const MOVE_EASE_XZ = 1 / 6
export const MOVE_EASE_Y = 1 / 5

/**
 * A per-frame easing factor applied over `frames` of them — which is what a
 * variable frame rate needs and a fixed one does not. `1 − (1−f)^n` is the
 * same curve sampled anywhere along it, so the flight looks the same at 30 and
 * at 144.
 */
export const easeOver = (factor: number, frames: number): number =>
  1 - Math.pow(1 - factor, Math.max(0, frames))

/** Where the flight is at `bearing`, in the game's own angle units. */
export function orbitPoint(bearing: number): { x: number; z: number } {
  const theta = (bearing / TURN_UNITS) * Math.PI * 2
  return { x: ORBIT_RADIUS * Math.cos(theta), z: ORBIT_RADIUS * Math.sin(theta * 2) }
}

/** The bearing `frames` later, wrapped the way the exe's `and eax,0FFFh` does. */
export const advanceBearing = (bearing: number, frames: number): number =>
  ((bearing + ORBIT_STEP * frames) % TURN_UNITS + TURN_UNITS) % TURN_UNITS
