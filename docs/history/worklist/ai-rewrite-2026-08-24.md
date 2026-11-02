# P0. THE AI — **REWRITTEN 2026-08-24 night, PLAYED AND CORRECTED 2026-08-25. PLAY IT AGAIN.**

*A closed entry of the old work list, moved here whole on 2026-11-02. What is still open from it lives in [docs/todo.md](../../todo.md).*

**Written 2026-08-24 evening straight after a play session; answered the
same night.** Play's words, and they were a verdict on the day's work: "ии
полностью сломан, и ты делаешь не так, как я сказал." What follows is what
was reported, what it turned out to be, and what is left — which is a play
session and two named gaps, nothing else.

## The measurement that settles it

`e2e/002/machine-mission.spec.ts` plays mission 1 machine against machine in
plain Node. **It was RED on master and nobody had run it**: the brain could
not reach a verdict inside 54 000 frames — 3600 simulated seconds, both
squads still standing, 40 s of wall clock spent on it. After the rewrite:

```
verdict at ~721s of battle; kills=5; fired=27; survivors=1v0     (6.0s wall)
```

So the report was not a matter of taste. Run that spec before and after
anything that touches the brain; it is the cheapest honest reading there is.

## What play watched, and what each one was

- **"Второй свин прошёл мимо кучи свиней за аптечкой"**, then across half
  the map for a second one. — `priceKit` still ELECTED crates while the
  doc beside it said a pickup and a blow are not alternatives. A crate is
  now an errand on the way (`crateErrand`) or the whole job when there is
  no blow to be had (`crateFallback`), and it never wins an election.
- **"1 шажочек вперёд, 1 поворот, и так зациклено"** — the route was
  rebuilt from the pig's new spot every mull, and the string-pull's first
  leg out of a fresh start is often one cell. The log has it plainly: DEN
  at 1920,8712 ordered to 2048,8704, which is 128 units. A route is decided
  ONCE now and walked corner to corner.
- **"Думает каждые несколько секунд… выглядит как дебил"** — the whole
  election ran on every corner, and a tie-break flipping as the distances
  shifted is GINGER going 11520,2816 → 11776,-1408 → back, three decisions
  running. `lib/game/plan.ts` decides the turn whole and DROPS the plan
  rather than editing it: the target dies, the kit changes, the legs are
  refused.
- **The lags** — fifteen `priceKit` runs and ~21 A\* searches a turn became
  one plan and ONE Dijkstra flood (`lib/game/pathfind.ts`, `flood`).
- **"Он не обходит свина, а толкается в него"** — the squad is in the
  route's world now (`RouteAsk.bodies`). **Own pigs only**: a foe is what
  the walk is aimed AT, and a body you mean to reach cannot be a wall.

## And the two corrections that were the real work

- **THE FIRING MARK IS SEARCHED FOR** (`evaluate.ts`, `standFor`). "Точка
  стрельбы лежит по дороге к цели — это неверно; препятствия и вода могут
  исказить это. Надо идти от обратного." Rings of marks round the target at
  the weapon's own reach, kept if dry, if the legs reach them and if the
  shot from them is clear; cheapest walk wins, and null means this weapon
  cannot be brought to bear on this pig at all. A lob's parabola is solved
  FROM the mark, so the landing, the water under it and the blast over the
  squad are priced where the throw is really made.
- **DISTANCE COSTS CONTINUOUSLY.** `turnsAway` counted WHOLE turns, so any
  walk that fit the clock was free — and a first-map turn is 99 s, which at
  `WALK_SPEED` is four times across the map. It is a fraction of a turn now,
  and `timeLeft` is not read at all: what is left of a turn changes when a
  blow lands, not what it is worth. Whether the clock affords an ERRAND
  before the blow is still asked, in `plan.ts` where it belongs.

## THE SESSION THAT FOLLOWED, 2026-08-25 — five reports, all answered

Play played the rewrite the same night. The log is
`_tmp/telemetry-2026-08-24T21-57-52.log` (96 lines) and the new `[ai:plan]`
lines name every fault in it, which is what they were for.

- **"Тупой побежал сразу к аптечке — это для него слишком умно"**, and the
  third pig ran for one "хотя мог гранату кинуть во врага". Two causes, both
  in the log: a health crate was priced at FACE (DEN took one at hp50, then
  crossed the whole island for a second at hp100 — his plan line reads `->
  -1792,5376 (errand) walk 24931`), and the ERRAND was bounded only by the
  clock, which on a 99-second turn says yes to anything. Now a health crate
  is worth what it PUTS BACK (`acting.maxHealth`, the class's starting
  health — the engine still has no ceiling and that stands), and an errand
  must be a real DETOUR: a quarter of the walk the turn was making anyway,
  plus four tiles.
- **The crate rule took THREE readings and the first two were wrong.** "Вижу
  стреляю" was built first as "a crate never stands for election", then as
  "a blow in hand prices every crate to nothing". Play's ruling: "ум 0 —
  это не верно. он должен ВИДЕТЬ ящик… он должен играть как трёхлетний
  ребёнок", and "я б сделал своего рода рандом — тупой может и ящик взять,
  может и тупо стрельнуть", and "50 очков, но тупой это не различает."
  Nothing suppresses a crate now: the dumb eye SWAMPS the arithmetic at the
  bottom of the scale and `MISJUDGE` makes the outcome a toss.
  **MEASURED AND THROWN OUT**: taking the worth out of the dumb judgment
  altogether reads exactly like play's sentence and leaves the machine
  unable to finish mission 1 — no verdict in 3600 s against 402 with the
  worth in. The note is in the dumb eye so it is not tried a third time.
- **"Поиск пути ищет путь по точкам — но надо чтобы по дороге можно было
  выворачивать на них"**, and the earlier turn complaint was about the
  ALTERNATION, not about steering. The realign band goes 22.5° → 60° (the
  ceiling is geometry: 1040 units a second against 42° a second is an arc
  1400 across, wide at 60° and a loop at 90°), and the brain hands the next
  corner over a stride early (`TURN_IN`).
- **The FROG EFFECT** — "можно параллельно воде пустить прожектайл и он
  проскачет". It is in the exe and in the engine; it was NOT in the brain,
  whose dry run stopped at the waterline and priced every throw over water
  as drowned. It follows the hops now. The two places the ENGINE still
  disagrees with the exe are their own entry below.

## THE EVENING SESSION, 2026-08-25 — played, and the batch that came out of it

Play played it again the same evening (log
`_tmp/telemetry-2026-08-25T17-03-25.log`) and reported seven things across the
game, not only the brain. **All seven are built**; the record is in
docs/history/turns.md, weapons.md, view.md and frontend.md, and only the two
AI ones are worth carrying here because they change the model:

- **The dumb eye was arithmetically absent outside spitting distance** —
  `60 / (1 + tiles)` against a ±72 % misjudgment, on a map fifty tiles
  across. Resized to `240 / (1 + tiles / 8)`. The kill bonus was acquitted:
  it is `KILL_BONUS · wits`, under two points at mission one, and a hurt foe
  scores LOWER because a blow is capped at its target's health.
- **A judgment now carries two numbers** (`judged` with the eye, `believed`
  without): an ELECTION compares the want, a BAR (`ERRAND_WORTH`) tests the
  worth. Sizing the eye up without this turned the rare crate errand into
  every turn.
- **The circling was the turning circle**, not the pathfinder: a point closer
  than `2R·sin|off|` cannot be reached by a pig that walks and steers at
  once. `actuator.ts` asks the geometry before the stride now.

The reading after: `machine-mission` finishes at ~1357 s, four kills, 2v0
(against ~721 s, five kills, 1v0). Slower and explained — both sides now spend
their grenades for real and finish with rifles.

## THE EVENING RAN TO FOUR MORE PASSES, and mission 1 came back "всё отлично"

Play kept playing and reporting; each report was diagnosed out of the session
log or out of the exe, never guessed. The full write-ups are in
docs/history/turns.md, weapons.md, view.md, pig.md and frontend.md — what
matters here is that **every report play made on 2026-08-25 is answered**, and
the last word on the mission was "а так всё отлично на первой миссии
остальное". In order, and the ones that changed a MODEL rather than a number:

- **The eye is ADDED to the misjudged score, never misjudged with it**, and it
  measures what the LEGS pay (the greater of the walk to the mark and the line
  to the target). A three-year-old misjudges value, not distance.
- **A leg is walked into a ZONE** (`Order.walkTo.within`), sized by what the
  leg is for, and whether a bend can be taken on the move is the arc's own
  closed form — `|CT| = √(d² + R² − 2dR·sin|off|)` reaches the zone when
  `|CT| ≥ R − within`. That is the "промоделировать, как дойти" play asked
  for, without a simulation.
- **Out of reach with the route walked out is `close-in`, never a pass.** A
  blade's mark and its limit are the same `MELEE_NEAR`, so a hair short of the
  mark was already hopeless — which is what "подбежал вплотную и пропустил
  ход" was.
- **A loosed round is spent** — no branch on the gun/lob path had ever touched
  the inventory.
- **The corpse's bang is a real blast** (read: twenty points at 0x400 on land,
  ten at 0x800 in water and for a gib, damage kind 0 so it can gib the next
  pig), a charge under the trotters throws along the GROUND'S NORMAL, and a
  flight wears the FLYING clip until it touches.
- **The camera**: it only TURNS on a thrown body (the exe's mode 1), holds it a
  second after it lands and never rides back to the empty crater, keeps two
  pig-heights by RISING, and SHAKES at every bang on the exe's own curve.

The measurement across the day, `machine-mission`: **1357 → 508 → 343 → 269 →
331 s**, and the wall clock 66 s → 4 s.
