# Space and scale

- **Models are Y-DOWN; PMG heights are elevation, UP-positive.** The engine
  works in the game's Y-down space and converts once, at the top, with a 180°
  X-rotation on a wrapping group. `lib/game/terrain.ts`, `fromExeY`. `[exe]`
- **MCAP rotations are `local = Rx(−x) · Ry(−y) · Rz(−z)`**, parent-relative,
  XYZ order — not quaternions, whatever how-doc says. The negation is because
  the game's matrices are row-major, the transpose of three's. `anim/notes.md`
  carries three proof scripts. `[exe]`
- **A model is drawn at HALF size.** `MODEL_SCALE = 2048/4096` in
  `lib/game/scale.ts`: the body constructor (0x45de90) hands its scale to
  `afScaleObj` (0x45e443), whose unity is 4096, and the pig and POG paths pass
  0x800. The POG's collision box follows — its unit is 64 world units, and that
  unit lives in `formats/pog.ts` alone. `[exe]`
- **`HEIGHT_SCALE` is 1** in `lib/game/terrain.ts`, though the exe doubles the
  PMG heights in three places. Vertical constants lifted from the exe go through
  `fromExeY`, so they follow the knob. `[exe]` for the doubling, `[play]` for
  the 1.
- **The model faces +X**, so `PIG_HEADING_OFFSET = −π/2` (`lib/game/skeleton.ts`).
  A spawn marker's stored yaw does NOT mean what a prop's does: `spawns.ts`
  carries `yaw + π`. `[play]` for the offset, `[exe]` for the marker being a POG
  record turned by one yaw (0x4a5bd5).

- **Never `scale.y = -1`** to get from one space to the other: it mirrors
  handedness and breaks winding and animation. Rotate.

- `[play]` **`HEIGHT_SCALE` is 1** though the exe doubles. Answered in play
  twice; the doubling is above.

- **+y is UP in the engine's world.** The exe's physics settles it: the world's
  three force generators all point `(0,-1,0)` and one is gravity
  (`movement/notes.md`), so falling is y DECREASING. Four things in
  the effect table agree — a burst's vertical launch cannot be negative, row 15
  stacks rings at +100/+300/+600, a damage number trails at `y + 100`, and row 0's
  cloud fires about +y against a decelerating force. The remake stays Y-down and
  flips once, on the way in (`lib/game/cloud.ts`). **Any surviving note that
  `[+0x1d]` is "buoyancy, not gravity" is wrong.**
