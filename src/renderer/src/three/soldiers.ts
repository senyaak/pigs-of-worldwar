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
//
// **And the variant is `_me`, not `_hi` — because the RIG says so.** Every family
// ships three models: `pcXXX_hi` (627..668 vertices), `pcXXX_me` (457..496) and
// the short `XX_hi` (168..201). Measured across all twenty-seven, the `pcXXX_hi`
// ones are the odd set out: they hang 30..35 vertices off bone 0, the ROOT, and
// bone 1 stops short of the hip — so the whole pelvis is welded to a bone the
// shipped clips barely move (4.9° of pitch, no yaw at all: `animations/notes.md`).
// The `_me` and the short models put 6..8 vertices on the root — the tail — and
// carry the hip band on bone 1, the torso, which is where the run cycle's ±19.6°
// of swing lives.
//
// Play reported the consequence three times, and the third time exactly: "жёпа не
// шевелится… должно двигаться вместе с туловищем, а не стоять колом." It was the
// MODEL, not the pose: with `pcgru_hi` the behind cannot follow the body, because
// it is not attached to it. Two things point the same way — a rig that agrees with
// the animation, and `_ME` being the suffix the map's own spawn markers wear for a
// battle pig (`GR_ME`, `HV_ME`) — so the battle wears `_me` and `pcXXX_hi` is left
// for whatever wants a close-up standing still.

/** The default dress — and the fallback for a class no marker names. */
export const GRUNT_ART = 'pcgru_me'

const BY_CLASS: Record<number, string> = {
  0: GRUNT_ART, // GR_ME
  1: 'pchvy_me', // HV_ME
  2: 'pchvy_me',
  3: 'pchvy_me',
  5: 'pcsap_me', // SA_ME
  8: 'pcsni_me', // SN_ME
  9: 'pcspy_me', // SP_ME
  10: 'pcsab_me', // SB_ME
  11: 'pcmed_me', // ME_ME
  12: 'pcmed_me',
  13: 'pcmed_me',
  14: 'pcleg_me', // LE_ME
  16: 'pcace_me' // AC_ME
}

/** The archive base name that dresses `pigClass`. */
export const classArt = (pigClass: number): string => BY_CLASS[pigClass] ?? GRUNT_ART

/** Every base name a set of classes needs, each once. */
export const artFor = (classes: number[]): string[] => [...new Set(classes.map(classArt))]
