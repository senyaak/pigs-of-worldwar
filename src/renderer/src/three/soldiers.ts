// Which model in `Chars/british.mad` dresses which pig class.
//
// The archive holds nine families — ace, gru, hvy, leg, med, sap, sab, sni,
// spy — and the map's spawn markers say which class each one is for, since
// a marker carries BOTH its family (its name) and its class (its type):
// GR_ME is class 0, HV_ME 1/2/3, CO_ME 4, SA_ME 5, SN_ME 8, SP_ME 9,
// SB_ME 10, ME_ME 11/12/13, LE_ME 14, AC_ME 16.
//
// Read that table and the family names do NOT line up with the class names
// at those indices — `sni` art dresses class 8, which `gtext` calls Scout,
// and `spy` art dresses Sniper. The families are named for the promotion
// TIER, not for one rank in it. The markers are the evidence, so the
// markers win; nothing here is inferred from a name.
//
// Two gaps, both honest: CO_ME's class 4 has no family of its own in the
// archive, and six classes never appear on any shipped marker. Both fall
// back to the grunt.

/** The default dress — and the fallback for a class no marker names. */
export const GRUNT_ART = 'pcgru_hi'

const BY_CLASS: Record<number, string> = {
  0: GRUNT_ART, // GR_ME
  1: 'pchvy_hi', // HV_ME
  2: 'pchvy_hi',
  3: 'pchvy_hi',
  5: 'pcsap_hi', // SA_ME
  8: 'pcsni_hi', // SN_ME
  9: 'pcspy_hi', // SP_ME
  10: 'pcsab_hi', // SB_ME
  11: 'pcmed_hi', // ME_ME
  12: 'pcmed_hi',
  13: 'pcmed_hi',
  14: 'pcleg_hi', // LE_ME
  16: 'pcace_hi' // AC_ME
}

/** The archive base name that dresses `pigClass`. */
export const classArt = (pigClass: number): string => BY_CLASS[pigClass] ?? GRUNT_ART

/** Every base name a set of classes needs, each once. */
export const artFor = (classes: number[]): string[] => [...new Set(classes.map(classArt))]
