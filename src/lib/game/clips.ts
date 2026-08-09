// How long an animation runs.
//
// One number and one function, and neither draws anything: the domain times a
// swing, a get-out and a get-up against the CLIP, so it has to know the rate.
// It lived in `three/clips.ts` beside the mixer that plays them, which meant
// the rules asked the renderer how long their own events lasted.

/** A clip, as far as timing is concerned — the readers hand back more
 * (lib/formats/mcap.ts) and none of the rest matters here. */
export interface ClipTiming {
  frameCount: number
}

/**
 * The rate the clips play at.
 *
 * It is NOT the rate they would have to play at for the hooves to stay put:
 * the run clip's planted hoof sweeps about 38 units a frame, so at 25 it
 * carries a body some 960 units a second while the exe walks 1560, and the
 * pig slides by half as much again. Driving playback off the walking speed
 * instead was tried and read plainly WRONG in play — the legs whirl. So the
 * original slid its pigs too, and this stays a flat 25.
 * (`movement/stride.js` has the measurement.)
 */
export const CLIP_FPS = 25

/** How long a clip runs at `CLIP_FPS`, in seconds. */
export const clipSeconds = (clip: ClipTiming | null | undefined): number =>
  clip ? clip.frameCount / CLIP_FPS : 0
