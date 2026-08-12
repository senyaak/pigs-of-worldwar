// The hoof, and the moment it lands.
//
// A footstep is not a timer and never was: it is a **key-frame event on the
// clip**, the same channel the bayonet's four strikes and the charge's
// bent-over placing come off (lib/game/melee.ts, grenade.ts). Each clip carries
// up to six `(phase, id, id)` rows out of `afGetKeyFrameList` (`_d3d.dll`
// 0x1002c778 + clip*88), the exe's pump fires every row the cursor has passed
// this frame (0x4733d0) and a 74-way switch (0x4736a0) turns the id into a
// call. **Ids 1..6, and 9/10 as aliases of 4/5, are all one function** —
// 0x475010, the footstep — and what the arm pushes is which hoof and how loud:
//
// | ids | hoof | volume |
// | --- | ---- | ------ |
// | 1, 4, 9 | 1 | 45, 30 |
// | 2, 5, 10 | 2 | 45, 30 |
// | 3, 6 | 0 | 45, 30 |
//
// So the run cycle steps twice a lap, the swim kicks four times quietly, and a
// pig laying a charge scuffs once on the way down and once on the way up — all
// of it authored, none of it guessed. `anim/key-events.js` in the disasm repo
// dumps the table this file holds.
//
// WHICH sound a step makes is the ground's business and is decoded beside the
// table: `stepSound` in `audio/battle.ts` takes the tile's terrain type. This
// module says only that a hoof landed, whose it was, and how hard — the bus
// carries data, never a file name (lib/game/events.ts).
//
// Pure, like the rest of lib/game: clips and a terrain query in, events out.

import type { Anim } from './anim'
import { CLIP_FPS } from './clips'
import type { ClipTiming } from './clips'
import type { Emit } from './events'
import type { Pig } from './game'
import { PHASE_UNITS } from './melee'
import type { TerrainQuery } from './terrain'

/** One authored footfall: where in the clip, which hoof, and how hard. */
export interface Footfall {
  /** 0..4095 through the clip, the exe's own phase. */
  phase: number
  /**
   * WHICH hoof — 0, 1 or 2, and it is heard: the handler writes a pitch of
   * 100, 92 and 108 into the slot it plays with (0x475275, 0x4752f6,
   * 0x475374), so the two feet sit 8% either side of nominal and a "foot 0"
   * step — a scuff the whole body makes, and what the door and the parachute
   * carry — plays flat.
   */
  foot: number
  /** The quiet arm: volume 30 against 45 for the loud one. */
  soft: boolean
}

/**
 * Every clip that carries a footstep, straight out of the library — phases in
 * the exe's 0..4095, both id slots of every row read (clip 6 keeps two of its
 * three in the SECOND one).
 *
 * The clips the battle actually plays are the first handful: 0 run, 3 walking
 * backwards, 4 turning on the spot, 5 swimming, 7 the doorway's leap, 19 the
 * grenade, 20/21/22 the blade, 77 laying a charge. The rest are here because
 * reading them cost nothing and a clip that gets wired later arrives with its
 * steps already on it.
 */
export const FOOTFALLS: Readonly<Record<number, readonly Footfall[]>> = {
  0: [
    { phase: 0, foot: 2, soft: false },
    { phase: 1920, foot: 1, soft: false }
  ],
  1: [
    { phase: 1020, foot: 1, soft: true },
    { phase: 3672, foot: 2, soft: false }
  ],
  2: [
    { phase: 720, foot: 1, soft: true },
    { phase: 2160, foot: 2, soft: false }
  ],
  3: [
    { phase: 1224, foot: 1, soft: false },
    { phase: 3264, foot: 2, soft: false }
  ],
  4: [
    { phase: 1890, foot: 2, soft: false },
    { phase: 3780, foot: 1, soft: false }
  ],
  5: [
    { phase: 0, foot: 1, soft: true },
    { phase: 1020, foot: 2, soft: true },
    { phase: 2040, foot: 1, soft: true },
    { phase: 3060, foot: 2, soft: true }
  ],
  6: [
    { phase: 816, foot: 2, soft: true },
    { phase: 2244, foot: 1, soft: true },
    { phase: 3060, foot: 2, soft: true }
  ],
  7: [{ phase: 3300, foot: 0, soft: false }],
  19: [
    { phase: 1638, foot: 2, soft: false },
    { phase: 3159, foot: 2, soft: true },
    { phase: 3627, foot: 1, soft: false },
    { phase: 3978, foot: 2, soft: true }
  ],
  20: [
    { phase: 1692, foot: 1, soft: false },
    { phase: 3807, foot: 1, soft: false }
  ],
  21: [
    { phase: 2975, foot: 1, soft: true },
    { phase: 3400, foot: 2, soft: false }
  ],
  22: [{ phase: 3164, foot: 1, soft: false }],
  28: [{ phase: 3465, foot: 2, soft: false }],
  35: [{ phase: 1130, foot: 2, soft: false }],
  40: [
    { phase: 240, foot: 1, soft: false },
    { phase: 640, foot: 2, soft: false },
    { phase: 2640, foot: 2, soft: false },
    { phase: 4000, foot: 2, soft: false }
  ],
  42: [{ phase: 2772, foot: 0, soft: false }],
  43: [{ phase: 2640, foot: 0, soft: false }],
  54: [
    { phase: 1358, foot: 2, soft: false },
    { phase: 1843, foot: 1, soft: false },
    { phase: 3977, foot: 2, soft: false }
  ],
  57: [
    { phase: 3696, foot: 1, soft: false },
    { phase: 3920, foot: 2, soft: false }
  ],
  58: [
    { phase: 990, foot: 0, soft: false },
    { phase: 2871, foot: 0, soft: true }
  ],
  77: [
    { phase: 584, foot: 2, soft: false },
    { phase: 3796, foot: 2, soft: false }
  ],
  79: [
    { phase: 560, foot: 1, soft: true },
    { phase: 4000, foot: 1, soft: true }
  ]
}

/** What a clip's footfalls are, or nothing at all — most clips have none. */
export const footfallsOf = (clip: number | null): readonly Footfall[] =>
  clip === null ? [] : (FOOTFALLS[clip] ?? [])

export interface Footsteps {
  /** Advance every pig's cursor and announce what it crossed. Once a frame,
   * AFTER the clips have been burned down (lib/game/anim.ts). */
  update(): void
}

interface Parts {
  pigs: () => Pig[]
  anim: Anim
  clips: ClipTiming[]
  query: TerrainQuery
}

/**
 * The cursor is kept HERE rather than on the pig, because it is not a rule:
 * nothing in the battle branches on how far into a clip a pig is except the
 * two that already carry their own phase (the charge, the doorway).
 */
export function createFootsteps({ pigs, anim, clips, query }: Parts, emit: Emit): Footsteps {
  /** Where each pig's clip cursor was last frame, in absolute phase — and
   * which REVISION it belonged to, so a restarted clip starts over rather
   * than picking up where the last one stopped (lib/game/anim.ts). */
  const cursors = new Map<number, { revision: number; phase: number }>()

  const step = (pig: Pig): void => {
    const worn = anim.wornBy(pig)
    const falls = footfallsOf(worn.index)
    if (!falls.length || worn.index === null) {
      cursors.delete(pig.id)
      return
    }
    const frames = clips[worn.index]?.frameCount ?? 0
    if (frames <= 0) return

    // Absolute phase: it climbs past 4096 with every lap of a looping clip, so
    // a walk cycle's two steps come round again without any wrap arithmetic. A
    // COMMITTED clip is played through once and its last frame held, so it
    // stops at the end instead (lib/game/anim.ts).
    const lap = frames / CLIP_FPS
    const reached = (worn.elapsed / lap) * PHASE_UNITS
    const now = worn.once ? Math.min(reached, PHASE_UNITS) : reached

    const was = cursors.get(pig.id)
    // −1 rather than 0, so a footfall authored AT phase 0 — the run cycle's
    // own first step — is heard on the frame the clip starts.
    const before = was && was.revision === worn.revision ? was.phase : -1
    cursors.set(pig.id, { revision: worn.revision, phase: now })

    // Never look back further than one lap. A frame that swallowed a whole
    // cycle (a stall, a warp) owes at most one step per foot, not a burst.
    const from = Math.max(before, now - PHASE_UNITS)
    const surface = query.tileType(pig.position.x, pig.position.z)
    for (const fall of falls) {
      const lapsIn = Math.floor((now - fall.phase) / PHASE_UNITS)
      if (lapsIn < 0) continue
      const at = fall.phase + lapsIn * PHASE_UNITS
      if (at <= from) continue
      emit({
        kind: 'stepped',
        at: { ...pig.position },
        surface,
        foot: fall.foot,
        soft: fall.soft
      })
    }
  }

  return {
    update() {
      for (const pig of pigs()) step(pig)
    }
  }
}
