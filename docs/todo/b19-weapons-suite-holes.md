# B19. THE WEAPONS SUITE — built 2026-09-01, and the holes it found

Play, straight after the level-2 work: "значит можно писать тесты на оружия? у
нас вообще есть такие? я б как отдельный сьют хотел — и каждый класс отдельный
подсьют — и отдельно то чего в классах нет вообще". Built as asked:
`unit/weapons/`, its own Playwright project (`npm run test:weapons`), one
`test.describe` per class in a file per CAREER, and `unclaimed.spec.ts` for the
thirty-one skills no kit carries. 81 tests. `docs/testing.md` has the shape and
`unit/weapons/kit.ts` the argument for driving the REAL `createAttack`.

`unit/kits.spec.ts` is gone into it — three of its four tests are now made per
class, and the fourth (a battle arming every pig from its own class) moved
whole.

**What the suite is FOR** is one assertion made seventeen times: every skill in
this class's kit answers the fire key. The failure is silent — no round, no
turn, no sound — and the map of it now reads:

| classes | inert skills in the kit |
| --- | --- |
| 0 GRUNT … 2 BOMBARDIER, 5–13 | none |
| 3 PYROTECH | 31 |
| 4 COMMANDO | 31, 50 |
| 14 HERO | 31, 50, 53, 57, 58 |
| 15, 16 ACE | 31, 50, 53, 56, 57, 58, 59 |

So **every class a campaign can reach below the COMMANDO is finished**, and
everything unbuilt lives from the PYROTECH up.

**And the suite found one thing nobody had asked**: a CRATE reaches further
than any kit. `skillFromCrate` (0x4D9DC8) can hand over **sixteen** skills the
fire key ignores — 0, 16, 32, 34, the artillery 39–44, the emplaced 45–49, and
31 — of which only 31 is also in a kit. Whether a shipped map actually PLACES
such a crate is a measurement over the installation and belongs in `e2e/`; the
table says it can, and `unclaimed.spec.ts` pins the list by name.

Two smaller ones, both written down and neither built:

- **38 FIRECRACKER's two tables disagree.** `weaponLayer` puts it in the
  `charge` family through `isPlanted`, so it would get the plant control set —
  but `attack.ts` opens that branch on `isLobbed || isMine` and 38 is neither.
  Latent: no kit and no crate byte reaches it.
- **`careerOf`/`stepOf` have no row for 15 or 16** — the exe's table at
  0x4D29C0 stops at HERO — so both answer 'heavy', step 0, by fallback. A badge
  drawn off that would be WRONG rather than missing.

**What the coverage survey turned up beside it** (a read of every spec in
`unit/` and `e2e/` against the 36 carried skills), worth picking off in that
order:

- **six IMPLEMENTED guns have no assertion at all** — 8 rifle burst, 9 machine
  gun, 10 heavy m-gun, 13 super shotgun, 14 flamethrower, 18 tranquilliser
  dart. They have rows and they fire; nothing pins the numbers.
- **four melee weapons are only ever read, never swung** — 1 trotter, 2 knife,
  4 sword, 5 cattle prod have their rows asserted and no test actually strikes
  with them. 6 PISTOL is one point-blank fixture.
- **weapon SOUND is asserted for exactly one skill**, 29 (`e2e/002/bazooka`).
  `BARREL_SOUND[6]` and the new `[28]` are unpinned.
- **the AI prices only 3, 7, 11, 19 and 37.** Nothing prices a gas, a mine, a
  heal, a steal or a mortar — and the mortar's is the pitch bisection this
  session added, which is the newest of them.
