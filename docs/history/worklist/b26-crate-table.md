# B26. THE CRATE TABLE WAS 46 ENTRIES LONG AND IS 72 — fixed 2026-09-01

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

Play, in one line, against a spec of ours that had just asserted the opposite:
"это в ящиках находится". `CRATE_SKILL` (exe 0x4D9DC8) was short by 26 entries,
so **every crate byte from 46 up handed over NOTHING**.

Measured over the 61 shipped POGs, what those bytes really are:

| byte | skill | maps |
| - | - | - |
| 51 | **50 JETPACK** | **21** |
| 58 | 58 AIR STRIKE | 11 |
| 59 | 59 CLUSTER AIR STRIKE | 3 |
| 67 | **38 SUPER TNT** | 4 — DESVAL, GUNS, SEPIA1, TWIN |
| 70 | 27 SHRAPNEL GRENADE | 1 — RIDGE |

**Follow-on, and it is the real work this creates**: four of those five are
UNBUILT skills (50, 58, 59 — and 27 is fine). So a crate on twenty-one maps now
hands over a JETPACK that does nothing when fired. It is not a regression — an
empty crate was worse — but it moves 50 JETPACK and 58/59 from "the HERO's kit
only" to "a third of the campaign", which is a much better reason to build
them. B23 priced 58/59 at 44 and 47 bytes.

Not read: what indices 46..50 mean. They hand over 68..72, past the 67 skills
entirely, and no shipped map places one.
