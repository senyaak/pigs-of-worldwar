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
// What the library then draws is a square of the whole level under a camera
// tilted 28.125° above it, TURNED by the view's yaw — and not centred on the
// camera, whose position cancels out of the arithmetic exactly — with the icon
// quads stamped over it and nothing clipped.
//
// Pure: positions and rules in, blips out. Where they land on the screen is
// the dashboard's (ui/battleMap.ts), and what the ground looks like is
// lib/game/mapRaster.ts.

import { fromExeFrames } from './ballistics'
import { skinOf } from './nations'
import type { MapObject } from '../formats/pog'
import type { Player } from './game'

/** Resting size — `afSetScannerSizeSmall(0)`, `[0x1002C680]` (0x1000FFA0). */
export const SCANNER_SCALE = 0.151072
/**
 * …and the SMALL size, which is **read and deliberately NOT APPLIED**.
 *
 * Two things in the exe ask for `afSetScannerSizeSmall(1)`: a shot charging
 * (the skill's record `+0x14` turns on the power gauge and shrinks the map in
 * the same breath, 0x493CBD/0x493CC9, grown back at 0x493D74) and the MAP VIEW
 * camera, which the pause enters (`lib/game/mapView.ts`).
 *
 * `[play]`, 2026-08-19, on seeing it move: **"миникарта не должна отдаляться
 * вообще — у неё всегда 1 размер."** That overrides the reading, which is the
 * standing rule for how this remake settles a look. The number stays here
 * because it IS the library's and because a note that says only "we do not do
 * this" invites somebody to put it back without knowing it was a decision.
 */
export const SCANNER_SCALE_SMALL = 0.12106
/**
 * How fast it WOULD get there: the library eases its live scale toward the
 * wanted one by this much a frame (0x10020110/0x10020118) against the engine's
 * 60 Hz step, so the resize takes about half a second. Unused while the size
 * is fixed — see `SCANNER_SCALE_SMALL`.
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
 * Where the map's middle sits: **110 in from the LEFT edge and 75 up from the
 * BOTTOM one** — the bottom-left corner, and now read rather than inferred.
 *
 * The exe packs `x = screenW/2 - 0x6E` and `y = screenH/2 - 0x4B + slide`
 * (0x454597 / 0x4545AC, packed at 0x458477); the library then does
 *
 *     centreX = halfW - x + shrink        (dll 0x10009B43)
 *     centreY = halfH + y                 (dll 0x10009D25)
 *
 * so the halves cancel and what is left is 110 from the left and
 * `screenH - 75` from the top. The library writes `D3DFVF_XYZRHW` vertices
 * straight into `DrawPrimitive`, so its y grows DOWNWARD — which settles the
 * sign the other way from the first guess here: **the slide is ADDED, the
 * widget starts 200 below its place, off the bottom of the screen, and rises
 * into it.**
 */
export const SCANNER_CENTRE = { left: 110, fromBottom: 75 }

/**
 * How far the widget WOULD slide left as it shrinks — unused with the size
 * fixed, and zero at the resting scale in any case.
 *
 * How far the widget slides LEFT as it shrinks — `(0.151072 - scale) * -500`
 * (dll 0x10009A9E..0x10009B43), which is 15 pixels at the small scale.
 *
 * It is compensation, not decoration: the board's own half-width changes by
 * `480 * (0.151072 - 0.121060)` = 14.4, so the two nearly cancel and the
 * board's LEFT edge stays put while it shrinks.
 */
export const scannerShrink = (scale: number): number => (SCANNER_SCALE - scale) * -500

/**
 * The board's TILT — and it is a real camera, not a flattened picture.
 *
 * The library builds an ordinary Euler basis with the angles `(0, 3776, yaw)`
 * (dll 0x100099BF..0x10009B34) against a full turn of 4096, so 3776 is −320
 * units = **−28.125°**: the scanner looks that far DOWN from the horizontal,
 * not straight down. Its two trig values are the whole of the tilt.
 */
export const SCANNER_TILT_TURNS = 3776 / 4096
export const TILT_COS = Math.cos(SCANNER_TILT_TURNS * Math.PI * 2)
export const TILT_SIN = Math.sin(SCANNER_TILT_TURNS * Math.PI * 2)

/** What the projection multiplies by — the library's own 480 (dll 0x10020124). */
export const SCANNER_PROJECT = 480

/**
 * How far out the board's own edge sits, in world units.
 *
 * A blip's place on the board is `world * scale / 18884` (dll 0x10009F8B
 * against `[0x11B8A7C0] = 18884 / scale`), and the board quad spans ±scale in
 * that same space — so its rim is the world at ±18884.
 *
 * **The map it carries only reaches ±16384**, so the picture is drawn
 * `37768 / 32256` = 1.171× too big for the blips standing on it. That is in
 * the shipped library, not a misread: both paths were checked to share one
 * matrix and one anchor. Kept, because it is what the original looks like.
 */
export const SCANNER_REACH = 18884

/**
 * Where a point of the board lands, relative to the widget's middle.
 *
 * `px`/`py` are the board's own square, ±scale across, and they are the world
 * divided by `SCANNER_REACH`: `px` along world x, `py` along world z. `yaw` is
 * the camera's, and the library's own convention — `(cos yaw, sin yaw)` is the
 * direction that comes out pointing straight UP the widget.
 *
 * The vertical is `TILT_SIN` (negative) times the forward axis, so far is up
 * the screen, and the `W` divide is a real ground-plane recession of about
 * ±15% rather than an even squash.
 */
export function projectScanner(px: number, py: number, yaw: number): { x: number; y: number } {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const a = sy * px - cy * py
  const b = cy * px + sy * py
  const w = 1 / (1 + TILT_COS * b)
  return { x: SCANNER_PROJECT * a * w, y: SCANNER_PROJECT * TILT_SIN * b * w }
}

/**
 * **The board does NOT move with the camera.** The library subtracts the
 * camera's position and adds it straight back (dll `[esp+68h]`), so it
 * cancels exactly — the whole level is drawn, always centred on the widget,
 * and only TURNED. Verified by re-running the arithmetic with the camera
 * thrown far off the map: the same screen coordinates come out.
 *
 * That is self-consistent, since the world is itself centred on the origin,
 * and it is why nothing is ever clipped: the board is a square that sweeps its
 * corners round as the player turns, and it is meant to be seen doing it.
 */
export const SCANNER_FOLLOWS_CAMERA = false

/**
 * Which way the camera looks — the only thing the board takes from it, since
 * it does not follow the camera's POSITION (`SCANNER_FOLLOWS_CAMERA`).
 *
 * `heading` is `atan2(forward.z, forward.x)`, which is the library's own yaw
 * convention and nothing else's: `(cos yaw, sin yaw)` in world (x, z) is the
 * direction the picture puts UP.
 *
 * `x`/`z` are carried anyway, because the blips are drawn relative to the same
 * origin the board is and a debug hook wants to see where the eye was.
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
 * The blip colours, `[0x1002BE70]`, three dwords each — **SIX of them, indexed
 * by the SKIN** (lib/game/nations.ts), which is what the model's own `+0x04`
 * field holds and what the library reads at dll 0x100049BC.
 *
 * There were eight here and the last two were a misread: 0x1002BEB8, which
 * follows this table, is the ground palette the board is painted from
 * (lib/game/mapRaster.ts), and its first two rows had been swept in. There is
 * no seventh entry and so no Lard colour — the exe's own copy of this table
 * (0x4C2E78, read by `Pig::Draw` at 0x440BD8) is six entries too, and a
 * seventh index would pull the padding after it.
 *
 * The two copies agree hue for hue; the library's is brighter for British
 * (255 against 128 green) and for German (200 against 128 grey).
 */
export const BLIP_COLOURS: readonly [number, number, number][] = [
  [0, 255, 0],
  [96, 255, 255],
  [0, 0, 255],
  [200, 200, 200],
  [255, 0, 0],
  [255, 255, 0]
]

/** What the acting pig flashes to, half the time (`v & 2` at 0x10003C0E). */
export const BLIP_WHITE: [number, number, number] = [255, 255, 255]

/**
 * How long the flashing blip holds each colour.
 *
 * **It is the pig the CAMERA is on that flashes**, not the pig whose turn it
 * is: `Pig::Draw` asks at 0x440C24 whether this pig is `cam+0x54` (or
 * `cam+0xB0` in camera mode 2) and only then reads the counter. The two are
 * the same thing here, because the chase follows the acting pig — worth
 * knowing the day something else takes the camera.
 *
 * The BIT is read: `Pig::Draw` picks the marker value off **bit 0x40** of the
 * counter at `[0x520878]` (0x440C48), so the period is 64 of whatever that
 * counter counts and the flip is exactly halfway.
 *
 * **What that counter counts is NOT established, and the first reading of it
 * was wrong.** It was taken for a millisecond clock, which would make the
 * blink 64 ms — about eight flashes a second — and play says plainly that it
 * is much slower than that. Chasing the writer does not settle it either: the
 * one clean store, 0x47FB1F, takes its value from 0x48CEF0, and that function
 * returns an element of an array on the acting TEAM rather than a time. Its
 * readers argue both ways — several difference it against 100, 150 and 300,
 * which read as milliseconds, while 0x45A612 takes `(c >> 4) & 3` as a
 * four-phase animation, which at 16 ms a phase would be a 60 Hz flicker and at
 * 16 frames is half a second a phase.
 *
 * So: the exe's own bit, counted in the exe's own frames, and `[play]` for the
 * unit. Nudge the period here if it still reads wrong.
 */
export const BLINK_FRAMES = 0x40
/** …in seconds, which is what a drawer has. */
export const BLINK_SECONDS = fromExeFrames(BLINK_FRAMES)

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
 * `clock` is seconds since the battle opened — what the acting pig's flashing
 * is timed off.
 */
export function pigBlips(players: readonly Player[], acting: number, clock: number): Blip[] {
  const blips: Blip[] = []
  // The exe's own halfway flip, on a clock this side counts in seconds.
  const flash = Math.floor(clock / BLINK_SECONDS) % 2 === 1
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
        // The side's NATION picks the colour, through the skin — not its
        // position in the list. Team Lard has no colour of its own in either
        // table, so it falls back to white rather than reading past the end.
        colour: active && flash ? BLIP_WHITE : (BLIP_COLOURS[skinOf(players[team].nation)] ?? BLIP_WHITE)
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
