# The menus

- `[exe]` **The menu's LAYOUT is the exe's, bar two pieces.** The exe computes
  its screen coordinates in the draw code rather than storing them, and screen
  1's arm has been read blit by blit (`frontend/notes.md`), so `LAYOUT` in
  `ui/barScreen.ts` carries the original's numbers with the address each came
  from: the machine at (25, 0), the title at (261, 112), the column at 284
  stepping 40, the lamps flush to its right at 493, the dial at (105, 192), a
  cog at (9, 192) and `cogb` — 96×208, TWO cogs in one sprite — at (539, 160).
  **The frontend widens itself by a global 50 and does it two ways**: a plate
  repeats a band of its own art once, the machine repeats a two-pixel column
  twenty-five times, so the grille GROWS with the column rather than sitting
  behind it. Getting that wrong is what had our plates over the wrong recesses,
  and the machine 128 pixels too low.

  **A widget's frame is a WALK, and the flip is the exe's own.** The original
  never plays a clip: a widget holds one frame, something asks for another,
  and a per-tick pass steps it there one frame at a time, rebuilding the
  sprite each step (`ui/frames.ts`; decoded as 0x512C18 / 0x423E10 / 0x41FEC0
  / 0x41F110). The plates and the title are ONE widget: built on frame 2,
  asked for frame 6 — which wraps back to the first of six — one frame per
  engine tick, and the request is guarded by the widget not already walking
  AND by the entrance having climbed past -50. So the flip lands as the
  machine finishes driving in. Every number there is read; the remake had put
  the flip at that moment already, from play's word alone, and this replaced
  a 0.3-second timer with the mechanism.

  **The dial's needle points at the lit row**, and that is the exe's: the
  selection handler (0x427C90) aims widget 4 at frames 0, 4, 7 and 11 for the
  four rows, and the widget walks there one frame a tick. Spreading twelve
  frames evenly over the rows gives those four back exactly, which is what
  `needleFrame` does.

  **NOTHING on this screen animates by itself.** Three widgets move and each
  moves because something asked it to: the plates and title turning over, the
  needle, and the lit row's lamp on script 1002 (`light2` 1 tick, `light3`
  10, `light2` 1, `light1` 5, looping). **The cogs are STILL PICTURES** — both
  are built on frame 0 and no call site asks for another. What turns is the
  plates; what is heard is `cog.wav`, one 32 ms tooth a tick, while the screen
  drives in or out.

  **The WORDS have boxes of their own, and the whole frontend is CHARS2.**
  The frontend builds one text object out of CHARS2/L/D and writes every
  screen with it, title included — only screen 3 gets a CHARS3 — and which of
  the three shades a line wears is the MEAN of the colour it is asked for
  (over 100 light, under 50 dark). A line is centred across a box out of
  `.data`, and the boxes ride the entrance: `MENU_TEXT` in `ui/barScreen.ts`
  carries screen 1's, in pixels. **The rows' boxes do NOT carry the plates'
  stagger** — the words stay put and the plate moves under them. And the two
  per-frame numbers the plate widget writes are the words riding the turn: a
  letter is cropped to `100 - |v|` per cent of its height and dropped by what
  it lost, the rows and the title on different tables.

  **A press is never gated and the light WRAPS.** The up and down arms are two
  lines each with no travel to wait out and no click of their own — the click
  a player hears on a move is the needle ARRIVING (`Indu006` at half volume).

  **A screen leaves the way it arrives.** Choosing a bar starts the leave arm,
  not a view swap: the plates turn back the other way (frame 0, walked to 3),
  the machine climbs out of the top under constant acceleration, and only once
  it is gone do the tracks walk out sideways. Same for the arrival, in the
  other order — **the tracks slide in BEFORE the screen falls**, and while
  they are moving the update arm does nothing else at all. `ui/drive.ts`, on
  the three integer routines in `ui/springs.ts`.

  **There is NO carriage on the menu.** The remake ran one — `selcog`, the
  arrow with a cog above and below — up and down the column, and play threw
  it out on sight. The disassembly had said the same first: screen 1 never
  loads `selcog`. Exactly one loader arm does, the one serving screen ids 2,
  3, 4, 11 and 12, which loads `name0..5` beside it — the SELECT TEAM / ENTER
  YOUR NAME family, where it goes when those screens are built. `select.mgl`
  is left out on the same evidence. The lit bar is told apart by its lighter
  letters and by its lamp, which is the original's own way.

  **The TRACKS are read too, and they hang off the screen on purpose**: 64
  wide by 638 tall out of 64×480 art, at x -34 and 681 of a 640-wide screen,
  the right one's WIDTH negated so it is drawn mirrored, and the flush clips
  the rest. Reading them literally had looked wrong; it is not. The same
  reading settles the blitter's convention, which this file used to argue from
  the plate and the lamp abutting: the clipper moves a blit's source rect by
  exactly what it moves the destination, so **x/y is the TOP LEFT corner**.

- `[play]` **The MOUSE drives every menu screen, and the lit row is told
  apart by its LETTERS.** The original is keyboard and pad (it ships
  `nomouse.com`) and its LOAD screen never recolours a label — the plate
  behind it blinks instead. Both are overridden: `ui/mouseRows.ts` is the one
  hit test (un-letterbox the canvas, hit the rows the screen is drawing with,
  walk the light one row a tick so nothing jumps — and a CLICK both SEEDS the
  hover and QUEUES: the light walks to the clicked row and the choice lands
  when it arrives, `clicked()`, because a screen entered under a parked
  pointer sees no `mousemove` and a click lost on an unlit row reads as a
  dead screen), and a lit row is written in
  the light shade wherever a row is written at all. A LIST screen chooses
  ONLY through that queue in its `advance` — never in `onClick`, or a lit
  row would fire twice — a row's hit band runs to the NEXT row, not to the
  letters' own height (art taller than the pitch had START swallowing REPLAY
  MISSIONS whole), and the settled-screen latch fires from `'arriving'`
  ALONE: `phase = 'here'` unguarded at the tick's end undoes a click-chosen
  leave in the very frame it began, because the click is chosen inside the
  tick now. A screen the pointer
  cannot drive reads as broken however faithful it is. **And the rule covers
  everything ADDED**: a new screen, overlay or interactive element ships with
  its `trackRows` boxes in the same change, or it is not finished — the whole
  debt was swept once (2026-08-26, "все добавляемые элементы мышкой тоже
  кликались") and must not accrue again. A key painted into backdrop ART
  still gets an invisible box over the painted words (the debrief's bar); an
  any-key screen takes a click anywhere as the any-key.
- `[play]` **ONE PLAYER has three rows, and the third is the owner's.** Asked
  for on 2026-11-02: "a third bar under NEW GAME and LOAD GAME" that opens the
  proving ground, so testing does not start with `pow.swapMap('PROVING')`, and
  "The bar reads **PROVING GROUND**". The exe's screen 14 has two rows
  (`frontend/menus.js`, record 14, kind 1) and `fetext` has no such string, so
  this is not a reading, and **a later pass must not "correct" the menu back to
  two rows**. Choosing it needs no campaign save and writes none; leaving that
  battle lands on the main menu, as a skirmish does (`ui/onePlayer.ts`,
  [proving-ground.md](proving-ground.md)).
- `[deliberate]` **A name is judged and kept TRIMMED.** The exe's ENTER tests
  the buffer's first byte alone (0x42AF50), so a team called one SPACE passes;
  `press` in `lib/game/nameEntry.ts` trims before it refuses and hands the
  trimmed name over. Play's call.
- `[deliberate]` **The mouse works the menu, and the original's does not.**
  Hovering lights a bar, clicking chooses it. The original is keyboard and pad
  only (it even ships `nomouse.com`); this is the remake's convenience, and so
  is F1 for the asset browsers, which are not a screen the original has.
