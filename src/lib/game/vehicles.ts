// VEHICLES — the other thing a pig climbs into.
//
// A different exe class from a building and it says so in one byte: the
// constructor at 0x499870 stamps `[this+0x38] = 0x1358` where a BUILDING is
// 0x1359 (lib/game/buildings.ts). The entry code tells them apart on exactly
// that and nothing else — `cmp eax, 0x1358` at 0x47d730 — and then does the
// same thing to the pig either way: hide it, still it, hang it off the thing's
// occupant list, and set its state to **3** for a vehicle where a building is
// **4**.
//
// So most of getting in is shared, and `indoors.ts` holds both. What is NOT
// shared is here: which names are vehicles, how much they take, how many they
// hold, and which of them has a gun.
//
// The behaviour the manual states and this file does not have yet — driving,
// ramming, the troop carriers picking up whoever they drive into, and the
// EJECT skill that puts one back out — is in `docs/todo.md` B28. What is built
// is the half a parked tank already is: **a mount you get into and shoot from**,
// which is the pillbox's own machinery with a different table behind it.
//
// Pure data, no state. Game space, Y-down.

/**
 * The exe's VEHICLES group, in its own order — object name table 0x4D9680,
 * entries **445..451**, and the KIND is the offset into that run: the runtime
 * spawner at 0x470430 takes a kind and makes object `kind + 0x1BD`, and the
 * constructor turns it back with `[this+0xa4] = objectId − 0x1BD`.
 *
 * What the shipped campaign actually places, measured over all 61 POGs:
 * **six TANKs on OASIS**, **two CARRYs on SNAKE**, **one AMLAUNCH on BAY**.
 * AM_TANK exists only on the six `GEN*` templates; **BOAT, AIRSHIP1 and PP1
 * are on no map at all**. The last two are not scenery — they are what an AIR
 * STRIKE spawns to fly the bomb in (0x470430 with kind 5), which is why their
 * health is one point rather than a hundred and fifty.
 */
export const VEHICLE_NAMES = [
  'AMLAUNCH',
  'AM_TANK',
  'BOAT',
  'TANK',
  'CARRY',
  'AIRSHIP1',
  'PP1'
] as const

/** The kind a POG record's model name names, or null when it is not one. */
export function vehicleKind(name: string): number | null {
  const at = VEHICLE_NAMES.indexOf(name.toUpperCase() as (typeof VEHICLE_NAMES)[number])
  return at < 0 ? null : at
}

/**
 * **The vehicle table, 0x4D94A0 — twelve bytes a kind, and nothing had read
 * it.** The constructor takes two of the three:
 *
 * ```
 * 499916  eax = kind * 12
 * 49991d  [this+0x4c]  = [eax + 0x4d94a0]   ; health, 128ths
 * 499930  [this+0xa8]  = [eax + 0x4d94a4]   ; ...and this one
 * ```
 *
 * The second column is the CAPACITY, and the proof is not in the exe alone —
 * it is the manual meeting the exe. Ten for AMLAUNCH and CARRY, one for
 * everything else; and the manual's own line is "the troop **carriers** can be
 * handy for picking up a group of your chums". The two kinds that hold ten are
 * exactly the two the ram switch at 0x478580 sends to a DIFFERENT arm from the
 * three that knock a pig flying.
 *
 * The third column is 30 on all seven, so it separates nothing and is not
 * named here. `[gap]` — 0x499aaa and 0x499ac2 read it, into the physics body.
 */
const VEHICLE_ROW: readonly (readonly [number, number])[] = [
  [19200, 10], // 0 AMLAUNCH
  [19200, 1], // 1 AM_TANK
  [19200, 1], // 2 BOAT
  [19200, 1], // 3 TANK
  [19200, 10], // 4 CARRY
  [128, 1], // 5 AIRSHIP1
  [128, 1] // 6 PP1
]

/**
 * What one takes before it is wrecked, in the engine's 128ths — **a hundred
 * and fifty points** for everything that stands on the ground, which is half
 * again what the toughest building takes (the BIG_GUN's 200 is the only thing
 * above it).
 *
 * Read and NOT applied, exactly as `buildingHealth` is: nothing in the remake
 * breaks a vehicle yet, and the manual is emphatic that it should —
 * "it's best to abandon a vehicle before it is destroyed. Its death throes can
 * cause you a large amount of damage."
 */
export const vehicleHealth = (kind: number): number => VEHICLE_ROW[kind]?.[0] ?? 0

/** How many pigs fit — ten in a carrier, one in everything else. */
export const vehicleRoom = (kind: number): number => VEHICLE_ROW[kind]?.[1] ?? 1

/**
 * **The three tank weapons**, and which kinds have them is read the same way
 * the pillbox's pair was: by which kinds have a barrel that MOVES.
 *
 * `Vehicle::ChangeAim` (0x49b6e0) is the mirror of the building's, and its
 * clamp is a two-way switch on `[veh+0xa4]`:
 *
 * ```
 * 49b72f  dec eax ; je      -> kind 1, AM_TANK
 * 49b732  sub eax,2 ; je    -> kind 3, TANK
 * 49b737  else                 max 0
 * ...     the range is always [0, max]
 * ```
 *
 * So **AM_TANK and TANK elevate and nothing else does** — a CARRY is transport
 * and a BOAT is a hull. The three skills are the icon names' own claim as well:
 * `tankairb`, `tankbazo`, `tankmort` (lib/game/skills.ts, `SKILL_ICON`).
 *
 * The carriers offer nothing here YET and that is a hole, not a reading: the
 * manual gives them the **EJECT** skill, which is skill 62 and has no fire arm
 * at all — it lives in the inventory-select table instead (`weapons/
 * emplaced.md`). B28.
 */
const VEHICLE_SKILLS: readonly (readonly number[])[] = [
  [], // 0 AMLAUNCH — a carrier; wants EJECT
  [47, 48, 49], // 1 AM_TANK
  [], // 2 BOAT
  [47, 48, 49], // 3 TANK
  [], // 4 CARRY — a carrier; wants EJECT
  [], // 5 AIRSHIP1 — not something a pig gets into
  [] // 6 PP1
]

export const vehicleSkills = (kind: number): number[] => [...(VEHICLE_SKILLS[kind] ?? [])]

/**
 * How far the TURRET elevates, in the 4096-unit circle — `[0, 0x400]` for the
 * two tanks and nothing for the rest (0x49b740..0x49b75c).
 *
 * **A turret reaches twice as high as a pillbox's barrel**: ninety degrees
 * against forty-five. And like the pillbox's it only goes UP — the minimum is
 * a hard zero, so a tank cannot shoot downhill at all.
 */
const TURRET_RANGE: readonly (readonly [number, number] | null)[] = [
  null, // 0 AMLAUNCH
  [0, 1024], // 1 AM_TANK
  null, // 2 BOAT
  [0, 1024], // 3 TANK
  null, // 4 CARRY
  null, // 5 AIRSHIP1
  null // 6 PP1
]

export const turretRange = (kind: number): readonly [number, number] | null =>
  TURRET_RANGE[kind] ?? null

/**
 * **Which vehicles KNOCK what they drive into, and which pick it up.**
 *
 * Not built — driving is not built — but it is read, and it is the cleanest
 * split in the class. `Pig::OnHit`'s arm for a body of type 0x1358 (0x478061)
 * refuses unless the pig hit is not the driver, the driver is in THIS vehicle,
 * and `[veh+0xc0]` — the motion register — is non-zero, i.e. **a parked
 * vehicle never touches anybody**. Then it switches on the kind through the
 * five-entry table at 0x478580:
 *
 * ```
 * 0 AMLAUNCH -> 0x4781f3      1 AM_TANK -> 0x4780bb
 * 2 BOAT     -> 0x4780bb      3 TANK    -> 0x4780bb
 * 4 CARRY    -> 0x4781f3
 * ```
 *
 * The two carriers take one arm and the three fighting vehicles the other, and
 * the manual says which is which: "be careful who you drive into when you are
 * in a tank… it'll give them a nasty knock", against "just drive into one of
 * your team-mates and he will oblige by jumping in with you".
 */
export const vehicleCarries = (kind: number): boolean => vehicleRoom(kind) > 1
