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
 * **What a pig can DO while it is inside one.**
 *
 * Play: "в инвентаре скилы только постройки, и у бомбоубежища это только
 * пропустить ход." So the menu indoors is not what the pig carries — it is what
 * the BUILDING offers, and a shelter offers nothing but sitting there.
 *
 * The PILLBOX's two are read and deliberately empty here: skills **45 HEAVY
 * M-GUN** and **46 FLAME THROWER** are its own weapons (0x4cf0d0 into `gtext`
 * 106 and 110), and neither is built. Putting them in the menu now would put an
 * entry there that does nothing, which is the one thing a menu must not do.
 * `objects/notes.md` keeps the numbers so they are not looked up twice.
 */
const BUILDING_SKILLS: readonly (readonly number[])[] = [[], [], [], [], [], []]

export const buildingSkills = (kind: number): number[] => [...(BUILDING_SKILLS[kind - 1] ?? [])]

/**
 * **The clip a pig plays getting IN or OUT — and it is READ.**
 *
 * Play: "там просто анимация входа — запрыгивание", against a first pass of mine
 * that said there was none. That was wrong, and wrong in a way worth keeping:
 * it looked at the door ARM (0x469f21..0x469fb4), found no `Pig::SetAnim` there
 * and stopped. The arm does not need one — it is reached FROM `Pig::Attack`
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
 * What those five events DO is not decoded, so the remake changes the state when
 * the clip ENDS rather than on one of them.
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
