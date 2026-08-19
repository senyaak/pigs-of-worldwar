// What a pig carries onto the field: its class's own kit.
//
// The 128-byte record per class at 0x4d02e0 does not stop at health (+0x00,
// lib/game/health.ts) and the walk grant (+0x04, lib/game/movement.ts): from
// +0x08 on it is `(skill, amount)` pairs, −1 for unlimited, ended by a `0,−1`
// pair — the class's KIT (`movement/notes.md` has the record's shape,
// `weapons/mines.md` its first twelve rows). A pig in the original steps onto
// the field already armed — a grunt with its bayonet, rifle and three
// grenades before it has seen a crate — so the crates are a top-up, not the
// source, and the inventory rules it is given through already exist
// (lib/game/inventory.ts).
//
// The rows below were read whole out of `warhogs_.exe` on 2026-08-19 — all
// twenty-four records, where the notes' table had stopped at class 11 and had
// cut class 4's row short. Classes 15 and 16 continue the hero family — 16 is
// the ACE the `AC_ME` marker names (lib/game/spawns.ts) — and rows 17..23 are
// real records whose reader is not found: no marker names those classes, so
// they are not carried here.
//
// Pure: a table, and the slots a class starts with.

import { give, UNLIMITED } from './inventory'
import type { Slot } from './inventory'

const INF = UNLIMITED

/** One class's kit: `[skill, amount]` pairs in the record's own order,
 * skill ids named in lib/game/skills.ts. */
type Kit = readonly (readonly [number, number])[]

/** What each class starts with (exe 0x4d02e0, record +0x08). */
export const CLASS_KIT: readonly Kit[] = [
  // 0 GRUNT — bayonet, rifle, three grenades
  [[3, INF], [7, INF], [19, 3]],
  // 1 GUNNER — trotter, pistol, bazooka
  [[1, INF], [6, INF], [29, INF]],
  // 2 BOMBARDIER — the gunner's, and three mortars
  [[1, INF], [6, INF], [29, INF], [28, 3]],
  // 3 PYROTECH — five mortars, three flamethrowers, an airburst
  [[1, INF], [6, INF], [29, INF], [28, 5], [14, 3], [31, 1]],
  // 4 COMMANDO — knife, bazooka, a machine gun, sniper rifle, conceal,
  // an airburst, a jetpack, a cluster grenade, three medicine darts,
  // a poison gas, a TNT
  [[2, INF], [29, INF], [9, 1], [11, INF], [55, INF], [31, 1], [50, 1],
   [20, 1], [17, 3], [26, 1], [37, 1]],
  // 5 SAPPER — trotter, rifle bell, three mines, a TNT
  [[1, INF], [12, INF], [35, 3], [37, 1]],
  // 6 ENGINEER — a suicide, two TNT, three super grenades besides
  [[1, INF], [12, INF], [35, 3], [51, 1], [37, 2], [27, 3]],
  // 7 SABOTEUR — the super rifle, three of the TNT and the grenades
  [[1, INF], [13, INF], [35, 3], [37, 3], [27, 3], [51, 1]],
  // 8 SCOUT — knife, rifle, conceal, a poison gas, a pick pocket
  [[2, INF], [7, INF], [55, INF], [26, 1], [54, 1]],
  // 9 SNIPER — the sniper rifle, two pick pockets, a suicide
  [[2, INF], [11, INF], [55, INF], [26, 1], [54, 2], [51, 1]],
  // 10 SPY — three pick pockets, a TNT, three cattle prods
  [[2, INF], [11, INF], [55, INF], [26, 1], [54, 3], [37, 1], [5, 3]],
  // 11 ORDERLY — knife, rifle, three healing hands, three grenades
  [[2, INF], [7, INF], [52, 3], [19, 3]],
  // 12 MEDIC — three medicine darts and medicine balls besides
  [[2, INF], [7, INF], [52, 3], [17, 3], [33, 3], [19, 3]],
  // 13 SURGEON — three rifle bursts and a tranquilliser dart on top
  [[2, INF], [7, INF], [52, 3], [8, 3], [17, 3], [33, 3], [18, 1], [19, 3]],
  // 14 HERO — sword, bazooka, sniper rifle and conceal unlimited; one each
  // of TNT, airburst, jetpack, cluster grenade, heavy machine gun, special
  // ops, plane, poison gas and medic; three medicine darts
  [[4, INF], [29, INF], [37, 1], [31, 1], [50, 1], [20, 1], [10, 1],
   [11, INF], [55, INF], [57, 1], [58, 1], [17, 3], [26, 1], [53, 1]],
  // 15 — between HERO and ACE, named by nothing: three jetpacks, a cluster
  // air strike and a tranquilliser dart where the hero had the rifles
  [[4, INF], [29, INF], [37, 1], [31, 1], [50, 3], [20, 1], [10, 1],
   [57, 1], [58, 1], [59, 1], [18, 1], [26, 1], [53, 1]],
  // 16 ACE — 15's, and an unlimited shockwave
  [[4, INF], [29, INF], [37, 1], [31, 1], [50, 3], [20, 1], [10, 1],
   [57, 1], [58, 1], [59, 1], [18, 1], [26, 1], [53, 1], [56, INF]]
]

/**
 * The slots a pig of `pigClass` starts the battle with, given through the
 * inventory's own rules. A class off the end of the table is a grunt — the
 * same fallback its health and its art take.
 */
export function outfit(pigClass: number): Slot[] {
  const slots: Slot[] = []
  for (const [skill, amount] of CLASS_KIT[pigClass] ?? CLASS_KIT[0]) {
    give(slots, skill, amount)
  }
  return slots
}
