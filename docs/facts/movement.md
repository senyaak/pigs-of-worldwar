# The walk and the turn

- `[CHECK — remake]` **Contact softening is not modelled.** The original lets a
  body penetrate and pushes it out by a decaying bias (0.2 → 0.02); a landing
  here pins to the ground height, so there is nothing to decay. `BOUNCE_CUTOFF`
  stands in.
- `[gap]` **The turn ramp is not modelled.** The original accelerates a turn
  over eight frames to the 32/4096-of-a-circle cap that `TURN_SPEED` now is;
  here the cap applies from the first frame. A tenth of a second.
