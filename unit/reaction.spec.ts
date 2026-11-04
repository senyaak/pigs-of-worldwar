// PHASE 002 (domain) — the reaction to having been hurt, and the sneeze of a
// bystander lasting. Pure, no Electron.
//
// The exe's shape (`movement/clips.md` in the disasm repo): when a turn has played
// out, a pass over every pig reads and zeroes the damage it took since the last one
// (0x467ec0), and a living pig with some of it to show and a status bit up plays
// clip 0x25, the Sneeze (0x467f77 -> 0x4726dc).

import { test, expect } from '@playwright/test'

import { createAnim } from '../src/lib/game/anim'
import { dressBystanders } from '../src/lib/game/battle/dress'
import type { BattleCore } from '../src/lib/game/battle/core'
import { NO_BODY } from '../src/lib/game/body'
import type { BattleEvent } from '../src/lib/game/events'
import type { Pig } from '../src/lib/game/game'
import { SNEEZE_CLIP } from '../src/lib/game/gas'
import { ANIM } from '../src/lib/game/locomotion'
import { createReaction } from '../src/lib/game/reaction'
import { terrain } from './fixture'

const pigAt = (id: number, health = 50): Pig =>
  ({
    id,
    name: 'SCOUT',
    index: 0,
    health,
    carrying: [],
    holding: null,
    position: { x: 0, y: 0, z: 0 },
    body: NO_BODY,
    heading: 0,
    pigClass: 8,
    gone: false,
    parachutes: false
  }) as unknown as Pig

const field = (
  pigs: Pig[],
  afflicted: (pig: Pig) => boolean
): { reaction: ReturnType<typeof createReaction>; sneezed: () => number[] } => {
  const heard: BattleEvent[] = []
  const reaction = createReaction({ pigs: () => pigs, afflicted }, (event) => heard.push(event))
  return {
    reaction,
    sneezed: () => {
      const who = heard.flatMap((one) => (one.kind === 'clip' && one.index === SNEEZE_CLIP ? [one.pig] : []))
      heard.length = 0
      return who
    }
  }
}

test('hurt with the bit up, a pig sneezes at the pass and not before', { tag: '@nodata' }, () => {
  const sick = pigAt(1)
  const { reaction, sneezed } = field([sick], () => true)
  reaction.hurt(sick.id)
  expect(sneezed(), 'the damage alone plays nothing').toEqual([])
  reaction.settle()
  // exe: movement/clips.md, 0x467f5f..0x467f77 — any damage with `[pig+0x3a4]` set
  // pushes kind 0x0b, and 0x4726dc makes that clip 0x25.
  expect(sneezed()).toEqual([1])
  expect(SNEEZE_CLIP).toBe(0x25)
})

test('the pass forgets: the next one has nothing to show', { tag: '@nodata' }, () => {
  const sick = pigAt(1)
  const { reaction, sneezed } = field([sick], () => true)
  reaction.hurt(sick.id)
  reaction.settle()
  sneezed()
  // exe: movement/clips.md, 0x467efd zeroes `[pig+0x1ac]`, and 0x467f5b skips the
  // reaction on no damage.
  reaction.settle()
  expect(sneezed()).toEqual([])
})

test('no sneeze without both: hurt and afflicted', { tag: '@nodata' }, () => {
  const healthy = pigAt(1)
  const untouched = pigAt(2)
  const { reaction, sneezed } = field([healthy, untouched], (pig) => pig === untouched)
  reaction.hurt(healthy.id)
  reaction.settle()
  expect(sneezed(), 'hurt with no bit up is the brushoff, not this').toEqual([])
})

test('a dead pig does not sneeze', { tag: '@nodata' }, () => {
  const dead = pigAt(1, 0)
  const { reaction, sneezed } = field([dead], () => true)
  reaction.hurt(dead.id)
  reaction.settle()
  // exe: movement/clips.md — 0x467f06 sends state 6 past the reaction.
  expect(sneezed()).toEqual([])
})

test('a bystander plays a sneeze through; the stand comes back after it', { tag: '@nodata' }, () => {
  const acting = pigAt(1)
  const bystander = pigAt(2)
  // A clip table long enough to index 37 by, each a second long at 25 frames.
  const anim = createAnim(Array.from({ length: 83 }, () => ({ frameCount: 25 })))
  const core = {
    query: terrain(() => 0),
    anim,
    tumbles: { has: () => false },
    everyone: () => [acting, bystander]
  } as unknown as BattleCore

  anim.setClip(bystander, ANIM.IDLE)
  // exe: weapons/gas.md, 0x477b6a..0x477b74 — SetAnim(0x25, 0, 1, 1), a repeat count
  // of one, and nothing in the exe's standing state stamps over a running clip.
  anim.playOnce(bystander, SNEEZE_CLIP)
  dressBystanders(core, acting)
  expect(anim.wornBy(bystander).index, 'the next frame').toBe(SNEEZE_CLIP)
  anim.update(10)
  dressBystanders(core, acting)
  expect(anim.wornBy(bystander).index, 'after it').toBe(ANIM.IDLE)
})
