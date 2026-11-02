# B21. THE GRENADE CAMERA LOOKED STRAIGHT AT THE GRENADE — fixed 2026-09-01

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play: "вроде у нас щас 1 граната в центре экрана — а в оригинале по другому."
It was a lock, and the exe has a lagged AIM POINT instead — the head of mode
0x0D, which had never been read because the orbit was found in the middle of
the same arm. `weapons/fire.md` has the read, `docs/history/view.md` the
session, and `e2e/002/grenade-aim.spec.ts` measures it: 0.4° off the flight
before, 9.0° after, run both ways round.

**The lesson is one this repo has already written down twice and just paid for
a third time**: an arm is not read until its own last instruction — and, it
turns out, not until its own FIRST one either. Everything decoded from the
middle of a handler should be treated as half a reading. Two other camera modes
were decoded the same way and are worth re-opening from the top before anything
is built on them: **0x0A** (34, 50 JETPACK) and **mode 2** (51 SUICIDE), both
still unbuilt.
