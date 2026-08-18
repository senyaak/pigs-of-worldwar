// The battle map — the SCANNER, which is what the original calls it.
//
// It is not a screen and it is not opened: it slides in once when the battle
// starts and stays up for the whole of it. Read 2026-08-18, and every claim
// below carries the address it came off.
//
// **The exe does not draw it.** `Data/_d3d.dll` does, and the exe's whole
// share is one carrier object. The HUD's constructor (0x4544E0) loads
// `chars\top.mad` — a flat plate, 22 vertices, whose top face is one 64×64
// texture — binds it to `MAPICONS.MTD` (0x454913, `afCreateObj2`), scales it
// by the 12.12 identity 0x1000 (0x454922) and calls `afInitScanner` with that
// same archive (0x4549A0). Per frame the HUD's own draw (0x4582F0, reached
// from 0x457840 at 0x4578D9) packs two screen coordinates into the object's
// `+0x4C` and pushes it at the sort list; the library's dispatcher sees the
// high bits set, KEEPS the object out of the world (0x1000485C) and hands the
// packed pair to `DrawScanner` (0x10009810) at the end of the flush. So the
// plate is a smuggler's envelope, and nothing of it is ever on screen.
//
// What the library then draws is a top-down grid of the terrain, CENTRED ON
// THE CAMERA and TURNED WITH IT, with the icon quads stamped over it.
//
// Pure: positions and rules in, blips out. Where they land on the screen is
// the dashboard's (ui/battleMap.ts), and what the ground looks like is
// lib/game/mapRaster.ts.

import type { MapObject } from '../formats/pog'
import type { Player } from './game'

/**
 * How many screen pixels one world unit is worth, at a given scale.
 *
 * `DrawScanner` keeps `18884 / scale` in `[0x11B8A7C0]` (0x100201B0) and
 * divides every blip's world offset by it before multiplying by 480
 * (0x10020124), so the whole chain collapses to this.
 *
 * At the resting scale the world's 64 tiles of 512 come to 126 pixels, which
 * is the size of the thing: a small dial showing the WHOLE level, with blips
 * on it half as wide as a tile.
 */
export const scannerPixels = (scale: number): number => (scale * 480) / 18884

/** Resting size — `afSetScannerSizeSmall(0)`, `[0x1002C680]` (0x1000FFA0). */
export const SCANNER_SCALE = 0.151072
/**
 * …and while a shot is CHARGING, which is the one thing that resizes it: the
 * skill's own record `+0x14` turns on the power gauge and calls
 * `afSetScannerSizeSmall(1)` in the same breath (0x493CBD/0x493CC9), so the
 * map shrinks to leave the gauge room and grows back on release (0x493D74).
 */
export const SCANNER_SCALE_SMALL = 0.12106
/**
 * How fast it gets there: the library eases its live scale toward the wanted
 * one by this much A FRAME (0x10020110/0x10020118), against the engine's own
 * 60 Hz step — so the resize takes about half a second.
 */
export const SCANNER_EASE_PER_SECOND = 0.0015 * 60

/**
 * The entrance, frame by frame — the map slides UP into place over twenty
 * frames with a small bounce at the end.
 *
 * `0x4582F0` steps a counter at `HUD+0xC74` up to 20 while the scanner is
 * enabled and reads the table at 0x4D1958 BACKWARDS with it, taking
 * `100 - T[i]` as the progress and `200 - 2·progress` as the offset. These
 * twenty numbers are that progress, straight out of the table.
 *
 * The counter also runs back DOWN when the enable bit clears — but nothing in
 * the executable ever clears it. `HUD+0xC69` has exactly two writers in the
 * whole of `.text`, the constructor zeroing it (0x4547F4) and the HUD's setup
 * raising it (0x457490), so the slide-out is dead code in the shipped build
 * and the map is up from the first frame of a battle to the last.
 */
export const SCANNER_SLIDE = [0, 0, 5, 10, 13, 15, 22, 30, 35, 40, 70, 90, 95, 100, 97, 95, 98, 100, 100, 100]
/** How far below its place the map starts, in the 640×480 units the HUD is drawn in. */
export const SCANNER_SLIDE_FROM = 200

/**
 * Where the map's middle sits, as an offset from the middle of the SCREEN.
 *
 * The constructor works both out at 0x454597 and 0x4545AC — the screen's own
 * half-width less 0x6E and its half-height less 0x4B — and 0x458463 adds the
 * slide to the second before packing the pair.
 *
 * **The sign of y is the remake's reading and is worth knowing as such.** The
 * numbers themselves are read; which way the library counts its screen y is
 * not, because `DrawScanner`'s anchor arithmetic was not decoded. Taken as
 * y-UP, the pair lands the map left of centre and below it — the bottom left
 * that play remembers, with the entrance rising from off the bottom edge.
 * Taken the other way it would sit above centre and slide down onto the
 * battle, which is neither. Nudge it in the console like the rest of the
 * dashboard if play says otherwise.
 */
export const SCANNER_CENTRE = { x: -110, y: 75 }

/**
 * Where the camera stands and which way it looks, game space — what the map
 * is centred on and turned by.
 *
 * `heading` is `atan2(forward.x, forward.z)`, which is the map's own frame
 * and nothing else's: the picture puts that direction UP.
 */
export interface Eye {
  x: number
  z: number
  heading: number
}

/** The four markers in `MAPICONS.MTD` the library ever fetches. */
export type BlipIcon = 'iconpig' | 'iconhart' | 'iconpkup' | 'iconprop'

export interface Blip {
  /** Where it is, game space — the dashboard turns and scales it. */
  x: number
  z: number
  icon: BlipIcon
  /** The library paints every marker; the art is white (ui/hud.ts). */
  colour: [number, number, number]
}

/**
 * The eight blip colours, `[0x1002BE70]`, three dwords each.
 *
 * Indexed by the model's own team field, so this is the map's answer to
 * "whose pig is that" and it is not the same table the flags use.
 */
export const BLIP_COLOURS: readonly [number, number, number][] = [
  [0, 255, 0],
  [96, 255, 255],
  [0, 0, 255],
  [200, 200, 200],
  [255, 0, 0],
  [255, 255, 0],
  [60, 50, 40],
  [40, 70, 40]
]

/** What the acting pig flashes to, half the time (`v & 2` at 0x10003C0E). */
export const BLIP_WHITE: [number, number, number] = [255, 255, 255]

/**
 * How often the acting pig's blip changes colour: `Pig::Draw` picks its
 * marker value off bit 0x40 of the millisecond clock at `[0x520878]`
 * (0x440C54), which is one flip every 64 ms.
 */
export const BLINK_MS = 0x40

/**
 * **The espionage classes are not on the enemy's map.** `Pig::Draw` at
 * 0x440C67:
 *
 *     if (class >= 8 && class <= 10 && pig.team != game.turnTeam)
 *         model.marker = 0xFF          // 0x440C89 — the library drops it
 *
 * 8, 9 and 10 are SCOUT, SNIPER and SPY (`gtext 63 + class`), the same three
 * that carry PICK POCKET in the class kits at 0x4D02E0. `[game+0x4FC]` is the
 * team whose turn it is, written by the turn advance at 0x496630.
 *
 * **There is no range and there is no spotting.** The rule is the turn and
 * nothing else, which cuts both ways: your own scout is off your map for the
 * whole of the enemy's turn as surely as theirs is off yours. Checked against
 * every read of the class field and the whole of the library's blip path —
 * there is no distance anywhere on it, and no second writer of the marker
 * that could put a dropped pig back.
 *
 * The identical test guards the name-and-health marker over the pig's head
 * (0x459BA7), so a hidden pig loses both at once.
 */
export const HIDDEN_CLASSES = new Set([8, 9, 10])

/**
 * Which model names get a blip, and which marker each takes.
 *
 * The object constructor (0x45DE90) only registers one at all when the name
 * table at 0x4D9680 puts the model between START_OF_PICKUPS and DRUM — ids
 * 20..23 — and packs `(id - 20) << 8 | 4` into the object for the library to
 * switch on (0x10009ED5). Everything else on a map is `+0x48 = 0` and never
 * reaches the scanner: not a building, not a gun barrel, not one of the three
 * hundred and fifty scenery models, and pointedly not DRUM or DRUM2, which
 * sit one place past the window.
 *
 * CRATE1 and CRATE4 share both marker and colour, so the map cannot tell a
 * weapon crate from an empty one.
 */
export const BLIP_OBJECTS: Readonly<Record<string, { icon: BlipIcon; colour: [number, number, number] }>> = {
  CRATE1: { icon: 'iconpkup', colour: [169, 148, 63] },
  CRATE2: { icon: 'iconhart', colour: [255, 64, 121] },
  CRATE4: { icon: 'iconpkup', colour: [169, 148, 63] },
  PROPOINT: { icon: 'iconprop', colour: [219, 136, 53] }
}

/**
 * Every pig the map shows, for the team whose turn it is.
 *
 * `clock` is the battle's own millisecond clock — what the acting pig's
 * flashing is timed off.
 */
export function pigBlips(players: readonly Player[], acting: number, clock: number): Blip[] {
  const blips: Blip[] = []
  const flash = (clock & BLINK_MS) !== 0
  for (let team = 0; team < players.length; team++) {
    const own = team === acting
    for (const pig of players[team].pigs) {
      // A dead pig never reaches the sort list at all: `Pig::Draw` returns at
      // 0x440A44 on state 8 before it touches the model.
      if (pig.health <= 0) continue
      if (HIDDEN_CLASSES.has(pig.pigClass) && !own) continue
      const active = own && players[team].pigs[players[team].activePig] === pig
      blips.push({
        x: pig.position.x,
        z: pig.position.z,
        icon: 'iconpig',
        colour: active && flash ? BLIP_WHITE : (BLIP_COLOURS[team % BLIP_COLOURS.length] ?? BLIP_WHITE)
      })
    }
  }
  return blips
}

/**
 * Every crate and propoint the map shows. `taken` answers for a crate that
 * has already been collected — the object is gone from the world, so it is
 * gone from the map with it (lib/game/scenery.ts).
 */
export function objectBlips(objects: readonly MapObject[], taken: (id: number) => boolean): Blip[] {
  const blips: Blip[] = []
  for (const object of objects) {
    const marker = BLIP_OBJECTS[object.name]
    if (!marker || taken(object.id)) continue
    blips.push({ x: object.x, z: object.z, icon: marker.icon, colour: marker.colour })
  }
  return blips
}
