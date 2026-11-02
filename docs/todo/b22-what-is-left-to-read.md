# B22. WHAT IS LEFT TO READ — sized, 2026-09-01

Play: "дальше есть что читать?" Section D below is mostly closed and what
survives there is WIRING. The real reading agenda is the fire table, and it has
now been measured rather than guessed — every one of its 37 arms sized first
instruction to next (`weapons/fire.md`, the 2026-09-01 section). Two things
fell out of making the list:

- **23 CONFUSION GAS and 57 SPECIAL OPS have no arm at all.** Their entries
  point straight at 0x47CD88, the function's shared TAIL, which 44 other jumps
  land in. **This settles a `[CHECK — remake]` we have carried since the gas
  landed**: 23's row really is the poison canister's (id 416), and the PC exe
  never fires it. The sharing is a fact about the DATA. Our stand-in burst for
  23 is therefore a remake INVENTION rather than a port accident to preserve —
  play's call whether it stays.
- ~~**The artillery is not a subsystem to read, it is 203 bytes.** 39/41/42/43/44
  share one arm and 40 has its own of the same size. "Nothing delivers a
  called-in shell" (B16) is a BUILD gap; the read is an hour.~~ **READ
  2026-09-15 — and there is no called-in shell to deliver.** Skills 39..44 are
  the six shells of the BIG_GUN emplacement (LONG RANGE ×3, MINE, GAS, FIRE
  RAIN, 1000 LBS, SHOCK ×1 each), held by the BUILDING and fired from inside it
  exactly like the pillbox's two — `weapons/artillery.md`, and the correction
  under B16 below.

**The cheapest unread block, and the one that finishes the top of the tree**:
53 MEDIC, 56 SHOCKWAVE, 58 AIR STRIKE, 59 CLUSTER AIR STRIKE come to **323
bytes and about ninety instructions between them** — and 57, the fifth of that
set, does not exist. Those five are what makes a HERO's and an ACE's kit half
dead (B18).

~~Then, by size: 31/32 AIRBURST (188, and already read from the destructor end —
this is only the fire arm), 30 GRENADE LAUNCHER (188), 45/46 the pillbox's two
(203/186), 15 ROCKET (244), 16 GUIDED MISSILE (246), 34 HOMING MISSILE (296),
47/48/49 the vehicle's three (291), 50 JETPACK (412), 60 VEHICLE IN-OUT (621).~~
**ALL READ — the fire table is finished 2026-09-15** (`weapons/fire.md`'s
sized list carries a pointer per row). What the last pass found, for the
build list: 30 is a bazooka that throws a grenade (`fire.md`); 15 ROCKET is a
fifty-point contact bullet with mode 1; **16 GUIDED MISSILE is FLOWN BY THE
PAD** for thirty seconds at 5.6° a frame with mode 4 on it; **34 HOMING
MISSILE seeks a POINT placed through a targeting view** (the aim press opens
camera mode 9 and `[game+0x51A]`, the fire press places the target, snapped
onto a pig within 1024, the next press fires) and bursts within 512 of it —
`missiles.md`, with the hand-detonate rule (row +0x1D) that also settles which
second press does what; **50 JETPACK is a sixty-frame fixed-line ride** that
explodes for twenty points and ends the turn when it runs dry, or drops the
pilot under a PARACHUTE when the fire button is pressed — `jetpack.md`.

~~**And a standing warning after B21**: two camera arms were decoded from the
MIDDLE and both are unbuilt — 0x0A (34, 50 JETPACK) and mode 2 (51 SUICIDE).
Re-open them from the top before building on either.~~ Both re-opened from
the top 2026-09-15: 0x0A in `missiles.md`, mode 2 in `fire.md`. Same still
goes for anything else in the notes whose section starts mid-function.

Smaller threads this session left, none blocking: the per-turn pass's own gate
`[[0x537f24]+0x510]` and the `0x47D080(0)` at its tail (B20); `0x49F6D0(0xFA0)`
and the `[[pig+0x194]+0x18]` counter in the suicide arm; and where a no-gauge
weapon's charge of 1 becomes 0xFFF, which both the guns and now the mortar
stand on.
