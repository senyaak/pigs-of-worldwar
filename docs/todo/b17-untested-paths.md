# B17. WRITTEN AND NOT TESTED — three paths of this session's own work — 2026-09-01

Play asked the right question — "что не покрыто e2e то не важно так ведь? или ты
просто не написал?" — and the answer is the second one. These are gaps, not
judgements that the behaviour does not matter. Each is small; none was written
because the spec that would have caught it was not the spec being written at the
time.

- **A BULLET or a BLADE on the acting pig ends its turn, and only the BLAST is
  pinned.** The rule is one line in `battle.ts` keyed on the `damaged` event's
  `blow`, and three sources set it — `blast.ts:207`, `bullets.ts:259`,
  `strikes.ts:175`. `002/mines.spec.ts:507` asserts the handover through the
  blast alone. So two thirds of the rule is written and nothing checks it. The
  cheap version is a headless engine spec: shoot the acting pig, watch
  `game.turn`.
- **The barge from a JUMP.** Both specs in `002/tumble.spec.ts` drive
  `tumbles.fling` directly, which is the module's own path. A jump goes through
  the battle's DRIVING `updateLocomotion` and the `tumbles.barge(acting, …)`
  call beside it — a different call site, untouched by any test. It is also the
  one a player meets first, since jumping on a mate needs no weapon at all.
- **The acting pig as the VICTIM of a barge.** It routes through `battle.fling`
  onto `loco.airborne` rather than into `tumbles`, which is the seam that keeps
  one pig from having two flights. Nothing exercises it.

None of the three is hard. What they want is one headless battle each — the
shape `002/cluster.spec.ts` already uses.
