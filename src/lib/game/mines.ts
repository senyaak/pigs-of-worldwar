// MINEFIELDS, which are not objects — they are a bit in the ground.
//
// Play: "мины тут на карте должны быть." They are, and they have been in every
// shipped map's data all along: **bit 6 of a tile's type byte** (`TILE_MINE`,
// lib/formats/pmg.ts), 99 tiles of it on CAMP and 997 on BUTE. No model stands on
// one — the ground is the whole of what a player sees, which is why the training
// ground can say "FOLLOW THE PATH THROUGH THE MINEFIELD" about a patch of ground
// with nothing standing on it. What a detector sees there instead is `revealed`
// below.
//
// The exe, end to end, and every step of it was read this pass:
//
// ```
// 46bfd9  the pig's own tile, [pig+0x382] == 1        ; on the ground
// 46c00c  the type byte >> 6 & 1                      ; a mine is here
// 46c048  Map::SampleHeight(x, z)                     ; the tile's GROUND
// 46c072  Sound::Play(0x28, 100, 100)                 ; 40 is L_MINETR
// 46c0e3  Projectile(0x1AD or 0x1AC, at the tile)     ; 429 / 428 -- the BLAST
// 46c169  Map::SetMine(col, row, 0, 0)                ; ...and the bit is CLEARED
// ```
//
// So a mine is ONE-SHOT, it goes off at the TILE'S CENTRE rather than under the
// foot that found it, and what it spawns is an ordinary projectile with no arming
// and a 12-frame fuse — you hear the trigger, and then it goes off. The slip
// byte's bit 7 picks 429 over 428 (`Map::SetMine`'s fourth argument writes it),
// and the two rows are identical in everything this engine models: same speed,
// same 2560 of damage, same 1024 of blast. Only the effect id differs, 0x55
// against 0x4c, and the remake has neither.
//
// **A PROJECTILE IS THE SAME TRIGGER AS A FOOT.** The block above stands a second
// time in `Projectile::OnHitLandscape` (0x437a50, inside 0x4377d0), the handler
// every projectile's landscape contact runs. It asks nothing of the kind, so a
// bullet, a rocket and a grenade all set one off by MEETING the ground on the
// tile (lib/game/bullets.ts, lib/game/lobs.ts). Row +0x26, once read as the gate
// on this, is not one: its only reader, 0x436201, turns the body along its flight.
//
// **The mine WEAPON is the same mechanic from the other end**, and it lands
// here (2026-08-26, read out of the exe end to end for the sapper):
//
// Skills 35 and 36 lay a VISIBLE OBJECT (the lay clip's key-frame drops it,
// the same phase TNT's charge goes down at), and the object arms after 25
// frames with the L_MINETR click (0x43699d).
//
// **IN FRONT, off the HAND, exactly as TNT is.** `Pig::Shoot` (0x479f60)
// sends skills 35, 36 and 37 to ONE arm, 0x47a07d, which spawns at bone 5
// plus the vector at `0x4d0ee0 + 2*8` = **(0, 0, 100)** — the same table
// `bullets.ts` takes every muzzle from. Play: "свин ставит не под себя —
// чуть вперёд." It was at `pig.position`, the soles, which made the mine
// the one charge in the game that did not come out of the trotters.
//
// **WHEN it becomes the ground is `[play]`, over the disassembly's own
// reading.** The exe's bed-in walker (0x436e55) was read as "sinks the
// moment nobody is within ±512" — and play overruled the model whole
// (2026-08-26): "мина взрывается когда ход кончается в оригинале." So the
// lay is TNT's own shape end to end: furniture through the layer's turn,
// and at the TURN'S END every laid mine beds into the tile bit
// (`Map::SetMine`, 0x4374cf) — **and one bedded under somebody's feet goes
// off then and there**, which is what the five hurried seconds are for.
// From the bed-in on, the ordinary tread above takes over, no side checked
// anywhere — the layer's own later foot included.
//
// **THE PLANT CAN BE REFUSED, AND A REFUSED MINE EXPLODES** — read end to
// end 2026-09-06, and it overturns "the second lay is simply absorbed".
// `Map::SetMine` is the tail of a global pass, `0x436e40`, whose one caller
// (0x4952b7) runs it only when every projectile is at rest AND the turn's
// clock has expired (`[game+0x518]`, written at 0x49004e) — which is the
// bed-in play already ruled. That pass keeps a flag at `[esp+0x13]`, and
// five tests clear it: off the ground, **a pig within the row's own radius**
// (field +0x00 = 512, one whole tile — 0x436f9c, 0x4370c5), **the tile
// already mined** (0x4371ee), the AP flavour already there (0x437266), and
// water (0x4372cf). The refusal branch (0x4374e4) is not a shrug:
//
// ```
// 437596  Sound::Play(0x28)      ; the L_MINETR click
// 43759d  [proj+0xb4] = 1        ; STATE 1 -- the fuse, byte for byte what
// 4375a7  [proj+0xa8] = 0        ; ...the EXPLOSIVE arm writes at 0x4369e3
// 4375b8  0x49EC20(proj)         ; and the camera cuts to it
// ```
//
// 25 frames later its destructor runs, and the table at 0x435a6c sends rows
// 38/39 to the SAME handlers as the trodden 40/41. So it blows on its own
// row's numbers.
//
// Two things a player sees follow, and play had both from memory before the
// pass was read. **Two mines on one spot BOTH go off**: the first plants, the
// second reads the bit and is refused. **A mine laid beside a standing pig
// cannot plant at all** and blows where it lies at the turn's end — which is
// the whole tactic, "ставишь на свина — она сразу взводится и детонирует в
// конце хода", and it is also why a planted skill grants the extra seconds:
// they are for the layer to walk clear of his own 512.
//
// The old reading of this file — "two on one spot bed into ONE bit and one
// bang" — was play's own guess ("там урон вроде не как от двух будет") taken
// for a rule, and the bytes say otherwise.
//
// 35 against 36 is a FLAVOUR (SetMine's fourth argument, the slip byte's bit
// 7): trigger kinds 40/41, identical damage (2560) and blast (1024), only
// the effect id apart (0x55 against 0x4c) — and both read parameter row 14,
// so the remake detonates both through `MINE_EFFECT_ID`. No shipped kit
// carries 36 at all.
//
// Pure, seconds and game space (Y-DOWN), like the rest of lib/game.

import { FUSE_JITTER, blastReach } from './grenade'
import { MINE_EFFECT_ID, burst } from './blast'
import type { BlastWorld } from './blast'
import { fromExeFrames } from './ballistics'
import { isDead } from './health'
import { HAND_BONE } from './pose'
import type { Point, Pose } from './pose'
import type { Pig } from './game'
import type { Random } from './random'
import type { TerrainQuery } from './terrain'
import type { Emit } from './events'

/**
 * The blast a tripped mine throws — projectile row 40/41 at 0x4c2030, read out
 * of the shipped exe.
 *
 * `damage` is 128ths of a point, so 2560 is twenty against a grunt's fifty
 * (lib/game/projectile.ts), and `blast` is the row's +0x04 the falloff is
 * measured from — the same 1024 a plain grenade carries.
 */
export const MINE_DAMAGE = 2560
export const MINE_BLAST = 1024
/** …and its FORCE, row +0x08 of the same two rows: **3900**, half again the
 * grenade's 2600, which is why a mine throws harder than a grenade while
 * hurting less (lib/game/blast.ts, `flingSpeed`). */
export const MINE_FORCE = 3900
/**
 * Row +0x18, in engine frames — and it is a FUSE rather than a delay before
 * anything is decided.
 *
 * The row's arming count (+0x14) is zero, which is what sends the constructor
 * straight past state 0 into the fuse (0x43200c dispatches on +0x1C only when
 * the arming count is nil), so twelve frames is the whole of it: about four
 * tenths of a second between the trigger and the bang.
 */
export const MINE_FUSE_FRAMES = 12

/**
 * **A MINE IS HIDDEN.** Play: "мины скрыты — текстуры видны только тем кто рядом
 * и то только тем у кого есть класс специальный — и наверно ещё тем кто
 * поставил."
 *
 * The exe's reveal is that rule on the ground itself (scanner/visibility.md,
 * 0x4767A0): a **3×3 of tiles around the detector's own**, so a mine is revealed
 * when its tile is within one tile of a detector's on both axes, and it shows as
 * `MINE_GROUND_ART` in place of the tile's own texture (three/mineGround.ts).
 *
 * Play's "и наверно ещё тем кто поставил" is not in it: nothing in the gate asks
 * who laid a mine, and a layer who is not a detector sees plain ground.
 */
export const DETECT_TILES = 1

/** The texture a revealed mine tile wears: 32×32, a yellow-and-black checkerboard,
 * loaded by the map loader beside the map's own (0x4A55BF, the string at
 * 0x4DB0FC). */
export const MINE_GROUND_ART = 'Language/Tims/Mine.tim'

/**
 * Which classes see them — **the exe's own gate now** (todo B10): the reveal
 * block runs for `[pig+0x19C]` in {4, 5, 6, 7, 0x0E} — the COMMANDO, the
 * whole engineer family, and the HERO — not merely the three whose kit
 * carries the mine.
 */
const DETECTORS = new Set([4, 5, 6, 7, 14])

/** Whether a pig of this class can see what is buried. */
export const detectsMines = (pigClass: number): boolean => DETECTORS.has(pigClass)

/** The two skills that LAY one — the sapper family's weapon
 * (lib/game/kits.ts: classes 5, 6 and 7 carry three of skill 35 each). */
export const isMine = (skill: number | null): boolean => skill === 35 || skill === 36

/** The laid object's arming count: 25 exe frames to the L_MINETR click
 * (the projectile state machine at 0x43699d), through the engine's own
 * frame knob like every count. */
export const ARM_FRAMES = 25

/** Where a charge leaves the hand: bone 5's own space, the muzzle table's
 * row 2 (`0x4d0ee0 + 2*8`), which skills 35, 36 and 37 share. */
export const LAY_FROM: Point = { x: 0, y: 0, z: 100 }

/**
 * How near a pig stops a mine from planting — the projectile row's field
 * +0x00, read at 0x436f9c, which for rows 38 and 39 is **512**: one whole
 * tile, in each of x, y and z separately (0x436fd0..0x4370c5).
 *
 * There is no owner exclusion in that loop, so the LAYER refuses his own
 * mine while he stands over it. Inferred rather than read only in the sense
 * that nothing says "and this is why": the four extra seconds a planted
 * skill grants (lib/game/spend.ts) are what he walks clear with.
 */
export const PLANT_CLEAR = 512

/** A mine that could NOT plant runs its own row's fuse, +0x18 = 25 frames,
 * against the trodden tile's twelve. */
export const LAID_FUSE_FRAMES = 25

/**
 * …and its own row's DAMAGE, +0x0C: 2560 for the MINE and **3200 for the
 * ANTI-PERSONNEL**, where a trodden tile is 2560 either way. So the
 * anti-personnel hurts more when it is refused than when it is stepped on.
 */
export const laidDamage = (skill: number): number => (skill === 36 ? 3200 : MINE_DAMAGE)

/** One mine LAID this turn and not yet part of the ground: furniture in
 * front of the layer until the turn ends (`bedAll`). Drawn to EVERYBODY — it
 * is a visible object in the original too. */
export interface Laid {
  x: number
  y: number
  z: number
  /** Which skill laid it — the flavour, 35 or 36. */
  skill: number
  /** Seconds to the arming click, then 0. */
  arming: number
}

/** One mine counting down: trodden on, or laid and REFUSED its tile. */
export interface Tripped {
  x: number
  y: number
  z: number
  /** Seconds left. */
  fuse: number
  /** What it will take off — the tile's own 2560, or a refused mine's own
   * row (`laidDamage`). */
  damage: number
}

export interface MineWorld extends BlastWorld {
  query: TerrainQuery
  /** Where the hand is — a charge is laid from it (lib/game/pose.ts). */
  pose: Pose
  /** The battle's own stream: the fuse takes the same `rand() & 7` of jitter a
   * grenade's does (lib/game/grenade.ts), so it is a roll everyone must agree
   * on (lib/game/random.ts). */
  random: Random
}

/** One buried mine a detector can see: its tile, and the tile's centre. */
export interface RevealedMine {
  col: number
  row: number
  x: number
  z: number
}

export interface Mines {
  /**
   * Whatever is buried under (x, z) — set it off, by a foot or by a projectile
   * meeting the ground there (top of this file).
   *
   * True the frame one is trodden on, which is the caller's cue to make the
   * noise. The tile is cleared in the same breath, so standing on the spot does
   * not trip it twice and neither does the next pig.
   */
  tread(x: number, z: number): boolean
  /**
   * Lay one IN FRONT of the pig — the lay clip's key-frame calls this the
   * way TNT's calls `plant` (lib/game/attack.ts), and out of the same hand
   * (`LAY_FROM`). Never refused here: whether it can become the ground is
   * the bed-in's question, and its answer to "no" is a bang (`bedAll`).
   */
  lay(pig: Pig, skill: number): boolean
  /** The mines laid and not yet bedded — furniture on the ground, for the
   * renderer and the specs. */
  laid(): readonly Laid[]
  /**
   * THE TURN ENDS: every laid mine tries to become its tile's bit, and one
   * that CANNOT explodes where it lies instead — a pig inside `PLANT_CLEAR`,
   * a tile already mined, or water (the exe's plant pass, top of this file).
   * Called from the end-of-turn beat, whose wait already holds for the fuses
   * this sets counting (lib/game/battle.ts).
   */
  bedAll(): void
  /** Burn the fuses down, blast whatever runs out — and walk the laid mines
   * through their arming click. */
  update(delta: number): void
  /** How many are counting down — what the turn cannot end through
   * (lib/game/battle.ts). */
  live(): number
  /** Every one of them, for a spec to measure. */
  at(): readonly Tripped[]
  /** Whether a mine is still buried here: the map's bit, less the ones already
   * spent. */
  buried(x: number, z: number): boolean
  /**
   * Which buried mines these eyes can SEE — every unspent one within the
   * exe's 3×3 of tiles round a watcher whose class detects them.
   *
   * The caller says whose eyes: the side whose turn it is, the list the exe's
   * reveal walks (0x476A49), so an enemy engineer walking past does not light the
   * field up for the player (three/battle.ts). The tiles, for the ground to wear.
   */
  revealed(watchers: readonly Pig[]): RevealedMine[]
  clear(): void
}

export function createMines(world: MineWorld, emit: Emit): Mines {
  const { query } = world
  /** Which tiles have been spent, by `row * 64 + col` — the exe clears the map's
   * own bit and this is that difference, held outside the map data so a query
   * still answers what the FILE said (lib/game/terrain.ts). */
  const spent = new Set<number>()
  const counting: Tripped[] = []
  /** The furniture: laid this battle and not yet part of the ground. */
  const laid: Laid[] = []
  /** …and the tiles the sapper's mines HAVE bedded into — the runtime half
   * of the map's own bit, key → where and what. */
  const planted = new Map<number, { x: number; z: number; skill: number }>()

  const key = (col: number, row: number): number => row * 64 + col

  /** The tile under (x, z) with a LIVE bit — the map's less the spent ones,
   * or one the sapper bedded — or null. */
  const liveTile = (
    x: number,
    z: number
  ): { col: number; row: number; x: number; z: number } | null => {
    const tile = query.tileCentre(x, z)
    if (tile === null) return null
    const k = key(tile.col, tile.row)
    if (planted.has(k)) return tile
    if (query.hasMine(x, z) && !spent.has(k)) return tile
    return null
  }

  /** Set off whatever live bit is under (x, z) — `tread`, and the bed-in's
   * own goes-off-under-your-feet case (`bedAll`). */
  const trip = (x: number, z: number): boolean => {
    const tile = liveTile(x, z)
    if (tile === null) return false
    const k = key(tile.col, tile.row)
    planted.delete(k)
    spent.add(k)
    counting.push({
      x: tile.x,
      z: tile.z,
      // On the ground at the tile's middle, which is where the exe samples it.
      y: query.height(tile.x, tile.z),
      fuse: fromExeFrames(MINE_FUSE_FRAMES + Math.floor(world.random() * (FUSE_JITTER + 1))),
      damage: MINE_DAMAGE
    })
    return true
  }

  /**
   * Whether the plant pass turns this one down — the exe's five tests, less
   * the one this engine has nothing to ask (a charge off the ground: nothing
   * here can lay one in the air).
   *
   * Order does not matter, they all clear the same flag. What matters is
   * that a "no" is an EXPLOSION and not a shrug (top of this file).
   */
  const refused = (mine: Laid): boolean => {
    // WATER. It used to drown quietly, which was this engine's own idea; the
    // refusal branch is shared by all five tests, so it bangs like the rest.
    if (query.isWater(mine.x, mine.z)) return true
    // ANYBODY too close, in each axis separately, and the layer counts
    // against his own (`PLANT_CLEAR`). The exe's test is "drawn or
    // concealed", so a HIDDEN pig refuses it too — a bush is still a body.
    for (const pig of world.pigs()) {
      if (pig.gone || isDead(pig)) continue
      if (Math.abs(pig.position.x - mine.x) >= PLANT_CLEAR) continue
      if (Math.abs(pig.position.y - mine.y) >= PLANT_CLEAR) continue
      if (Math.abs(pig.position.z - mine.z) >= PLANT_CLEAR) continue
      return true
    }
    // …and a tile that already carries one, which is how the SECOND of two
    // laid on one spot comes to go off.
    return liveTile(mine.x, mine.z) !== null
  }

  return {
    buried(x, z) {
      return liveTile(x, z) !== null
    },
    tread: trip,
    lay(pig, skill) {
      // The hand, not the soles (`LAY_FROM`) — and a battle nobody is drawing
      // has no hand to ask (`NO_POSE`), which is what the fallback is for.
      const hand = world.pose.boneToWorld(pig, HAND_BONE, LAY_FROM)
      const x = hand?.x ?? pig.position.x
      const z = hand?.z ?? pig.position.z
      if (query.tileCentre(x, z) === null) return false
      // The HEIGHT is the ground under it: a charge rests on what is beneath
      // it, and the hand is holding it above that (lib/game/lobs.ts `plant`
      // argues the same for TNT).
      laid.push({ x, y: query.height(x, z), z, skill, arming: fromExeFrames(ARM_FRAMES) })
      return true
    },
    laid: () => laid,
    bedAll() {
      for (const mine of laid.splice(0, laid.length)) {
        const tile = query.tileCentre(mine.x, mine.z)
        // Off the grid there is nothing to plant into and nothing read for
        // it — and `lay` already refused that ground, so it cannot happen.
        if (tile === null) continue
        const k = key(tile.col, tile.row)
        if (refused(mine)) {
          // **IT BLOWS WHERE IT LIES**, on its own row and not the tile's —
          // the click, then 25 frames (top of this file). The blast is at the
          // MINE, not at the tile's centre: this is a projectile's own
          // destructor rather than the ground going off.
          emit({ kind: 'mineTripped', at: { x: mine.x, y: mine.y, z: mine.z } })
          counting.push({
            x: mine.x,
            y: mine.y,
            z: mine.z,
            fuse: fromExeFrames(
              LAID_FUSE_FRAMES + Math.floor(world.random() * (FUSE_JITTER + 1))
            ),
            damage: laidDamage(mine.skill)
          })
          continue
        }
        // …and one that CAN plant becomes the ground: a spent map tile is
        // live again under a fresh mine.
        spent.delete(k)
        planted.set(k, { x: tile.x, z: tile.z, skill: mine.skill })
      }
    },
    update(delta) {
      // The laid mines' arming click — furniture until the turn ends.
      for (const mine of laid) {
        if (mine.arming <= 0) continue
        mine.arming -= delta
        if (mine.arming > 0) continue
        mine.arming = 0
        emit({ kind: 'mineArmed', at: { x: mine.x, y: mine.y, z: mine.z } })
      }
      for (let i = counting.length - 1; i >= 0; i--) {
        const mine = counting[i]
        mine.fuse -= delta
        if (mine.fuse > 0) continue
        counting.splice(i, 1)
        // …and it does not look like a grenade. The mine's own destructor names
        // effect 0x4c, which reads parameter row 14 (lib/game/effects.ts).
        burst(
          mine,
          {
            damage: mine.damage,
            reach: blastReach(MINE_BLAST),
            effect: MINE_EFFECT_ID,
            force: MINE_FORCE
          },
          world,
          emit
        )
      }
    },
    revealed(watchers) {
      // Gone, not dead: the exe's gate refuses state 8 and lets DEAD's 6 through
      // (0x4768D5), and only moves a pig to 8 when its body leaves the map
      // (0x468232), so a detector lying where it fell still lights its tiles.
      const seeing = watchers.filter((pig) => detectsMines(pig.pigClass) && !pig.gone)
      if (seeing.length === 0) return []
      // The exe's reveal is a 3×3 of TILES round the detector's own
      // (0x4767a0), so the eyes are tile places, not a radius.
      const eyes = seeing
        .map((pig) => query.tileCentre(pig.position.x, pig.position.z))
        .filter((tile): tile is NonNullable<typeof tile> => tile !== null)
      const nearTile = (col: number, row: number): boolean =>
        eyes.some(
          (eye) => Math.abs(eye.col - col) <= DETECT_TILES && Math.abs(eye.row - row) <= DETECT_TILES
        )
      const out: RevealedMine[] = []
      for (const tile of query.mineTiles()) {
        if (spent.has(key(tile.col, tile.row))) continue
        if (nearTile(tile.col, tile.row)) out.push(tile)
      }
      // …and the ones the sapper bedded this battle, by the same eyes.
      for (const [k, mine] of planted) {
        const col = k % 64
        const row = Math.floor(k / 64)
        if (nearTile(col, row)) out.push({ col, row, x: mine.x, z: mine.z })
      }
      return out
    },
    live: () => counting.length,
    at: () => counting,
    clear() {
      counting.length = 0
    }
  }
}
