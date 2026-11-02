# HIDE and PICK POCKET

- `[exe]` **HIDE (55) turns the pig into a BUSH, and PICK POCKET (54) takes
  the WHOLE slot.** The disguise is a real decoy prop — nearest disguisable
  model within 8192, CRATE4 fallback — the hidden pig is untargetable, off
  the plate, the blip and the picture, a blade on it KNOCKS ON WOOD for
  nothing, the cover drops at the pig's own next turn, and the enemy's spies
  start every battle hidden. The theft is the heal's cone with a looser
  filter (allies and corpses qualify), a random whole slot, a laugh, and a
  14-slot append cap under which loot silently vanishes — the exe's own
  off-by-one, kept. `lib/game/hide.ts`, `pickpocket.ts`;
  `weapons/espionage.md` in the disasm repo. The decoy is REAL COVER: it
  soaks a BULLET first — its hit points are the model's own (crate 40, bush
  50, tree/cactus 80, the object-health table at 0x4D6D18) — and hands the
  pig only the remainder of the hit that breaks it, a BLAST included (the
  decoy's own effect arm runs the same falloff onto itself, 0x48EB26). The
  GAS touches NOBODY: the hidden pig's body is out of the physics
  (`[body+0x44] & 1`, the sweep's own first test at 0x406AEA) and the
  decoy's effect arm excludes the status-gas ids 0x5C..0x61 — a bush does
  not breathe, so do not "fix" gas to poison a hidden pig. The disguise
  lands at the END of the gesture clip (81), the exe's own shape — it hid
  at the press for a while (`[deliberate]`) and play revoked that. The
  clip's sound is DECODED (anim/audio-events.md): a fatigue-gated breath at
  phase 1078 (silent here — fatigue is not modelled, and a fresh pig's is
  silent in the exe too) and a COIN-FLIP FART at phase 2310 (P_FART1-3,
  half the plays silent). `[exe]`.
