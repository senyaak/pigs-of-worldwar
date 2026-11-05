# The walk and the turn

- `[CHECK — remake]` **Contact softening is not modelled.** The original lets a
  body penetrate and pushes it out by a decaying bias (0.2 → 0.02); a landing
  here pins to the ground height, so there is nothing to decay. `BOUNCE_CUTOFF`
  stands in.
- `[exe]` **A flying pig's contact with the ground climbs one ladder**, and
  every rung asks the full arrival speed, truncated to whole exe units a frame
  (`movement/landing.md`, `lib/game/landing.ts`). A plain jump or a short fall is
  another routine (0x470910) and climbs none of it:

  | arrival | what happens | where |
  | - | - | - |
  | under 50, on blocked ground | thrown out on the landing frame | 0x471045 |
  | over 75 | a ring of dust, effect 0x1E, row 5 | 0x471052 |
  | over 25 | I_PICKUP at a tenth of the speed up to 60, pitch 100 to 163, and the ground's scuff at 40 | 0x471158 |
  | 25 or more, or any on blocked ground | bounces; on free ground under 25 it stops dead, in silence | 0x4711d8, 0x471350 |
  | over 70 | 60 on the exertion counter | 0x471325 |

  The dust and the thud share a gate: at least three pig-update frames since the
  last thud (`[pig+0x1b2]`, read at 0x471061 and 0x47115e, zeroed at 0x4711cb,
  counted at 0x46cbd7).
- `[gap]` **The counter wraps in the original.** That byte wraps at 256, which
  shuts the gate for three frames in each lap. Not kept: a countdown stands in.
- `[gap]` **Nothing reads the exertion counter yet.** Only the landing charges it;
  the rest of it, and the winded stand at 250, are #43.
- `[gap]` **The turn ramp is not modelled.** The original accelerates a turn
  over eight frames to the 32/4096-of-a-circle cap that `TURN_SPEED` now is;
  here the cap applies from the first frame. A tenth of a second.
