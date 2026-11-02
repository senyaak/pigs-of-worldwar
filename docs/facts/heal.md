# Healing

- `[deliberate]` **A REFUSED HEAL says so — sound and words — and the
  original says nothing.** The skill-52 arm's failure exits are blank: no
  string, and its one `Sound::Play` is P_HEAL on the success path. The game
  DOES have the machinery — the briefing bar — and its neighbour PICK POCKET
  prints both of its refusals on it with a P_OWW, so the remake follows that
  idiom rather than the heal arm's silence: P_OWW, and one of two lines of
  the remake's own writing (`HEAL_NOBODY` / `HEAL_ALREADY_WELL` in
  `ui/battle.ts`). Play asked for it. The 0x47c6f0 an earlier pass cited as
  "the heal arm's failure exit" is pick pocket's; corrected in place.

- `[play]` **The MEDICINE BALL bursts as a CLOUD, not row 4's ring.** The row
  is read and validated (`effects/notes.md`), and its ring — the only one with
  age step 1 — runs a hundred frames to 7520 units, three times past the heal
  field. Play remembers a gas-like cloud and threw the ring out; the cloud's
  own numbers are `[CHECK — remake]`. `lib/game/effects.ts`, `HEAL_EFFECT`.
