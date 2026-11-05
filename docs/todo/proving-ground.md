# THE PROVING GROUND — what is still open

`[play]`, 2026-11-02. Play wants to test every weapon and machine in one place
before going back through the campaign. This is the remake's own map; the
original has no such thing, so its LAYOUT is ours. Everything that HAPPENS on
it is the original's, and nothing on it may bypass a rule the campaign uses.

**The map itself is built**, and the PROVING GROUND bar on the ONE PLAYER screen
opens it, with everything placed on it: the strip, the player's pig, the dummies
as a second side of real pigs, 48 crates of one round each with a SIGN beside
every one, the four vehicles, the PILLBOX and the BIG_GUN, and the pond, hill
and wall. What it is and where every piece comes from:
[../facts/proving-ground.md](../facts/proving-ground.md).

Everything play asked of the map is on it. What is still open is the bench below,
issue #23.

## Why it matters beyond play

The same map is the bench for automated specs: an agent can fire each skill at
a dummy and compare damage, range and knock with the numbers read from the exe.
Then play only has to judge what a number cannot show. The guns, the blades and the
thrown skills are on it (`e2e/000/proving-bench-guns.spec.ts`,
`proving-bench-blades.spec.ts` and `proving-bench-lobs.spec.ts`, on the harness
`e2e/bench.ts`); the mines and charges are still to come.
