# B12. Two specs are FLAKY, and they were flaky before the step jump

Found 2026-08-12 while running phase 002 over the training-step work, and both
were checked against the tree WITHOUT it — `git stash`, rebuild, same two fail.
So neither is a regression, and neither is written down anywhere else.

- **`002/grenade.spec.ts:89`**, "the gauge fills while F is held": the thrown
  grenade's fuse read **4.25** against a floor of 4.5 (the window is 4.5..5.5
  for a fuse of 150 exe frames plus `rand() & 7`). It is measured after the
  throw over a round trip, so what the spec is really asserting is "the fuse has
  not burned much yet" — the read is late on a busy machine. Either measure the
  fuse against the moment the lob appeared, or widen the floor and say why.
- **`002/mines.spec.ts:494`**, "TNT goes down IN FRONT of the pig": it polls for
  the lay clip and then asserts nothing is planted yet, but the charge goes down
  on the clip's own event at phase 1314 of 4096 — about a third of the way in —
  so a poll that lands late finds one already down. It wants the assertion taken
  at a phase rather than at "the clip is up".

Neither has been touched: they are timing in the SPECS, not behaviour, and the
fix is a measurement each rather than a tuned number.
