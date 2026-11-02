# The OBJECTIVES machine — read 2026-08-21, and it is what the sergeant's six crate lines belong to

**This corrects the P1 entry above.** The six categories were written up as
"a crate collected, by pickup type". They are not: the ordinary weapon crate
never reaches that code at all.

- **A record's ACTION is a 20-byte thing built at LOAD** (0x4A7130, from
  0x4a6287) out of POG fields **14** (the kind), **15**'s low byte (a LINK id,
  which is the byte `formats/pog.ts` calls "not decoded"), 15's high byte (a
  VALUE), **16** (an amount) and **25/27** (where a reward drops, quantised to
  the 512 tile).
- **An ordinary crate gets none.** For field 14 = 19 the loader takes an arm of
  its own (0x4a62b2) that builds an action only when a global is 1 AND field
  15's low byte is non-zero — and **552 of the 561** field-14-19 records carry
  0 there. So a crate's weapon and count are read somewhere else entirely,
  which is why the remake's crates work without any of this.
- **The collect dispatch is 0x4AA170**, on the action's own type through a
  23-entry byte table at 0x4AA814 into seven arms:
  - types **4 and 16** → `[pig+0x1DE] -= value`, then file **08**. That
    instruction is the whole medal economy in one place, and it is the reason
    the disassembly's flat "takes something off the pig" and play's "попрощайся
    с медалью" are the same sentence.
  - types **2 and 14** → spawn model 0x17 at the record's own spot, call
    0x495420, file **07** — a medal dropped for you.
  - type **13** → spawn model 0x15 with the amount when the value byte is 0xFF,
    else model 0x14: files **06** (medical) and **05** (equipment).
  - type **1** → spawn model 0x15. Types **20, 21** find the pickup whose link
    matches and finish it; **22, 23** their own pair; everything else nothing.
- **What carries these is not crates.** Over the 61 maps: 31 records of kind 1,
  13 of kind 2, 25 of kind 7, 14 of kind 13, 9 of kind 14, 14 of kind 20 — on
  PILLBOX, BIG_GUN, TANK, M_TENT1, BRIDGE_C, TENT_S, DUMMY and the spawn
  markers. **This is the mission-objective machine**: blow up the gun, take the
  pillbox, and the sergeant remarks on it. Files 09 and 10 hang off 0x4A7600,
  the arm that runs when an object is finished off and a partner record is
  found by its link byte.

**Not built, and this is now the shape of the work**: an object's action, the
link between two records, `[pig+0x1DE]` as a per-pig tally, and the four
spawned models. It is a bigger piece than the tokens and it is what the rest
of the sergeant is waiting on.
