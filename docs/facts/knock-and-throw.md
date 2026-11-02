# Knocks, throws and pig-to-pig contact

- `[exe]` **A PIG IS NOT A WALL IN THE AIR — a body in flight BOWLS IT OVER.**
  Two pigs briefly inside one another during a flight is not a collision bug.
  `withPigs` is the WALKING test; the exe has no wall for a flight at all — a
  pig in the air is a rigid body in the physics world, and its contact with
  another pig throws THAT one: `0x4A9100(0x40, 0x200, own heading + (rand &
  0xFF), 0)` at 0x477842, reached from either airborne regime (the plain fall
  `[pig+0x1FD]` and the FLYING `[pig+0x21C]`), gated on the other body being
  type 0x1357. `BARGE_SPEED` in `lib/game/tumble.ts`, 960 a second against the
  2700 a core hit throws; the map's objects keep their boxes. **The two cannot
  both be there** — a flight held off at 2·PIG_RADIUS can never reach a
  contact tested at the same distance, which is what the first build measured.
  It covers the pig's own JUMP as much as a knock: same call, same contact.
  **Two things about it are `[CHECK — remake]`, and both are the same trap.**
  The whole prologue arm at 0x477390 is untranscribed, so neither is a
  reading — and each is the half that keeps a blast's knock rather than eating
  it. (1) The contact fires ONCE as the bodies meet, keyed by the PAIR and not
  by direction: keyed by direction, a body flung at 2700 is shoved back at 960
  the next frame. (2) **Only a body ON THE GROUND is bowled over.** One blast
  throws everything in reach the same way at the same instant, so the bodies
  leave together and overlap on the way out; with airborne victims in, whichever
  was stepped first cut the other down to 960 — measured, on
  `002/knockback.spec.ts`, 420 units of travel where the arithmetic wanted 486.
  Both are pinned in `e2e/002/tumble.spec.ts`.
- `[play]` **A bullet's knock is the engine's own 45° throw, at the exe's
  own speeds — and pellets STACK.** `Pig::HitByProjectile` ADDS (0x4A9260
  fadds, never sets) 48 along the projectile's own pitch — kind 0x12 adds 6
  a pellet (`Projectile.shove`), so a full shotgun volley accumulates to 60.
  Built literally the along-the-aim push dies on the first substep and the
  body only twitches ("отброс сразу же гасится … тупо дёргается на месте"),
  so the SHAPE is play's: 45° up along the bullet's bearing
  (`flingVelocity`), each hit flinging the volley's running total
  (`bullets.land`). The exe's knock ladder is real and holds here: melee
  per-weapon 75..200 (knife 125, `melee.ts`), shotgun volley up to 60,
  single bullet 48 — "нож сильнее дробовика" is the original's own
  arithmetic, not a bug. Do not resurrect the level shove, and do not make
  a pellet's fling replace the total.

- **DAMAGE THROWS — in the EXE, from ANY damage — and the blast throw is
  READ: `weapons/fire.md` §"phantom sweep". GREP THE DISASM REPO BEFORE
  CONCLUDING.** The mechanism is the effect's own one-shot world sweep
  (0x409EF0), writing body velocity directly and bypassing both impulse
  primitives: sphere of the whole RANGE centred 128 above the blast,
  impulse `strength · (1 − 3d/4R)` along centre→body (25% at the rim),
  VERTICAL DOUBLED, **divided by the body's mass (a pig's is 30)**, plus a
  coin-flip spin; `strength` is the effect's own field (weapon-row FORCE:
  grenade 2600, TNT 6500; the land death 3250) and does NOT scale with
  damage. Gas/fire/heal are built with the impulse flag off — damage, no
  throw. That section already existed when a later session read the OnHit
  arm alone, concluded "the death blast throws nobody", reported it to
  play — who had to correct it, "есть в екзе отброс!" — and a fresh pass
  re-derived the whole chain before the duplicate was caught. TWO lessons,
  both permanent: an arm without the impulse call only means the throw
  lives elsewhere; and the notes repo is searched FIRST — the answer was
  already written down. **The remake now uses those numbers**: play measured
  the old damage-scaled model in the one unit that shows — "граната
  откидывает через чур далеко, раза в 3-4 дальше чем надо" — and a throw is
  ballistic, so 180 a frame against the exe's 86.7 is 4.3 times the ground.
  `flingSpeed(force, share)` in `lib/game/blast.ts` is `force × share / 30`;
  `Lob.force` is row +0x08 and the DIRECTION is still `hurlVelocity`'s, which
  is what play tuned over four passes and is not about how hard.
  **A force of 0 throws nobody**, which is how the gases and the medicine ball
  are built — the shove no longer rides the damage, so a weapon that heals
  cannot shove.
