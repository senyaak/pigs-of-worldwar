// BUILDINGS — the six things in this game a pig can get INSIDE.
//
// They are their own class in the original (vtable 0x4bc5d0, body type 0x1359,
// `objects/notes.md`), which is why they are not in `breakable.ts` with the 349
// pieces of scenery: they carry their own health, their own OnHit, and a LIST of
// the pigs standing in them.
//
// Everything here but the last table is measured. The name table's BUILDINGS
// group is indices 1..6, and the constructor (0x43f1c2) reads an 8-byte row per
// kind out of **0x4c2e08**:
//
// ```
// 43f1c2  eax = kind - 1
// 43f1ce  eax = [eax*8 + 0x4c2e08]   ->  [this+0x4c]   ; health, 128ths
// 43f1e2  eax = [eax*8 + 0x4c2e0c]   ->  [this+0xd8]   ; and the other one
// ```
//
// | kind | name | +0 | in points | +4 |
// | - | - | - | - | - |
// | 1 | BIG_GUN | 25600 | 200 | 1 |
// | 2 | M_TENT1 | 3840 | 30 | 2 |
// | 3 | M_TENT2 | 5120 | 40 | 4 |
// | 4 | PILLBOX | 12800 | 100 | 2 |
// | 5 | **SHELTER** | 12800 | **100** | **3** |
// | 6 | TENT_S | 3200 | 25 | 1 |
//
// **The second column is a CAPACITY**, and that is read rather than guessed:
// 0x46ca50 takes `[+0xd8] − [+0xe4]` and runs it through `neg`/`sbb`/`inc`, which
// is the compiler's `== 0`, and a pig meeting a building where those two are
// equal is turned away. `[+0xe4]` is the occupant COUNT, kept beside the list
// itself — `Building::AddOccupant` (0x43f7f0) hangs an 8-byte node off
// `[this+0x80]` and increments it. So three pigs fit in a shelter and one in a
// big gun.
//
// Pure data and one reach test. No state — who is actually inside is
// `lib/game/indoors.ts`.

/** The BUILDINGS group of the object name table, in its own order, so the index
 * into this array plus one IS the kind the exe uses. */
export const BUILDING_NAMES = ['BIG_GUN', 'M_TENT1', 'M_TENT2', 'PILLBOX', 'SHELTER', 'TENT_S']

/** Health and capacity per kind, straight off 0x4c2e08. Health in the engine's
 * 128ths, like every other health in the game. */
const BUILDING_ROW: readonly (readonly [number, number])[] = [
  [25600, 1],
  [3840, 2],
  [5120, 4],
  [12800, 2],
  [12800, 3],
  [3200, 1]
]

/** Which kind a POG record names, 1..6, or null for everything else. */
export function buildingKind(name: string): number | null {
  const at = BUILDING_NAMES.indexOf(name.toUpperCase())
  return at < 0 ? null : at + 1
}

/** How much a building takes before it goes, in the engine's 128ths. */
export const buildingHealth = (kind: number): number => BUILDING_ROW[kind - 1][0]

/** …and how many pigs fit in it. */
export const buildingRoom = (kind: number): number => BUILDING_ROW[kind - 1][1]

/**
 * **WHAT A TURN SPENT INSIDE ONE IS WORTH** — the game's two hospital tents,
 * and the answer to "do the tents work" is that only two of the three do.
 *
 * The manual says it in words (`manual.txt`, and it is `[manual]` rather than
 * inference): *"If your porker gets in a Medic tent and manages to stay inside
 * it until he gets his next turn, he will receive a handy health boost"*, and
 * *"if your trooper is lucky enough to find himself inside a MASH tent, then
 * instead of a meagre health boost, he will be cured back up to full health"*.
 *
 * The exe says which is which, read 2026-09-01 (`damage/notes.md`, whose open
 * question this closes). `Pig::PerTurn` (0x4703A0) calls 0x470340 for a pig
 * whose `[+0x2EC]` is **4** — inside a BUILDING rather than a vehicle — and
 * that arm asks the building itself through 0x43F930, a six-way jump on
 * `[building+0xD4]`, which the constructor sets to **kind − 1** (0x43F1C8):
 *
 * ```
 * 0 BIG_GUN  -> 0     3 PILLBOX -> 0
 * 1 M_TENT1  -> 1     4 SHELTER -> 3
 * 2 M_TENT2  -> 2     5 TENT_S  -> 3
 * ```
 *
 * and 0x470340 does `deficit = [pig+0x3B8] − [pig+0x4C]`, then: code 0 and
 * code 3 return, **code 1 heals `min(deficit, 0x1900)`** — fifty points — and
 * **code 2 heals the whole deficit**. So `M_TENT1` is the MEDIC tent and
 * `M_TENT2` the MASH one, which their rows agree with from the other side:
 * the MASH tent is the bigger and tougher of the two (40 points and room for
 * four against 30 and two).
 *
 * **`TENT_S` is not a hospital at all** — code 3, the shelter's — and that is
 * worth knowing because it is the tent a player meets FIRST: two of them on
 * TRENCH, which is the third mission. It is cover, and cover only.
 */
export type BuildingHeal = 'none' | 'boost' | 'full'

const BUILDING_HEAL: readonly BuildingHeal[] = [
  'none', // 1 BIG_GUN
  'boost', // 2 M_TENT1 — the MEDIC tent
  'full', // 3 M_TENT2 — the MASH tent
  'none', // 4 PILLBOX
  'none', // 5 SHELTER
  'none' // 6 TENT_S
]

/** What a turn spent inside this kind puts back. */
export const buildingHeal = (kind: number): BuildingHeal => BUILDING_HEAL[kind - 1] ?? 'none'

/** How much the MEDIC tent's boost is capped at — `cmp esi, 0x1900` at
 * 0x47037C, which is fifty points in the engine's 128ths. The same fifty a
 * stick of TNT takes off. */
export const TENT_BOOST = 0x1900 / 128

/**
 * **What a pig can DO while it is inside one.**
 *
 * Play: "в инвентаре скилы только постройки, и у бомбоубежища это только
 * пропустить ход." So the menu indoors is not what the pig carries — it is what
 * the BUILDING offers, and a shelter offers nothing but sitting there.
 *
 * **The PILLBOX's two are filled in now**, and the exe never states the pairing
 * as a table — it states it three times as a fact about the kind. `weapons/
 * emplaced.md` is the read:
 *
 * - the barrel only elevates for `kind − 1` of 0 and 3, BIG_GUN and PILLBOX
 *   (`Building::ChangeAim`, 0x4401d0), and the other four clamp to [0, 0];
 * - the AI's own "fire from where you are" branch tests `kind − 1 == 3` and
 *   nothing else (0x445029);
 * - and skills 45 and 46 are the two whose fire arm bails unless the pig is
 *   inside something at all (`[pig+0x170]`, 0x47b5ec / 0x47b6b7).
 *
 * The BIG_GUN's barrel moves too and its weapon is NOT established: the AI
 * scores 39 ARTILLERY RANGE differently for a pig inside one (0x4429c9), which
 * is a hint and not a reading. `[gap]` — it stays empty until that is read.
 */
const BUILDING_SKILLS: readonly (readonly number[])[] = [
  [], // 1 BIG_GUN — a barrel that elevates and no weapon read for it yet
  [], // 2 M_TENT1
  [], // 3 M_TENT2
  [45, 46], // 4 PILLBOX — HEAVY M-GUN and FLAME THROWER
  [], // 5 SHELTER — "у бомбоубежища это только пропустить ход"
  [] // 6 TENT_S
]

export const buildingSkills = (kind: number): number[] => [...(BUILDING_SKILLS[kind - 1] ?? [])]

/** Whether this kind puts a weapon in the hands of whoever is inside it. */
export const buildingArmed = (kind: number): boolean => buildingSkills(kind).length > 0

/**
 * **How far the building's own barrel will point, in the engine's 4096-unit
 * circle** — and it belongs to the BUILDING, not to the pig.
 *
 * `Building::ChangeAim` (0x4401d0) adds the pig's aim delta to `[building+0xe2]`
 * and then clamps it on `[building+0xd4]`, the kind less one:
 *
 * ```
 * 0 (BIG_GUN):  [0,      0x200]     ; level to 45° up, and it cannot depress
 * 3 (PILLBOX):  [-0x200, 0x200]     ; a full 45° each way
 * else:         [0,      0]         ; no barrel — the table's way of saying so
 * ```
 *
 * So **sitting in a pillbox costs half the elevation** a pig has on its feet:
 * `AIM_LIMIT` is 1023 either way and this is 512. The clamp is the mount's and
 * runs after the weapon's own (lib/game/aim.ts, `clampAim`).
 *
 * The exe keeps the angle on the building, so it stays where the last occupant
 * left it, and a skill whose record byte +0x15 is zero snaps it back to level.
 * Neither survives here: the remake's aim is the pig's, and 45 and 46 are the
 * only two skills that ever reach a barrel. `[deliberate]`.
 */
const BARREL_RANGE: readonly (readonly [number, number] | null)[] = [
  [0, 512], // 1 BIG_GUN
  null, // 2 M_TENT1
  null, // 3 M_TENT2
  [-512, 512], // 4 PILLBOX
  null, // 5 SHELTER
  null // 6 TENT_S
]

/** How far this kind's barrel elevates, or null where it has none. */
export const barrelRange = (kind: number): readonly [number, number] | null =>
  BARREL_RANGE[kind - 1] ?? null

/**
 * **The clip a pig plays getting IN or OUT — and it is READ.**
 *
 * Play: "там просто анимация входа — запрыгивание", against a first pass of mine
 * that said there was none. That was wrong, and wrong in a way worth keeping:
 * it looked at a door ARM (the vehicle's IN, 0x469F21, read then as the building's
 * own, which is 0x46A228), found no `Pig::SetAnim` there and stopped. The arm does
 * not need one — it is reached FROM `Pig::Attack`
 * (0x469610), which has already put the skill's own clip on the primary channel.
 * The very path the mine's "Lay Mine" clip 77 comes down. **A failed search means
 * the wrong place was read, never that the mechanic is absent.**
 *
 * Where the clip lives is read off `Pig::Attack` instruction by instruction rather
 * than off a transcription — a second mistake in the same hour, from grepping the
 * repo's own table with a regex that was two rows out:
 *
 * ```
 * 469682  eax = [pig+0x2f4]                 ; the skill
 * 46968e  eax = eax*5 + [pig+0x368]         ; ...five SLOTS per skill
 * 469693  eax <<= 4                         ; ...sixteen bytes each
 * 469696  ecx = [eax + 0x4d7320]            ; = record base + 0x20
 * ```
 *
 * So the clip is `[0x4d7320 + skill*80 + slot*16]`, and slot 0 read off the shipped
 * exe checks out against everything already known: skill 1 TROTTER 21, 3 BAYONET 22,
 * 19 GRENADE 19, **37 TNT 77** — the lay clip, which is the pin. And **60 VEHICLE
 * INOUT and 61 BUILDING INOUT are both clip 7**.
 *
 * Measured out of `Chars/mcap.mad` so it is a climb and not a guess: **54 frames**,
 * the body's own root rising **494 units** (y −564..−70) with a **327°** turn on
 * bone 0, the hip. A pig is 320 model units tall, so it lifts itself more than its
 * own height and rotates while it does. The neighbours for scale: the jump's launch
 * (clip 8) lifts 56, the landing (10) drops 24, the idle (27) moves 3. And it
 * carries **five** key-frame events out of `_d3d.dll` (0x1002c778 + clip*88) —
 * phases 300, 975, 1800, 1950 and 3300 — where an ordinary clip has one or none.
 * A long, multi-beat climb.
 *
 * Going in or out is settled when the clip ENDS, and that is read: 60 and 61 are
 * in the set `0x473600` hands to the shot at the end of the sequence (0x46E3E9),
 * and their arms in the fire table are the toggles (0x47C8A6, 0x47CB13).
 */
export const INOUT_CLIP = 7

/**
 * How far outside its own box a pig may be and still get in — the remake's, and
 * it is the exe's number applied to a different shape.
 *
 * `0x46ca7f` takes the pig against the building on both horizontal axes and wants
 * `|Δ| < 0x100` on each, or else the two BEARINGS within `0x200` of 4096 — 45°.
 * But the pair it differences comes back out of `0x44e850` and what those two
 * words are is not transcribed, so the 256 is borrowed and not the whole rule:
 * here it is slack around the building's own footprint, which is a shape the
 * remake already has and can be stood against.
 */
export const ENTER_REACH = 0x100
