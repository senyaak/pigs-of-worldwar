# The mortar, and every lob with no gauge

- `[play]` **A LOB WITH NO GAUGE FIRES AT FULL CHARGE — unless it is
  PLANTED.** The MORTAR (28) is the one: record +0x14 is 0 and skill 28 is
  absent from the gauge list at 0x493796, so the press fires it at once and
  the COME-UP is the whole aim (it cannot be pointed under 45°). But the
  exe's no-gauge branch writes a charge of ONE, and `speed * 1 >> 12` of 500
  is nothing — by the arithmetic the shell lands on the pig's own trotters.
  It is the identical hole `weapons/fire.md` records for every no-gauge GUN
  and takes the same answer. `attack.ts`; where the 1 becomes 0xFFF is
  unfound. **The AI follows it**: `evaluate.ts` bisects the PITCH rather than
  the gauge for such a weapon — not gated on wits, because with no gauge there
  is nothing else to aim with — and `grunt.ts` moves the hands' shake onto the
  pitch with it, or an AI mortar never misses.
