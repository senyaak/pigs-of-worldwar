# The battle camera

- `[play]` **A FLIGHT is kept inside the middle 60% of the frame.** Mode
  0x0D's aim point is the exe's (a sixth a frame toward a third of the
  flight's height) and has no vertical bound of its own, so a rocket or a
  steep lob climbs out of the top of the frame. Play ruled a fifth of the
  screen from either edge; `FRAME_KEEP` in `three/chase.ts` lifts the aim
  point that far and no further, and the ordinary grenade's 9° never
  touches it. `e2e/002/bazooka-aim.spec.ts`.
