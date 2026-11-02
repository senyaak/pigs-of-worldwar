# SPLIT THE HOT MODULES — before the fleet builds in parallel

Almost every change to the battle touches the same few files, and two fleet
PRs editing one of them conflict every time. Measured 2026-11-02 (lines, and
commits touching the file since 2026-08-01):

| module | lines | commits |
| - | - | - |
| `src/lib/game/battle.ts` | 2421 | 96 |
| `src/renderer/src/three/battle.ts` | 1449 | 182 |
| `src/renderer/src/ui/battle.ts` | 1197 | 83 |
| `src/renderer/src/ui/hud.ts` | 1048 | 53 |
| `src/renderer/src/input/controller.ts` | 569 | 90 |

`lib/game/battle.ts` was taken apart once at 1365 lines and has grown back
past that. The rule is CLAUDE.md's: a module that grows a second concern is
split by concern, not trimmed.

## The work

One issue per module, chained rather than parallel, each a pure move: no
behaviour changes, the whole unit suite and the battle's e2e phase green before
and after. `lib/game/battle.ts` first, because every engine rule lands in it;
what it should keep is "one frame's order of events" and nothing that frame
calls into.

Until a module is split, the planner does not put two open issues on it side
by side.
