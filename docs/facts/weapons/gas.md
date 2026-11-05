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
- `[exe]` **The touch is a weapon's hit.** Its fifteen pass cause 0 (0x477b54,
  `weapons/gas.md`), so on the pig being played they end its turn at any health
  (0x467c56, `turns/notes.md`); `lib/game/gas.ts`. The poison's own ten a turn
  are not a hit and leave the turn alone.
- `[exe]` **A poisoned pig sneezes at two moments.** The cloud's first touch of
  a throw plays clip 37 (0x477b6a..0x477b74, `lib/game/gas.ts`). And when the
  turn has played out, the pass over who was hurt (0x497760 -> 0x4976E0 ->
  0x467ec0) plays it on every living pig that took damage since the last pass
  with a status bit up (0x467f77 -> 0x4726dc): `movement/clips.md`,
  `lib/game/reaction.ts`. The poison's own ten counts as damage, so a poisoned
  pig sneezes at the end of each of its turns. The rest of that pass is not
  built: the brushoff of a pig hurt with no bit up (kinds 0..3, 0x4723BA), and
  the camera's visit to whoever it finds (modes 15..17).
