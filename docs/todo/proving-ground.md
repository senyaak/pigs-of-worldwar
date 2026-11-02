# THE PROVING GROUND — what is still open

`[play]`, 2026-11-02. Play wants to test every weapon and machine in one place
before going back through the campaign. This is the remake's own map; the
original has no such thing, so its LAYOUT is ours. Everything that HAPPENS on
it is the original's, and nothing on it may bypass a rule the campaign uses.

**The map itself is built** — `pow.swapMap('PROVING')`, with everything placed
on it: the strip, the player's pig, the dummies as a second side of real pigs,
48 crates of one round each with a SIGN beside every one, the four vehicles,
the PILLBOX and the BIG_GUN, and the pond, hill and wall. What it is and where
every piece comes from: [../facts/proving-ground.md](../facts/proving-ground.md).

What play asked for that it does not do yet:

- **Training dummies that come back.** The dummies should be real enemy pigs
  that skip their turns and stand up at full health at the start of a turn.
  Then reactions, deaths, damage numbers and dropped crates get tested too.
  Until then the dummy side is an ordinary side: the computer plays it, and
  bringing every dummy down ends the battle as a win.
- **A crate that was taken is back at the start of the next turn** — one round
  per crate per turn.
- **A signpost by each crate showing the skill's icon.** The signposts stand
  and are the plain SIGN model; the icons are the original's —
  `Language/Tims/MENUTIMS.MAD` holds one 56×34 icon per skill, in skill order
  (`skills/notes.md`, `SKILL_ICON` in `lib/game/skills.ts`).
- **No rank gate.** Play's word: in the original a pig may use any skill it
  holds, whatever its rank, so any pig can test anything here.

## Why it matters beyond play

The same map is the bench for automated specs: an agent can fire each skill at
a dummy and compare damage, range and knock with the numbers read from the exe.
Then play only has to judge what a number cannot show.
