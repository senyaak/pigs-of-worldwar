// The CAMPAIGN: which map each mission is, in the order the campaign walks
// them, and which `gtext` name goes on the card.
//
// A table, not a rule — the exe's own, and every number here was read out of
// `warhogs_.exe` (the disasm repo's `army/notes.md` carries the derivation).
//
// **The order lives at 0x4D17F0 and the progression is one byte in the save.**
// `0x41A2B0` answers "which map next" with `campaignOrder[team + 0x53]`, and
// that is the id that reaches 0x41A552 and picks the weather record. The byte
// is stepped by `[team+0x53]++` at 0x450A19 when a mission ends and the
// campaign is over at 26 (`cmp al,1Ah`, 0x450A23) — so the campaign is 26
// missions, of which the first is the training ground.
//
// `lib/game/sky.ts` keys the same maps by NAME; this module is the only place
// that knows their ids, and it is the only place that knows the campaign at all.

/**
 * All 59 maps, in the exe's own id order — the pointer table at 0x4D1990.
 *
 * Only the first 26 ids are the campaign; the rest are the skirmish arenas and
 * the six `GEN*` texture sets, which run past the end of the mission records.
 */
export const MAP_NAMES = [
  'ROAD', 'TRENCH', 'RUMBLE', 'DEVI', 'TWIN', 'ZULUS', 'SNIPER', 'GUNS',
  'OASIS', 'MASHED', 'CAMP', 'LIBERATE', 'MEDIX', 'FJORDS', 'EYRIE', 'BRIDGE',
  'BAY', 'DESVAL', 'SNAKE', 'EMPLACE', 'KEEP', 'SUPLINE', 'TESTER', 'FOOT',
  'FINAL', 'ESTU', 'DEMO', 'BOOM', 'BHILL', 'LECPROD', 'DVAL', 'ICE', 'BUTE',
  'MAZE', 'SEPIA1', 'DBOWL', 'MLAKE', 'CMASS', 'ARTGUN', 'DVAL2', 'HELL3',
  'HELL2', 'LUNAR1', 'CREEPY2', 'PLAY1', 'PLAY2', 'ICEFLOW', 'RIDGE', 'ARCHI',
  'DEMO2', 'ISLAND', 'LAKE', 'ONEWAY', 'GENSNOW', 'GENDESRT', 'GENBRACK',
  'GENMUD', 'GENCHALK', 'GENLAVA'
] as const

/**
 * The campaign, position by position: the map id to play. The dword table at
 * 0x4D17F0, read to the length the progression can reach.
 *
 * Every map id 0..24 appears exactly once, plus 25 (ESTU) at position 1 —
 * which is why "ids 0..24 end at FINAL, the right shape for a campaign of 25"
 * was one short. The exe's table carries a 27th entry (26, DEMO) and then a
 * zero; nothing walks that far, so neither does this.
 */
export const CAMPAIGN = [
  10, 25, 0, 1, 3, 2, 5, 4, 6, 9, 7, 11, 8, 13, 14, 16, 12, 15, 17, 18, 19, 21,
  20, 22, 23, 24
] as const

/** How many missions the campaign is — and the position a finished one holds. */
export const CAMPAIGN_LENGTH = CAMPAIGN.length

/**
 * Where a mission's DISPLAY name sits in `gtext`: `11 + mapId`, for the 26
 * campaign maps and nothing else.
 *
 * This one line is the only thing on this page taken from the data rather than
 * from code — the level screen the exe draws prints the raw map name
 * (0x429280), so nothing executable pairs them. It is a bijection over the
 * campaign's own maps and it lands every name that can be checked by eye:
 * CAMP→Boot Camp, LIBERATE→Saving Private Rind, FJORDS→Glacier Guns,
 * OASIS→Just Deserts, FOOT→Hamburger Hill, FINAL→Well Well Well. The training
 * ground is the proof that costs nothing: `ui/titleCard.ts` had already
 * hard-coded BOOT CAMP as `gtext 11 + 10`, and CAMP's map id is 10.
 *
 * ESTU, at position 1, falls on `gtext 36` — THE WAR FOUNDATION — which is why
 * `gtext` holds only 25 names at 11..35 for a campaign of 26: the first real
 * mission's name sits in the block after, beside FRIENDLY FIRE, DAMBUSTERS and
 * BRIDGE THE GAP.
 */
export const MISSION_NAMES = 11

/** The map a campaign position opens, or null past the end of the campaign. */
export function mapAt(position: number): string | null {
  const id = CAMPAIGN[position]
  return id === undefined ? null : MAP_NAMES[id]
}

/** A map's id, or -1 for a name no table holds. */
export function mapId(name: string): number {
  return MAP_NAMES.indexOf(name.toUpperCase() as (typeof MAP_NAMES)[number])
}

/** Where in `gtext` a map's mission name is, or -1 if it is not a campaign map. */
export function missionNameIndex(name: string): number {
  const id = mapId(name)
  return id < 0 || !CAMPAIGN.includes(id as (typeof CAMPAIGN)[number])
    ? -1
    : MISSION_NAMES + id
}
