# docs/todo/ai-grenade-from-riverbank.md

**The AI's DISTANCE is walked, not flown — 2026-08-24, and the GRENADE half
of the same report is UNREPRODUCED.**

Play: "давай пофиксим считание по маршруту + щас, насколько я понял, нельзя
подойти к берегу реки и кинуть гранату — он это не принимает."

- **The route costing is BUILT.** The price list asked the crow line how far
  a walk was, so a foe across a river read two tiles off when the legs had
  fifteen tiles round the head of it. `Walked` (lib/game/evaluate.ts) is a
  port the brain fills from `world.route`, memoised per turn beside the
  reachability verdicts, and the walk is costed to the TARGET rather than to
  each weapon's own firing mark — one route a target however many weapons
  the kit holds, which keeps the pathfinder's bill where `playable` already
  had it. Reach still uses the crow line, because a bullet does not walk
  round the bay. Pinned in unit/grunt.spec.ts (the same foe, twice, with
  only the route between them).
- **The GRENADE half could not be reproduced and is still open.** Measured
  four ways with the price list alone — a river between, a wide river, a foe
  six thousand units off, no water at all — and the throw is priced at its
  full 30 every time, so nothing in the pricing refuses a lob over water.
  What DOES keep an AI pig off a bank is the water guard: a non-swimmer's
  route inflates water by `WATER_PROBE + GRID_STEP/2` ≈ 214 units (the fix
  for the DEN loop, 2026-08-24), so it stops a body's length short of the
  edge — which is "нельзя подойти к берегу" exactly, and is deliberate. If
  the report is about the pricing rather than the approach, the next session
  wants the MAP and the two positions: `[ai:kit]` prints every candidate's
  score, so one line of telemetry settles which it is.
