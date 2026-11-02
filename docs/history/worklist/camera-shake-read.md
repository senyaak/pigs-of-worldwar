# THE CAMERA SHAKE — read 2026-08-25, NOT BUILT

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

The one thing the original's camera does about an explosion, and the remake
does none of it: `Camera::Shake` (0x4A0520) + the jitter in `Camera::Update`
(0x49FEA0), called from the blast at 0x43AE06 with
`amp = (10000 − min(d²/26844, 10000)) / 100`, `Shake(max(amp/2, 1), 2)` —
quadratic falloff to nothing at 16384 units, and only for blast kinds 0x0C and
0x0D. Everything else play asked about that camera (a minimum distance to the
subject, a dodge when a body comes at the lens) does NOT exist in the exe; the
whole search is in docs/history/view.md.
