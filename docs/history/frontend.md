# The frontend

The menu screens: the machine, what moves on it and what it sounds like.

History, not instructions: what was found, what it cost and why the code is
the shape it is. Sections are in the order they were written. The rules a
session must follow live in [CLAUDE.md](../../CLAUDE.md); the
reverse-engineering reads live in the disasm repo.

## THE MAIN MENU IS ALL READ NOW, and three of our own ideas were wrong

Play, opening the session: the menu has a lot wrong with it, go and read the
screen out of the binary instead of guessing — every screen, starting with
this one. So screen 1 was walked end to end: its enter arm, its update arm,
its leave arm, its draw arm and the function that owns the selection
(`frontend/notes.md` carries all of it, function by function). What came back
changed six things here, and three of them were ideas this repo had invented
and then written up as if they were the game's.

**The needle was ours by accident, and it was right.** This file used to say
the dial's twelve frames were spread over the rows by the remake because
"nothing found so far moves it". The thing that moves it is `0x427C90`, the
handler that runs when the lit row changes: it aims widget 4 at
`4*row`, less one past four — frames 0, 4, 7 and 11 — and the widget walks
there ONE frame a tick. Spreading twelve frames over four rows gives exactly
those four back, so the picture never changed; what changed is that the sweep
is now a frame walk on the game's own clock instead of an eased interpolation
over a made-up third of a second, and that it CLICKS when it lands
(`Indu006`, half volume, played by the dial's builder on the step that
reaches the frame it was aimed at).

**The cogs do not turn.** We span them at twelve frames a second. Both cog
widgets are built on frame 0 and no call site on screen 1 ever asks either for
another one, so `cog0` and `cogb00` are still pictures. What is really turning
in the memory of it is the plates; what is really running is the SOUND —
`cog.wav` is a 32-millisecond tooth, and the update arm plays it once a tick,
at a fifth volume, the whole time the screen is driving in or out. Ten of them
as it lands is a ratchet.

**Nothing gates a press.** The remake refused to move the light for 0.3 s
after a move and played `click5` on every one. The original's up and down arms
are two lines each — decrement or increment, wrap on the item count, tell the
selection handler — with no travel to wait out and no sound of their own. The
only click a player hears when they move is the needle arriving.

**The lamp blinks on a script, and the script is in the data.** Animation id
1002 out of the table at 0x4C0A78: `light2` for one tick, `light3` for ten,
`light2` for one, `light1` for five, looping — seventeen ticks, most of them
on the brightest. Every other row is WALKED back down to `light1` rather than
snapped, so a lamp fades as the light leaves it.

**The tracks were the last piece placed by eye, and they hang off the screen
on purpose.** Both are blitted through the stretching blitter, 64 wide by 638
tall out of 64×480 art, at x -34 and 681 on a 640-wide screen — and the right
one's WIDTH is negated, which the flush reads as a mirror. That is why reading
them literally had looked wrong: about thirty pixels of one shows and
twenty-three of the other, and the flush's own clipper trims the rest. Nailing
that down settled a second question at the same time, one this repo had argued
from the plate and the lamp abutting rather than read: the clipper moves a
blit's source rect by exactly what it moves the destination, which is only
right if **x/y is the top left corner**.

**A screen leaves as deliberately as it arrives, and we had no exit at all.**
Choosing a bar used to swap the view on the next microtask. The original runs
a leave arm until it says it is done: the plates turn the OTHER way (put back
on frame 0, walked to 3), the machine climbs out of the top of the screen
under constant acceleration, and only once it is gone do the tracks walk out
sideways. About half a second, and the same cog ratchet under it.

And one piece of ordering that is easy to miss and reads as a bug when it is
missing: **the tracks slide in BEFORE the screen falls.** While their offset
is non-zero the update arm does nothing else at all, so for the first four
ticks the racks are the only thing on the backdrop.

### What it cost, and what is still open

The motion is three integer routines and they are transcribed rather than
approximated (`ui/springs.ts`): a damped spring that overshoots because the
exe does not clamp its step, an accelerating launcher with no pull in it at
all, and a plain clamped walk. The spring reproduces the ten-frame arrival the
disassembly predicts, value for value, and the tracks come in in four ticks.

`ui/frames.ts` grew the second of the two ways a widget gets a new frame — the
SCRIPT — and `ui/drive.ts` replaced `entrance.ts`, which only knew how to
arrive.

Still not read, and so still ours: where the label TEXT lands (the words go
through a text-object printer with a per-screen box in four `.data` tables),
and what the two per-frame numbers the plate widget writes do to it — they are
non-zero exactly on the mid-turn frames, so the original is skewing its
letters as the plate goes over, where we simply stop drawing them.
