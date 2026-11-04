# Doors

Getting into and out of a building or a vehicle. The arms are in
`objects/getting-inside.md`: vehicle OUT 0x469BF6, vehicle IN 0x469F21, building
OUT 0x46A0F6, building IN 0x46A228. `lib/game/doorway.ts`,
`lib/game/battle/doors.ts`, `unit/doorway.spec.ts`.

- `[exe]` **The glide runs between clip 7's events 68 and 69**, phases 1950 and
  3300 (0x4734B0; the test at 0x46E148). The same for all four arms.
- `[exe]` **Each step is a seventeenth of the way, and eighteen of them land.** The
  cursor moves 76 a frame (the library's 75 for clip 7, plus one at 0x440E6D), the
  divisor is 1350 over 76 truncated (0x46A2DA), and the window includes both ends
  (0x46E157, 0x46E166). So a pig finishes a seventeenth past what the arm aimed it
  at.
- `[exe]` **IN is one behaviour for both classes**: all three axes to the object's
  own transform (building 0x46A338, 0x46A392, 0x46A3EA; vehicle 0x46A031, 0x46A08B,
  0x46A0E3), after the crouch. A pig falling or flying skips the crouch (0x46A24A,
  0x469F43).
- `[exe]` **OUT has no crouch at all**: both arms put the clip's cursor on event 68
  (0x46A200, 0x469EFF), so the pig moves on the first frame and the clip plays only
  from there.
- `[exe]` **OUT of a building is straight up**: the horizontal steps are written as
  zero (0x46A150, 0x46A15E). `[play]` "должен прыгать в центр строения и выпрыгивать
  из центра строения наверх."
- `[exe]` **OUT of a vehicle is 1024 units off its side** (0x469C9B, 0x469C8C through
  0x44E620), held inside ±0x2FF6 when it would pass ±0x3000 (0x469CF9..0x469E31). At a
  stored yaw of zero, which is every vehicle on every shipped map (`[measured]`,
  `objects/vehicle-yaws.py`), that is along +x. At the clip's end a pig within 0x20 of
  the ground, or under it, is stood on it (0x47C94D..0x47C9C1).
- `[exe]` **How high is the same question for both**: `0x479690` at the spot being
  gone to (0x46A1CF, 0x469EC3), the ground there raised 128 at a time (64 here, the
  exe's heights being doubled) until the pig's body is clear of every object.
- `[exe]` **The pig comes out facing off the mount's own angle**, a quarter on from it
  (0x46A123, 0x469C23): the record's yaw as the pig's own angle for a building
  (0x43F3A3), and +x for a vehicle at yaw zero (0x499C76).
- `[exe]` **Going in or out is settled when the clip ends**: 60 and 61 go from the
  end of the sequence (0x46E3E9, 0x473600) to the toggles in the fire table (0x47C8A6,
  0x47CB13). That is where a pig going in stops being drawn (0x47CAB0, 0x47CB64).
- `[gap]` Not built: the angle a pig sits at inside (0x47CB98, 0x47CAE4), and what a
  vehicle's toggle does to a pig that comes out on a wall tile (0x47CA0E). A vehicle
  stored at any other yaw is turned by the yaw negated (0x499C76), where `boxOf` turns
  every record by the yaw itself; no shipped map has one.
- `[exe]` Three simplifications of what is known: the steps are not truncated to whole
  units, a pig coming out starts from the mount's exact middle rather than the
  seventeenth past it the glide in left it at, and the glide moves the pig's soles
  where the exe moves its body's origin.
