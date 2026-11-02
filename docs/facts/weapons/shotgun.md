# The shotgun

- `[exe]` **The SHOTGUN looses TEN pellets a press, and its hit is capped and
  multiplied.** Skills 12/13 (gtext 108/109 — not "rifle bell") share ONE arm
  of the fire routine's jump table, 0x47a776, and that arm is a LOOP: ten
  projectiles, each with a fresh `(rand & 0x1F) − 0x10` jitter on BOTH angles,
  the last one the camera's. In `Pig::HitByProjectile` the first pellet a
  body takes deals ×5 and PREPAYS pellets 2..5 (absorbed — `cmp eax,edi; jl`
  at 0x478891 skips the damage while the counter is under five); the sixth
  on each pays its own 3, uncapped — per target `3 × max(5, hits)`: one
  stray pellet 15, a full volley 30 (`weapons/fire.md`, read 2026-08-26).
  Built as read: `Projectile.pellets/spread/burst`, the jitter off the
  battle's seeded stream (`BulletWorld.random`), the prepay in
  `bullets.land`, and the AI prices the volley (`volleyDamageOf`). TWO traps
  hid it, both caught by play: fire.md's "every arm has the same shape" hid
  the loop, and its backwards reading of the 0x478891 branch ("capped at
  five") hid the prepay — an arm is not read until ITS OWN last instruction,
  and a branch is not read until its TARGET is. Do not "fix" the shotgun
  back to one round.
