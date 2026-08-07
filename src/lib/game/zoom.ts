// The sniper's magnification — decoded at last.
//
// `fire.md` used to list "where the sniper's extra magnification comes from"
// as unsettled. It comes from the view manager, not from the camera:
// `afSetZoom` is a library entry the exe looks up by name (0x4ad14b) and
// keeps at `[0x537fd4]`, and two thin wrappers drive it —
//
// ```
// 44f7f0  SetZoom(v)    [view+0x1172c] = clamp(v, 0, 0x1000); afSetZoom(it)
// 44f790  AddZoom(step) [view+0x1172c] += step; clamp to 0x4a0550(camera)
//                        (which answers 0x1000 unless it has a reason not to)
// 44f7e0  GetZoom()
// ```
//
// and the input handler creeps it in, once a frame, for exactly two skills:
//
// ```
// 495e59  eax = [game+0x458]            ; what is in hand
// 495e5f  edi = 0x20
// 495e64  if (eax == 0x0B || eax == 0x40)   ; SNIPER RIFLE, or BINOCULARS
// 495e75    0x44f790(0x20)              ; ...zoom in by 32 a frame
// ```
//
// Nobody ever calls the setter with anything but zero, so the ONLY way the
// view zooms is this creep, and letting the aim view go resets it (0x492907).
// Play had it exactly: "начинает с малого зума и автоматом увеличивается до
// предела".
//
// ## …and the aim slows down as it closes in
//
// The same handler scales the aim step by what is left of the zoom
// (0x495df4):
//
// ```
// zoom = GetZoom()
// step = ((0x1000 - zoom) * accumulator) >> 12
// if (step < base) step = base
// Pig::Aim(step)
// ```
//
// so at full magnification the sights crawl at the base step and no faster.
// Every other weapon passes the accumulator through untouched.
//
// Pure. What a zoom of 0x1000 does to a field of view is the renderer's, and
// `three/chase.ts` says what the remake picked.

/** `[view+0x1172c]` runs 0 to 0x1000 and the clamp is in the setter. */
export const ZOOM_CAP = 0x1000
/** `edi` at 0x495e5f: what one frame of holding adds. */
export const ZOOM_STEP = 0x20
/** 11 SNIPER RIFLE and 64 BINOCULARS — the whole list (0x495e64). */
export const ZOOMS = [11, 64]

/** Whether what is in hand magnifies. */
export const zoomsIn = (skill: number | null): boolean => skill !== null && ZOOMS.includes(skill)

export interface ZoomState {
  /** 0 to `ZOOM_CAP`, the exe's own field. */
  value: number
}

export const createZoom = (): ZoomState => ({ value: 0 })

/**
 * One frame. `holding` is whether the sights are up on something that
 * magnifies; letting go puts it straight back to zero, which is what
 * `0x44f7f0(0)` does on the frame the pad bit rises (0x492907).
 */
export function updateZoom(zoom: ZoomState, frames: number, holding: boolean): void {
  if (!holding) {
    zoom.value = 0
    return
  }
  zoom.value = Math.min(ZOOM_CAP, zoom.value + ZOOM_STEP * frames)
}

/**
 * What the zoom does to an aim step: `((0x1000 - zoom) * step) >> 12`, never
 * below `floor` (0x495e08, 0x495e1b).
 */
export const zoomedStep = (zoom: ZoomState, step: number, floor: number): number => {
  const scaled = (step * (ZOOM_CAP - zoom.value)) / ZOOM_CAP
  return Math.abs(scaled) < floor ? Math.sign(step) * floor : scaled
}

/** How far in it is, 0..1 — what a field of view is worked out from. */
export const zoomFraction = (zoom: ZoomState): number => zoom.value / ZOOM_CAP
