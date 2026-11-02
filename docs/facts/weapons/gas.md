# The poison gas

- `[exe]` **The POISON GAS (26) STREAMS, and its pop is not a blast.** The
  canister lets a green cloud go every 5th frame from frame 15 of its flight
  (a rolling one draws a line of them), each cloud touches once — fifteen
  flat per throw, no push, no line of sight — and leaves a POISON bit with
  NO timer: ten points at every one of the pig's own turns, for ever, taken
  off by ANY heal. Its detonation is one last cloud and a half-volume pop —
  no 0x54, so do not "fix" the gas grenade to explode. `lib/game/gas.ts`,
  `poison.ts`; the read is `weapons/gas.md` in the disasm repo. Three edges
  are not the exe's: the cloud stage's gentle rise and sprite size are
  `[CHECK — remake]` (the exe's type-0x20 particle is not this effect
  system's shape), the brain's two-turn poison horizon (`POISON_WORTH`,
  evaluate.ts) is `[deliberate]`, and 23 CONFUSION — in the PC exe LITERALLY
  the same projectile, id 416 — is deliberately left a plain burst until
  play rules whether that identity is the game or a port accident.
