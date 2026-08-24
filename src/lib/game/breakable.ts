// WHAT CAN BE BROKEN, and how much it takes — the exe's own table.
//
// Play: "тнт не дамажит дом." It does not, and the reason was that a HOUSE was
// never anything in this engine: only the training ground's dummies could be
// knocked down (lib/game/targets.ts), because those are the only things the
// remake had ever seen break. The original has no special case for a dummy at
// all — it is the same class as a tree and a wall, with a different number out of
// one table.
//
// The loader is legible end to end (0x4a58bb):
//
// ```
// 4a58c4  kind = 0x4a6d20(record.name)      ; the name TABLE at 0x4d9680, 466 of them
// 4a5964  if (kind <= 0x1b)     -> elsewhere ; 0..27: buildings, bunkers, barrels, pickups
// 4a596d  if (kind >= 0x17c)    -> elsewhere ; 380..: animals, ammo, vehicles, pig markers
// 4a5979  if (kind in 0x4b..0x4c) -> nothing  ; 75, 76 -- the two birds
// 4a598b  0x48d000(model, x, y, z, ...)      ; ...and EVERYTHING ELSE is breakable
// ```
//
// `0x4a6d20` walks the name table and returns the FIRST index whose string
// matches, which is why CRATE4 is not in here: it appears twice, at 22 among the
// PICKUPS and again at 42, and the pickup wins. The table itself is grouped by
// `START_OF_`/`END_OF_` markers — BUILDINGS, BUNKERS, GUN_BARRELS, PICKUPS,
// SCENERY, ANIMALS, AMMO, VEHICLES, PIGS — and SCENERY is the range above.
//
// The health is `[0x4d6d18 + (kind - 0x1c) * 4]`, in the engine's 128ths of a
// point like everything else (`objects/notes.md`), and it is what the constructor
// puts in both `[+0x4c]` and `[+0xa8]` — the current and the maximum. Nine
// distinct values over 349 names; they are written out below by value, since the
// grouping is the only structure the table has.
//
// **BUILDINGS are a different class and are not here.** Indices 1..6 — BIG_GUN,
// M_TENT1, M_TENT2, PILLBOX, SHELTER, TENT_S — go to the class at 0x4bc5d0 (body
// type 0x1359), which has its own OnHit (0x4406b0) and, when it goes, sweeps up
// every pig around it and throws each one (0x4402b0). CAMP carries one SHELTER,
// and it is still not breakable in the remake.
//
// Pure data. No formats, no state.

/** 1 point — DUMMIES: one point, so the weakest thing that swings flattens one */
const HEALTH_1: string[] = [
  'TARGET', 'TARGET2', 'TARGET3', 'TARGET4', 'TARGET5', 'T_SUP', 'T_SUP2', 'T_SUP3', 'DUMMY',
]

/** 10 points — the flimsy: a dugout, a prop, a spent canopy */
const HEALTH_10: string[] = [
  'DUGOUT', 'DUGOUT_S', 'PROP', 'WE_CHUT2',
]

/** 20 points. */
const HEALTH_20: string[] = [
  'BIGLOONY',
]

/** 40 points. */
const HEALTH_40: string[] = [
  'CHECKB',
]

/** 50 points — bridges and steps, the low greenery, and every HEDGE-height tree */
const HEALTH_50: string[] = [
  'BRIDG_C2', 'BRIDGE_C', 'BRIDGE_S', 'BRID2_C', 'BRID2_C1', 'BRID2_C2', 'BRID2C3', 'BRID2_S',
  'BRID2_S2', 'D_BRID', 'TBLOK', 'TBLOK2', 'TBLOK3', 'BUSH1', 'BUSH2', 'BUSH3', 'STUMP1',
  'STUMP2', 'BUSH1H', 'BUSH2H', 'BUSH3H', 'TREEBH', 'TREEBH1', 'TREEGH', 'TREEGH1', 'TREEGH2',
  'TREEPH', 'TREEPH1', 'TREEPH2', 'TREEPAH', 'TREEPAH1', 'TREEPAH2', 'TREEWH', 'TREEWH1',
  'FLOWERS', 'FLOWERS2', 'FLOWERS3', 'GRASS', 'GRASS1', 'GRASS2',
]

/** 60 points — the seven BUILDING SETS — floors, roofs, walls, stairs — and the graves */
const HEALTH_60: string[] = [
  'CHECKP', 'GRAV2', 'GRAVE', 'LU_B_SU', 'MAST', 'S1F01PPP', 'S1F02PPP', 'S1F03PPP', 'S1F04PPP',
  'S1F05PPP', 'S1F06PPP', 'S1R01PP2', 'S1R01PPP', 'S1R02PPP', 'S1R03PPP', 'S1R04PPP',
  'S1R05PPP', 'S1R06PPP', 'S1S_ST01', 'S1S_SU02', 'S1S_SU03', 'S1S_SU04', 'S1W01PPP',
  'S1W02PPP', 'S1W03PPP', 'S1W03_D_', 'S1W03_W_', 'S1W04PP2', 'S1W04PPP', 'S1W04_D2',
  'S1W04_D_', 'S1W04_W2', 'S1W04_W_', 'S1W05PPP', 'S1W05_W_', 'S1W06DW_', 'S1W06PPP',
  'S1W06_W_', 'S1W07PPP', 'S1W07PWW', 'STF01PPP', 'STF02PPP', 'STF03PPP', 'STF04PPP',
  'STF05PPP', 'STF06PPP', 'STR01PP2', 'STR01PPP', 'STR02PPP', 'STR03PPP', 'STR04PPP',
  'STR05PPP', 'STR06PPP', 'STS_ST01', 'STS_SU02', 'STS_SU03', 'STW01PPP', 'STW02PPP',
  'STW03PPP', 'STW03_D_', 'STW03_W_', 'STW04PP2', 'STW04PPP', 'STW04_D2', 'STW04_D_',
  'STW04_W2', 'STW04_W_', 'STW05PPP', 'STW05_W_', 'STW06DW_', 'STW06PPP', 'STW06_W_',
  'STW07PPP', 'STW07PWW', 'BRF01PPP', 'BRF02PPP', 'BRF03PPP', 'BRF04PPP', 'BRF05PPP',
  'BRF06PPP', 'BRR01PP2', 'BRR01PPP', 'BRR02PPP', 'BRR03PPP', 'BRR04PPP', 'BRR05PPP',
  'BRR06PPP', 'BRS_ST01', 'BRS_SU02', 'BRS_SU03', 'BRW01PPP', 'BRW02PPP', 'BRW03PPP',
  'BRW03_D_', 'BRW03_W_', 'BRW04PP2', 'BRW04PPP', 'BRW04_D2', 'BRW04_D_', 'BRW04_W2',
  'BRW04_W_', 'BRW05PPP', 'BRW05_W_', 'BRW06DW_', 'BRW06PPP', 'BRW06_W_', 'BRW07PPP',
  'BRW07PWW', 'M1F01PPP', 'M1F02PPP', 'M1F03PPP', 'M1F04PPP', 'M1F05PPP', 'M1F06PPP',
  'M1R01PP2', 'M1R01PPP', 'M1R02PPP', 'M1R03PPP', 'M1R04PPP', 'M1R05PPP', 'M1R06PPP',
  'M1S_ST01', 'M1S_SU02', 'M1S_SU03', 'M1S_WD01', 'M1S_WPP', 'M1W01PPP', 'M1W02PPP', 'M1W03PPP',
  'M1W03_D_', 'M1W03_W_', 'M1W04PP2', 'M1W04PPP', 'M1W04_D2', 'M1W04_D_', 'M1W04_W2',
  'M1W04_W_', 'M1W05PPP', 'M1W05_W_', 'M1W06DW_', 'M1W06PPP', 'M1W06_W_', 'M1W07PPP',
  'M1W07PWW', 'SNF01PPP', 'SNF02PPP', 'SNF03PPP', 'SNF04PPP', 'SNF05PPP', 'SNF06PPP',
  'SNR01PP2', 'SNR01PPP', 'SNR02PPP', 'SNR03PPP', 'SNR04PPP', 'SNR05PPP', 'SNR06PPP',
  'SNS_ST01', 'SNS_SU02', 'SNS_SU03', 'SNW01PPP', 'SNW02PPP', 'SNW03PPP', 'SNW03_D_',
  'SNW03_W_', 'SNW04PP2', 'SNW04PPP', 'SNW04_D2', 'SNW04_D_', 'SNW04_W2', 'SNW04_W_',
  'SNW05PPP', 'SNW05_W_', 'SNW06DW_', 'SNW06PPP', 'SNW06_W_', 'SNW07PPP', 'SNW07PWW',
  'CAF01PPP', 'CAF02PPP', 'CAF03PPP', 'CAF04PPP', 'CAF05PPP', 'CAF06PPP', 'CAR01PP2',
  'CAR01PPP', 'CAR02PPP', 'CAR03PPP', 'CAR04PPP', 'CAR05PPP', 'CAR06PPP', 'CAS_ST01',
  'CAS_SU02', 'CAS_SU03', 'CAS_WD', 'CAW01PPP', 'CAW02PPP', 'CAW03PPP', 'CAW03_D_', 'CAW03_W_',
  'CAW04PP2', 'CAW04PPP', 'CAW04_D2', 'CAW04_D_', 'CAW04_W2', 'CAW04_W_', 'CAW05PPP',
  'CAW05_W_', 'CAW06DW_', 'CAW06PPP', 'CAW06_W_', 'CAW07PPP', 'CAW07PWW', 'W1F01PPP',
  'W1F02PPP', 'W1F03PPP', 'W1F04PPP', 'W1F05PPP', 'W1F06PPP', 'W1R01PP2', 'W1R01PPP',
  'W1R02PPP', 'W1R03PPP', 'W1R04PPP', 'W1R05PPP', 'W1R06PPP', 'W1S_ST01', 'W1S_SU02',
  'W1S_SU03', 'W1W01PPP', 'W1W02PPP', 'W1W03PPP', 'W1W03_D_', 'W1W03_W_', 'W1W04PP2',
  'W1W04PPP', 'W1W04_D2', 'W1W04_D_', 'W1W04_W2', 'W1W04_W_', 'W1W05PPP', 'W1W05_W_',
  'W1W06DW_', 'W1W06PPP', 'W1W06_W_', 'W1W07PPP', 'W1W07PWW',
]

/** 80 points — full-grown trees */
const HEALTH_80: string[] = [
  'TREEB', 'TREEG', 'TREEP', 'TREEPA', 'TREEW', 'CACTUS', 'CACT2',
]

/** 100 points — the built world: walls, gates, fences, chimneys, machinery */
const HEALTH_100: string[] = [
  'MONO', 'SIGN', 'WALL', 'IRONGATE', 'BOG', 'FENCE', 'GATE', 'GATES', 'LAMP', 'MACHI', 'MOONS',
  'RELAX', 'RELAX1', 'SNOWB', 'SNOWH', 'TV', 'BARREL', 'PILLER', 'BARBWIRE', 'BARBWIR2',
  'BUTTFLY1', 'WINDM', 'WIN_SH', 'WIN_SV', 'CHIM', 'WIND2', 'WIND2H', 'WIND2V', 'SWILL1',
  'SWILLARM', 'SWILL2', 'SW2ARM', 'PIST', 'WATSTA', 'WATWHE', 'CHIM2', 'RADAR', 'RADAR1',
]

/** 150 points. */
const HEALTH_150: string[] = [
  'TUN',
]

/** 200 points. */
const HEALTH_200: string[] = [
  'BOOTS',
]
/** Name → health in points, built once. */
const HEALTH = new Map<string, number>()
for (const [points, names] of [
  [1, HEALTH_1],
  [10, HEALTH_10],
  [20, HEALTH_20],
  [40, HEALTH_40],
  [50, HEALTH_50],
  [60, HEALTH_60],
  [80, HEALTH_80],
  [100, HEALTH_100],
  [150, HEALTH_150],
  [200, HEALTH_200],
] as const) {
  for (const name of names) HEALTH.set(name, points)
}

/**
 * How much this model takes to break, in points — or null for something the
 * loader does not make breakable at all.
 *
 * By MODEL NAME, which is how a record is paired with its geometry anyway, and
 * upper-cased because a map's records are not consistent about it.
 */
export const breakableHealth = (name: string): number | null =>
  HEALTH.get(name.toUpperCase()) ?? null

/** How many models the table names — what a spec counts to know the whole of it
 * was transcribed. */
export const BREAKABLE_COUNT = HEALTH.size

/**
 * Whether this model is a piece of a BUILDING — one of the seven building
 * sets' floors (F), roofs (R), walls (W) or stairs (S). The sets share a
 * two-letter prefix and the piece letter follows it, and the pattern is
 * exact over the whole table: STUMP1, SNOWB, CACTUS and BRIDGE_S all fail
 * the piece letter. What it is FOR: play ruled the floating damage number
 * prints only over pigs, buildings and enterable vehicles — not over every
 * bush and fir the blast catches ("дамаг земли показывает урон — надо
 * показывать урон только по свинам и строениям"). `[play]`
 */
export const isStructure = (name: string): boolean =>
  /^(S1|ST|BR|M1|SN|CA|W1)[FRWS]/.test(name.toUpperCase())

/**
 * …and whether it is MADE OF METAL — a gun, a machine, a drum, a gate.
 *
 * `I_METAL` had been written up as "a blast inside a bunker", which made it
 * unplayable: nothing can ask whether a burst went off indoors. **Play read
 * the sample the other way, 2026-08-24 — "взрыв по танку, пушке и прочему"
 * — and that is a question the engine can answer**, because what a blast
 * hits is a named model. `[play]` for the reading, and the list is a name
 * pick like the rest of the bank: correct it by ear.
 *
 * The TANK and the BIG GUN themselves are not here, and cannot be yet: they
 * are the BUILDING class (0x4bc5d0, body type 0x1359, its own OnHit) and
 * nothing in the remake breaks one. They join the day that class does.
 */
// Every name here must also be in the health table above — a metal name
// that nothing builds a target for is a sound that can never play, which
// `unit/breakable.spec.ts` checks so nobody has to remember. (`DRUM` was in
// this list for a minute and is not breakable at all.)
const METAL = new Set([
  'BARREL', 'IRONGATE', 'GATE', 'GATES', 'MACHI', 'PIST', 'RADAR', 'RADAR1',
  'TV', 'WATSTA', 'WATWHE', 'WINDM', 'MONO', 'LAMP', 'CHECKB', 'CHECKP', 'MAST',
  'BARBWIRE', 'BARBWIR2', 'SWILLARM', 'SW2ARM', 'TUN'
])

/** Whether a blast on this model rings — `I_METAL` (audio/battle.ts). */
export const isMetal = (name: string): boolean => METAL.has(name.toUpperCase())
